import { canonicalJson, sha256Hex } from "./canonical.ts";
import { PROTOCOL, TEST_ID } from "./constants.ts";
import { inferCostUsd } from "./pricing.ts";
import type { AuditManifest, VerifyCheck, VerifyResult } from "./types.ts";

const SECRET_RE =
  /sk-[A-Za-z0-9_-]{6,}|Bearer\s+\S+|api[_\s-]?key\s*[:=]\s*\S+|\*{2,}\d{4,}/i;

export type RequestKind = "public" | "private" | "unknown";

export function classifyRequest(value: unknown): RequestKind {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "unknown";
  const o = value as Record<string, unknown>;
  if (o.record === "request_public") return "public";
  if (typeof o.messages_sha256 === "string" && !Array.isArray(o.messages)) return "public";
  if (Array.isArray(o.messages)) return "private";
  return "unknown";
}

function runIdFrom(manifest: AuditManifest): string {
  if (typeof manifest.run_id === "string" && manifest.run_id.trim()) return manifest.run_id.trim();
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

async function hashObject(value: unknown): Promise<string> {
  return sha256Hex(canonicalJson(value));
}

export async function verifyRun(args: {
  manifestText: string;
  bodyText: string;
  requestPublicText?: string;
  requestPrivateText?: string;
  sample?: boolean;
}): Promise<VerifyResult> {
  const checks: VerifyCheck[] = [];
  const body = args.bodyText.replace(/^\uFEFF/, "");
  const rawManifest = args.manifestText.trim();
  const secretHit =
    scanSecret(rawManifest) ||
    scanSecret(body) ||
    scanSecret(args.requestPublicText ?? "") ||
    scanSecret(args.requestPrivateText ?? "");

  checks.push({
    id: "no_secret",
    epistemic: "FATTO",
    ok: !secretHit,
    label: "Nessun secret nel testo incollato",
    detail: secretHit
      ? "Trovato un pattern da chiave/token. Commento GitHub bloccato. Non copiare."
      : "Nessun pattern sk-/Bearer/api key nel testo.",
  });

  const invalid = (error: string, extra: VerifyCheck[]): VerifyResult => ({
    run_id: "invalid",
    manifest: {
      status: "error",
      started_at_utc: "",
      completed_at_utc: "",
      latency_ms: 0,
      request_sha256: "",
      error,
    },
    body,
    cost: null,
    checks: [...checks, ...extra],
    blocked: true,
    sample: Boolean(args.sample),
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
    return invalid("JSON non valido", [
      {
        id: "parse",
        epistemic: "FATTO",
        ok: false,
        label: "manifest.json è JSON",
        detail: "JSON non valido.",
      },
    ]);
  }

  const manifest = asManifest(parsed);
  if (!manifest) {
    return invalid("Manifest incompleto", [
      {
        id: "shape",
        epistemic: "FATTO",
        ok: false,
        label: "Campi minimi del manifest",
        detail: "Servono status, request_sha256, started_at_utc, completed_at_utc, latency_ms.",
      },
    ]);
  }

  checks.push({
    id: "shape",
    epistemic: "FATTO",
    ok: true,
    label: "Campi minimi del manifest",
    detail: "status, hash, timestamp e latenza presenti.",
  });

  const runId = runIdFrom(manifest);
  checks.push({
    id: "run_id",
    epistemic: "FATTO",
    ok: Boolean(manifest.run_id),
    label: "run_id nel manifest",
    detail: manifest.run_id
      ? `run_id=${manifest.run_id}`
      : "Assente. R3-PEER/1.1 lo richiede nel manifest, non solo nel path.",
  });

  if (manifest.protocol === PROTOCOL) {
    checks.push({
      id: "protocol",
      epistemic: "FATTO",
      ok: true,
      label: "protocol",
      detail: `Canone ${PROTOCOL}.`,
    });
  } else if (manifest.protocol === "R3-PEER/1.0") {
    checks.push({
      id: "protocol",
      epistemic: "FATTO",
      ok: false,
      label: "protocol",
      detail: "Manifest in 1.0. Canone attuale: R3-PEER/1.1. Non mescolare i due.",
    });
  } else if (manifest.protocol) {
    checks.push({
      id: "protocol",
      epistemic: "FATTO",
      ok: false,
      label: "protocol",
      detail: `Manifest ${manifest.protocol}; atteso ${PROTOCOL}.`,
    });
  } else {
    checks.push({
      id: "protocol",
      epistemic: "FATTO",
      ok: false,
      label: "protocol",
      detail: `Assente. Canone ${PROTOCOL}.`,
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

  await pushRequestChecks(checks, manifest, args.requestPublicText, args.requestPrivateText);

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
      ? `$${cost.usd.toFixed(6)} dal listino Flash ${cost.as_of} (hit ${cost.rates_usd_per_million.input_cache_hit}/${cost.tariff_band === "peak" ? "peak" : "off-peak"}). Non è un fatto del manifest.`
      : "Non convertibile: manca model_requested o usage.",
  });

  const blocked = checks.some((c) => c.id === "no_secret" && c.ok === false);

  return {
    run_id: runId,
    manifest,
    body,
    cost,
    checks,
    blocked,
    sample: Boolean(args.sample),
  };
}

async function pushRequestChecks(
  checks: VerifyCheck[],
  manifest: AuditManifest,
  publicText: string | undefined,
  privateText: string | undefined,
): Promise<void> {
  const publicRaw = publicText?.trim();
  if (publicRaw) {
    try {
      const parsed: unknown = JSON.parse(publicRaw);
      const kind = classifyRequest(parsed);
      if (kind !== "public") {
        checks.push({
          id: "request_public_sha256",
          epistemic: "FATTO",
          ok: false,
          label: "request_public.json",
          detail:
            kind === "private"
              ? "Questo è il request privato. Non va confrontato con request_sha256 da questo campo. Usa il pannello request.json, e solo se --save-prompt."
              : "JSON senza record=request_public né messages_sha256. Non confrontato con request_sha256.",
        });
      } else {
        const sha = await hashObject(parsed);
        if (sha === manifest.request_sha256) {
          checks.push({
            id: "request_public_not_private",
            epistemic: "FATTO",
            ok: false,
            label: "request_public ≠ request privato",
            detail: "Hash del file pubblico coincide con request_sha256. I due record devono restare distinti.",
          });
        }
        checks.push({
          id: "request_public_sha256",
          epistemic: "FATTO",
          ok: Boolean(manifest.request_public_sha256) && sha === manifest.request_public_sha256,
          label: "request_public_sha256",
          detail: !manifest.request_public_sha256
            ? "Manifest senza request_public_sha256. Non si usa request_sha256 come sostituto."
            : sha === manifest.request_public_sha256
              ? "Coincide. Questo file non contiene il prompt."
              : `Atteso ${manifest.request_public_sha256}, calcolato ${sha}.`,
        });
      }
    } catch {
      checks.push({
        id: "request_public_sha256",
        epistemic: "FATTO",
        ok: false,
        label: "request_public.json",
        detail: "JSON non valido.",
      });
    }
  } else {
    checks.push({
      id: "request_public_sha256",
      epistemic: "FATTO",
      ok: null,
      label: "request_public_sha256",
      detail: "Non ricalcolato: request_public.json non è stato incollato.",
    });
  }

  const privateRaw = privateText?.trim();
  if (privateRaw) {
    try {
      const parsed: unknown = JSON.parse(privateRaw);
      const kind = classifyRequest(parsed);
      if (kind !== "private") {
        checks.push({
          id: "request_sha256",
          epistemic: "FATTO",
          ok: false,
          label: "request.json privato",
          detail:
            kind === "public"
              ? "Questo è request_public.json. Non confrontare il suo hash con request_sha256."
              : "Forma non riconosciuta come request privato.",
        });
      } else {
        const sha = await hashObject(parsed);
        checks.push({
          id: "request_sha256",
          epistemic: "FATTO",
          ok: sha === manifest.request_sha256,
          label: "request_sha256 (privato, opt-in)",
          detail:
            sha === manifest.request_sha256
              ? "Coincide col request originale. Non copiare request.json su GitHub."
              : `Atteso ${manifest.request_sha256}, calcolato ${sha}.`,
        });
      }
    } catch {
      checks.push({
        id: "request_sha256",
        epistemic: "FATTO",
        ok: false,
        label: "request.json privato",
        detail: "JSON non valido.",
      });
    }
  } else {
    checks.push({
      id: "request_sha256",
      epistemic: "FATTO",
      ok: null,
      label: "request_sha256",
      detail: "Non ricalcolato. Il request privato esiste solo con --save-prompt e non va incollato di default.",
    });
  }
}
