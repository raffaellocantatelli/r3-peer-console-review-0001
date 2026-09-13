import { canonicalJson, sha256Hex } from "./canonical.ts";
import { PROTOCOL, TEST_ID } from "./constants.ts";
import { inferCostUsd } from "./pricing.ts";
import type { AuditManifest, RequestRecord, VerifyCheck, VerifyResult } from "./types.ts";

const SECRET_RE =
  /sk-[A-Za-z0-9_-]{6,}|Bearer\s+\S+|api[_\s-]?key\s*[:=]\s*\S+|\*{2,}\d{4,}/i;

function runIdFrom(manifest: AuditManifest): string {
  const dir = manifest.run_dir;
  if (typeof dir === "string" && dir.trim()) {
    const parts = dir.replace(/\\/g, "/").split("/").filter(Boolean);
    return parts[parts.length - 1] ?? "unknown";
  }
  return "unknown";
}

function asManifest(value: unknown): AuditManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.status !== "string") return null;
  if (typeof o.request_sha256 !== "string") return null;
  if (typeof o.started_at_utc !== "string") return null;
  if (typeof o.completed_at_utc !== "string") return null;
  if (typeof o.latency_ms !== "number") return null;
  return o as AuditManifest;
}

function scanSecret(text: string): string | null {
  const m = text.match(SECRET_RE);
  return m ? m[0].slice(0, 12) : null;
}

export async function verifyRun(args: {
  manifestText: string;
  bodyText: string;
  requestText?: string;
  sample?: boolean;
}): Promise<VerifyResult> {
  const checks: VerifyCheck[] = [];
  const body = args.bodyText.replace(/^\uFEFF/, "");
  const rawManifest = args.manifestText.trim();
  const secretHit =
    scanSecret(rawManifest) || scanSecret(body) || scanSecret(args.requestText ?? "");

  checks.push({
    id: "no_secret",
    epistemic: "FATTO",
    ok: !secretHit,
    label: "Nessun secret nel testo incollato",
    detail: secretHit
      ? "Trovato un pattern da chiave/token. Commento GitHub bloccato. Non copiare."
      : "Nessun pattern sk-/Bearer/api key nel testo.",
  });

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawManifest);
    checks.push({
      id: "parse",
      epistemic: "FATTO",
      ok: true,
      label: "manifest.json è JSON",
      detail: "Oggetto letto.",
    });
  } catch {
    checks.push({
      id: "parse",
      epistemic: "FATTO",
      ok: false,
      label: "manifest.json è JSON",
      detail: "JSON non valido.",
    });
    return {
      run_id: "invalid",
      manifest: {
        status: "error",
        started_at_utc: "",
        completed_at_utc: "",
        latency_ms: 0,
        request_sha256: "",
        error: "JSON non valido",
      },
      body,
      cost: null,
      checks,
      blocked: true,
      sample: Boolean(args.sample),
    };
  }

  const manifest = asManifest(parsed);
  if (!manifest) {
    checks.push({
      id: "shape",
      epistemic: "FATTO",
      ok: false,
      label: "Campi minimi del manifest",
      detail: "Servono status, request_sha256, started_at_utc, completed_at_utc, latency_ms.",
    });
    return {
      run_id: "invalid",
      manifest: {
        status: "error",
        started_at_utc: "",
        completed_at_utc: "",
        latency_ms: 0,
        request_sha256: "",
        error: "Manifest incompleto",
      },
      body,
      cost: null,
      checks,
      blocked: true,
      sample: Boolean(args.sample),
    };
  }

  checks.push({
    id: "shape",
    epistemic: "FATTO",
    ok: true,
    label: "Campi minimi del manifest",
    detail: "status, hash, timestamp e latenza presenti.",
  });

  const bodyBytes = new TextEncoder().encode(body);
  const bodySha = await sha256Hex(bodyBytes);
  const bodyShaTrim = await sha256Hex(body.replace(/\n$/, ""));

  if (manifest.body_sha256) {
    const exact = bodySha === manifest.body_sha256;
    const trimOk = !exact && bodyShaTrim === manifest.body_sha256;
    checks.push({
      id: "body_sha256",
      epistemic: "FATTO",
      ok: exact || trimOk,
      label: "body_sha256 ricalcolato",
      detail: exact
        ? "Coincide con SHA-256 UTF-8 di body.txt."
        : trimOk
          ? "Coincide solo togliendo un newline finale. Il file ha probabilmente un invio extra."
          : `Atteso ${manifest.body_sha256}, calcolato ${bodySha}.`,
    });
  } else {
    checks.push({
      id: "body_sha256",
      epistemic: "FATTO",
      ok: null,
      label: "body_sha256 ricalcolato",
      detail: "Campo assente nel manifest (tipico dei path di errore).",
    });
  }

  if (typeof manifest.body_utf8_bytes === "number") {
    checks.push({
      id: "body_utf8_bytes",
      epistemic: "FATTO",
      ok: manifest.body_utf8_bytes === bodyBytes.byteLength,
      label: "body_utf8_bytes",
      detail: `Manifest ${manifest.body_utf8_bytes}, locale ${bodyBytes.byteLength}.`,
    });
  }

  const emptyOk = manifest.status === "ok" && body.length === 0;
  checks.push({
    id: "empty_body",
    epistemic: "FATTO",
    ok: emptyOk ? false : true,
    label: "Risposta non vuota se status ok",
    detail: emptyOk
      ? "status ok ma body.txt vuoto. Non registrare come risposta completa (Issue #45)."
      : manifest.status === "empty_body" || manifest.body_empty
        ? "Il recorder ha già marcato il body vuoto."
        : "Ok.",
  });

  if (manifest.protocol) {
    checks.push({
      id: "protocol",
      epistemic: "FATTO",
      ok: manifest.protocol === PROTOCOL,
      label: "protocol",
      detail: `Manifest ${manifest.protocol}; atteso ${PROTOCOL}.`,
    });
  } else {
    checks.push({
      id: "protocol",
      epistemic: "FATTO",
      ok: null,
      label: "protocol",
      detail: "Assente. Il recorder su main non lo scrive ancora (Issue #45).",
    });
  }

  if (manifest.test_id) {
    checks.push({
      id: "test_id",
      epistemic: "FATTO",
      ok: manifest.test_id === TEST_ID,
      label: "test_id",
      detail: `Manifest ${manifest.test_id}; atteso ${TEST_ID}.`,
    });
  }

  const requestText = args.requestText?.trim();
  if (requestText) {
    try {
      const request = JSON.parse(requestText) as RequestRecord;
      const sha = await sha256Hex(canonicalJson(request));
      checks.push({
        id: "request_sha256",
        epistemic: "FATTO",
        ok: sha === manifest.request_sha256,
        label: "request_sha256 (opt-in)",
        detail:
          sha === manifest.request_sha256
            ? "Coincide. Non copiare request.json su GitHub se contiene dati personali."
            : `Atteso ${manifest.request_sha256}, calcolato ${sha}.`,
      });
    } catch {
      checks.push({
        id: "request_sha256",
        epistemic: "FATTO",
        ok: false,
        label: "request_sha256 (opt-in)",
        detail: "request.json non è JSON valido.",
      });
    }
  } else {
    checks.push({
      id: "request_sha256",
      epistemic: "FATTO",
      ok: null,
      label: "request_sha256",
      detail: "Non ricalcolato: request.json non è stato incollato (scelta predefinita).",
    });
  }

  checks.push({
    id: "response_sha256",
    epistemic: "FATTO",
    ok: null,
    label: "response_sha256",
    detail: "Dichiarato dal recorder. Non ricalcolato qui senza response.json.",
  });

  const cost =
    manifest.model_requested && manifest.usage
      ? inferCostUsd({
          modelRequested: manifest.model_requested,
          startedAtUtc: manifest.started_at_utc,
          usage: manifest.usage,
        })
      : null;

  checks.push({
    id: "cost",
    epistemic: "INFERENZA",
    ok: cost ? true : null,
    label: "Costo USD",
    detail: cost
      ? `$${cost.usd.toFixed(6)} dal listino ${cost.as_of}. Non è un fatto del manifest.`
      : "Non convertibile: manca model_requested o usage.",
  });

  const blocked = checks.some((c) => c.id === "no_secret" && c.ok === false);

  return {
    run_id: runIdFrom(manifest),
    manifest,
    body,
    cost,
    checks,
    blocked,
    sample: Boolean(args.sample),
  };
}
