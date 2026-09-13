/** SIMULAZIONE — non è una chiamata DeepSeek. Solo per provare il verifier. */
export const SAMPLE_BODY =
  "R3-PEER test 001. Sono un modello di verifica locale, non una chiamata reale.";

export const SAMPLE_MANIFEST = `{
  "status": "ok",
  "protocol": "R3-PEER/1.0",
  "test_id": "R3-PEER-001",
  "started_at_utc": "2026-09-13T17:00:00.000Z",
  "completed_at_utc": "2026-09-13T17:00:01.200Z",
  "latency_ms": 1200,
  "base_url": "https://api.deepseek.com",
  "model_requested": "deepseek-flash",
  "model_returned": "deepseek-flash",
  "request_sha256": "ca01a3d88d8cf8a85e1ba454dd0b04bfa665073edae4b858987df8c3dae3ce05",
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
