import {
  MODELS,
  TARIFF_USD_PER_MILLION,
  type ModelFamily,
  PRICING_AS_OF,
  PRICING_SOURCE,
} from "./constants";
import type { CostInference, TokenUsage } from "./types";

export function modelFamily(modelId: string): ModelFamily {
  const known = MODELS.find((m) => m.id === modelId);
  if (known) return known.family;
  if (modelId.includes("pro")) return "pro";
  return "flash";
}

/** Peak: 01:00–04:00 and 06:00–10:00 UTC, Monday–Friday. All else off-peak. */
export function isPeakUtc(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return (minutes >= 60 && minutes < 4 * 60) || (minutes >= 6 * 60 && minutes < 10 * 60);
}

export function inferCostUsd(args: {
  modelRequested: string;
  startedAtUtc: string;
  usage: TokenUsage | undefined;
}): CostInference | null {
  if (!args.usage) return null;
  const prompt = num(args.usage.prompt_tokens);
  const completion = num(args.usage.completion_tokens);
  if (prompt === null && completion === null) return null;

  const cached = num(args.usage.prompt_tokens_details?.cached_tokens) ?? 0;
  const promptSafe = prompt ?? 0;
  const completionSafe = completion ?? 0;
  const miss = Math.max(0, promptSafe - cached);
  const family = modelFamily(args.modelRequested);
  const peak = isPeakUtc(args.startedAtUtc);
  const band = peak ? "peak" : "offPeak";
  const tariff = TARIFF_USD_PER_MILLION[family];
  const hitRate = tariff.inputCacheHit[band];
  const missRate = tariff.inputCacheMiss[band];
  const outRate = tariff.output[band];
  const usd =
    (cached / 1_000_000) * hitRate +
    (miss / 1_000_000) * missRate +
    (completionSafe / 1_000_000) * outRate;

  return {
    epistemic: "INFERENZA",
    usd: Number(usd.toFixed(8)),
    currency: "USD",
    model_family: family,
    tariff_band: peak ? "peak" : "off-peak",
    started_at_utc: args.startedAtUtc,
    tokens: {
      prompt: promptSafe,
      cached,
      cache_miss: miss,
      completion: completionSafe,
    },
    rates_usd_per_million: {
      input_cache_hit: hitRate,
      input_cache_miss: missRate,
      output: outRate,
    },
    source: PRICING_SOURCE,
    as_of: PRICING_AS_OF,
    note: "Il costo non è un fatto del manifest: è una conversione dal listino DeepSeek vigente. Cache hit/miss e fascia oraria UTC influenzano il risultato.",
  };
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
