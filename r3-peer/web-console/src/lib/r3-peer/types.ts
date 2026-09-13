import type { ModelFamily } from "./constants";

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

export type AuditManifest = {
  status: "ok" | "error";
  started_at_utc: string;
  completed_at_utc: string;
  latency_ms: number;
  base_url?: string;
  model_requested?: string;
  model_returned?: string | null;
  request_sha256: string;
  response_sha256?: string;
  body_sha256?: string;
  body_utf8_bytes?: number;
  usage?: TokenUsage;
  error_type?: string;
  error?: string;
  note: string;
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

export type AuditResult = {
  run_id: string;
  manifest: AuditManifest;
  body: string;
  request: RequestRecord;
  cost: CostInference | null;
};
