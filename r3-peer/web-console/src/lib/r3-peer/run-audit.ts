import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { canonicalJson, sha256Hex } from "./canonical";
import { DEFAULT_BASE_URL } from "./constants";
import { inferCostUsd } from "./pricing";
import type { AuditManifest, AuditResult, RequestRecord, TokenUsage } from "./types";

const schema = z.object({
  apiKey: z.string().min(8).max(256),
  message: z.string().min(1).max(4000),
  model: z.string().min(1).max(80),
  baseUrl: z.string().url().max(200).default(DEFAULT_BASE_URL),
  maxTokens: z.number().int().min(1).max(8192).default(256),
  temperature: z.number().min(0).max(2).default(0.2),
});

function nowUtcMs(): string {
  return new Date().toISOString();
}

function redact(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/api[_\s-]?key\s*:\s*\S+/gi, "api key: [REDACTED]")
    .replace(/\*{2,}\d{2,}/g, "[REDACTED]")
    .slice(0, 2000);
}

function runId(): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  return `${stamp}-${rand}`;
}

function pickUsage(value: unknown): TokenUsage | undefined {
  if (!value || typeof value !== "object") return undefined;
  const u = value as Record<string, unknown>;
  const details =
    u.prompt_tokens_details && typeof u.prompt_tokens_details === "object"
      ? (u.prompt_tokens_details as Record<string, unknown>)
      : undefined;
  const completionDetails =
    u.completion_tokens_details && typeof u.completion_tokens_details === "object"
      ? (u.completion_tokens_details as Record<string, unknown>)
      : undefined;
  const out: TokenUsage = {};
  if (typeof u.prompt_tokens === "number") out.prompt_tokens = u.prompt_tokens;
  if (typeof u.completion_tokens === "number") out.completion_tokens = u.completion_tokens;
  if (typeof u.total_tokens === "number") out.total_tokens = u.total_tokens;
  if (typeof u.prompt_cache_hit_tokens === "number") {
    out.prompt_cache_hit_tokens = u.prompt_cache_hit_tokens;
  }
  if (typeof u.prompt_cache_miss_tokens === "number") {
    out.prompt_cache_miss_tokens = u.prompt_cache_miss_tokens;
  }
  if (details && typeof details.cached_tokens === "number") {
    out.prompt_tokens_details = { cached_tokens: details.cached_tokens };
  }
  if (completionDetails && typeof completionDetails.reasoning_tokens === "number") {
    out.completion_tokens_details = { reasoning_tokens: completionDetails.reasoning_tokens };
  }
  return out;
}

function roundMs(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export const runDeepseekAudit = createServerFn({ method: "POST" })
  .validator((data: unknown) => schema.parse(data))
  .handler(async ({ data }): Promise<AuditResult> => {
    const baseUrl = data.baseUrl.replace(/\/+$/, "");
    const request: RequestRecord = {
      base_url: baseUrl,
      model: data.model,
      messages: [{ role: "user", content: data.message }],
      max_tokens: data.maxTokens,
      temperature: data.temperature,
    };
    const requestBytes = new TextEncoder().encode(canonicalJson(request));
    const requestSha = await sha256Hex(requestBytes);
    const started = nowUtcMs();
    const t0 = performance.now();
    const id = runId();

    const endpoint = `${baseUrl}/chat/completions`;
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: data.model,
          messages: request.messages,
          max_tokens: data.maxTokens,
          temperature: data.temperature,
        }),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (err) {
      const latency = roundMs(performance.now() - t0);
      const manifest: AuditManifest = {
        status: "error",
        started_at_utc: started,
        completed_at_utc: nowUtcMs(),
        latency_ms: latency,
        base_url: baseUrl,
        model_requested: data.model,
        request_sha256: requestSha,
        error_type: err instanceof Error ? err.name : "Error",
        error: redact(err instanceof Error ? err.message : String(err)),
        note: "This proves a recorded request/response exchange with the configured endpoint; nothing more.",
      };
      return { run_id: id, manifest, body: "", request, cost: null };
    }

    const rawText = await response.text();
    let raw: Record<string, unknown> = {};
    try {
      raw = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      raw = { parse_error: true, http_status: response.status };
    }

    if (!response.ok) {
      const latency = roundMs(performance.now() - t0);
      const apiMessage =
        typeof raw.error === "object" && raw.error && "message" in raw.error
          ? String((raw.error as { message: unknown }).message)
          : rawText.slice(0, 500);
      const manifest: AuditManifest = {
        status: "error",
        started_at_utc: started,
        completed_at_utc: nowUtcMs(),
        latency_ms: latency,
        base_url: baseUrl,
        model_requested: data.model,
        request_sha256: requestSha,
        error_type: `HTTP_${response.status}`,
        error: redact(apiMessage),
        note: "This proves a recorded request/response exchange with the configured endpoint; nothing more.",
      };
      return { run_id: id, manifest, body: "", request, cost: null };
    }

    const choices = Array.isArray(raw.choices) ? raw.choices : [];
    const first = (choices[0] ?? {}) as {
      message?: { content?: string | null; reasoning_content?: string | null };
    };
    const body = first.message?.content ?? "";
    const bodyText = typeof body === "string" ? body : "";
    const bodyBytes = new TextEncoder().encode(bodyText);
    const responseSha = await sha256Hex(canonicalJson(raw));
    const bodySha = await sha256Hex(bodyBytes);
    const usage = pickUsage(raw.usage);
    const latency = roundMs(performance.now() - t0);

    const manifest: AuditManifest = {
      status: "ok",
      started_at_utc: started,
      completed_at_utc: nowUtcMs(),
      latency_ms: latency,
      base_url: baseUrl,
      model_requested: data.model,
      model_returned: typeof raw.model === "string" ? raw.model : null,
      request_sha256: requestSha,
      response_sha256: responseSha,
      body_sha256: bodySha,
      body_utf8_bytes: bodyBytes.byteLength,
      usage,
      note: "This proves a recorded request/response exchange with the configured endpoint; nothing more.",
    };

    const cost = inferCostUsd({
      modelRequested: data.model,
      startedAtUtc: started,
      usage,
    });

    return { run_id: id, manifest, body: bodyText, request, cost };
  });
