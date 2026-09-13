import type { ModelFamily } from "./constants.ts";

export type Epistemic = "FATTO" | "INFERENZA" | "IPOTESI" | "SIMULAZIONE" | "PROPOSTA";

export type TokenUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

export type RequestRecord = {
  base_url: string;
  model: string;
  messages: Array<{ role: "user"; content: string }>;
  max_tokens: number;
  temperature: number;
};

export type RequestPublicRecord = {
  record: "request_public";
  base_url: string;
  model: string;
  max_tokens: number;
  temperature: number;
  messages_sha256: string;
  messages_utf8_bytes: number;
  prompt_saved: boolean;
};

export type AuditManifest = {
  status: string;
  protocol?: string;
  test_id?: string;
  run_id?: string;
  started_at_utc: string;
  completed_at_utc: string;
  latency_ms: number;
  base_url?: string;
  model_requested?: string;
  model_returned?: string | null;
  request_sha256: string;
  request_public_sha256?: string;
  prompt_saved?: boolean;
  response_sha256?: string;
  body_sha256?: string;
  body_utf8_bytes?: number;
  body_empty?: boolean;
  body_source?: string;
  http_status?: number;
  usage?: TokenUsage;
  error_type?: string;
  error?: string;
  note?: string;
  run_dir?: string;
};

export type CostInference = {
  epistemic: "INFERENZA";
  usd: number;
  currency: "USD";
  model_family: ModelFamily;
  tariff_band: "peak" | "off-peak";
  started_at_utc: string;
  tokens: {
    prompt: number;
    cached: number;
    cache_miss: number;
    completion: number;
  };
  rates_usd_per_million: {
    input_cache_hit: number;
    input_cache_miss: number;
    output: number;
  };
  source: string;
  as_of: string;
  note: string;
};

export type VerifyCheck = {
  id: string;
  epistemic: Epistemic;
  ok: boolean | null;
  label: string;
  detail: string;
};

export type VerifyResult = {
  run_id: string;
  manifest: AuditManifest;
  body: string;
  cost: CostInference | null;
  checks: VerifyCheck[];
  blocked: boolean;
  sample: boolean;
};
