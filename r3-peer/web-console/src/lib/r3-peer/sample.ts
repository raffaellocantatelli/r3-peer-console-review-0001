/** SIMULAZIONE — non è una chiamata DeepSeek. Solo per provare il verifier. */
export const SAMPLE_BODY =
  "R3-PEER test 001. Sono un modello di verifica locale, non una chiamata reale.";

export const SAMPLE_REQUEST_PUBLIC = `{
  "base_url": "https://api.deepseek.com",
  "max_tokens": 256,
  "messages_sha256": "49ed837727b55d79cfaf73bda06d3fc978f5d2de46d3bbac2a9f2633586c49bd",
  "messages_utf8_bytes": 115,
  "model": "deepseek-v4-flash",
  "prompt_saved": false,
  "record": "request_public",
  "temperature": 0.2
}
`;

export const SAMPLE_MANIFEST = `{
  "status": "ok",
  "protocol": "R3-PEER/1.1",
  "test_id": "R3-PEER-001",
  "run_id": "sim-20260913-0001",
  "started_at_utc": "2026-09-13T17:00:00.000Z",
  "completed_at_utc": "2026-09-13T17:00:01.200Z",
  "latency_ms": 1200,
  "base_url": "https://api.deepseek.com",
  "model_requested": "deepseek-v4-flash",
  "model_returned": "deepseek-v4-flash",
  "prompt_saved": false,
  "request_sha256": "cd8c186c86ffe4da791ca0085ce05aad3a87d2f27b0f77caa9bb7e07f9836577",
  "request_public_sha256": "369e397b22818f6b1da5521d319774010c94c6fdcdca4670d500b4b3b8ffc638",
  "body_sha256": "7aff756850df7012114e9bd7731b4c650749b53e6868bf515ccd1d1ad33a1a35",
  "body_utf8_bytes": 77,
  "usage": {
    "prompt_tokens": 20,
    "completion_tokens": 18,
    "total_tokens": 38,
    "prompt_tokens_details": { "cached_tokens": 0 }
  },
  "note": "SIMULAZIONE. Non è una chiamata DeepSeek. Serve solo a provare il verifier."
}
`;
