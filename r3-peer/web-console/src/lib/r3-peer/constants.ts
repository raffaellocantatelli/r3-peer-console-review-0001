export const PROTOCOL = "R3-PEER/1.0";
export const CHANNEL_ID = "r3-peer-chatgpt-deepseek-20260913";
export const TEST_ID = "R3-PEER-001";
export const ISSUE_URL = "https://github.com/claudioterzi/Claudio/issues/44";

export const DEFAULT_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_MESSAGE =
  "R3-PEER test 001. Rispondi in una sola frase e identifica il modello che stai usando.";
export const DEFAULT_MAX_TOKENS = 256;
export const DEFAULT_TEMPERATURE = 0.2;

export const CHALLENGE = "3a87c7d9e57b17a597daac81beb50e91";
export const CHALLENGE_FORMULA = 'SHA256(challenge + "|ACK|DEEPSEEK")';
export const CHALLENGE_EXPECTED =
  "d5dfaae5e18918e7b558678eeb8e5853a6f885b1947dae4dfd504bbd49a6400a";

export const PRICING_SOURCE = "https://api-docs.deepseek.com/quick_start/pricing";
export const PRICING_AS_OF = "2026-09-13";

export const MODELS = [
  {
    id: "deepseek-flash",
    label: "deepseek-flash",
    family: "flash" as const,
    note: "ID ufficiale corrente. Serve DeepSeek-V4.1-Flash.",
  },
  {
    id: "deepseek-v4-flash",
    label: "deepseek-v4-flash",
    family: "flash" as const,
    note: "Alias legacy. Instrada a V4.1-Flash, tariffa Flash.",
  },
  {
    id: "deepseek-v4-pro",
    label: "deepseek-v4-pro",
    family: "pro" as const,
    note: "DeepSeek-V4-Pro-0813. Più costoso; per ragionamenti complessi.",
  },
] as const;

export type ModelId = (typeof MODELS)[number]["id"];
export type ModelFamily = "flash" | "pro";

/** USD per 1M tokens. FATTO del listino; l'applicazione al run è INFERENZA. */
export const TARIFF_USD_PER_MILLION = {
  flash: {
    inputCacheHit: { offPeak: 0.003, peak: 0.006 },
    inputCacheMiss: { offPeak: 0.15, peak: 0.3 },
    output: { offPeak: 0.6, peak: 1.2 },
  },
  pro: {
    inputCacheHit: { offPeak: 0.022, peak: 0.044 },
    inputCacheMiss: { offPeak: 0.66, peak: 1.32 },
    output: { offPeak: 1.98, peak: 3.96 },
  },
} as const;
