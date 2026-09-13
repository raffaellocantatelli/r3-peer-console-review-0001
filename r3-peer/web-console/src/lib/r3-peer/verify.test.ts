import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { PROTOCOL } from "./constants.ts";
import { inferCostUsd } from "./pricing.ts";
import { SAMPLE_BODY, SAMPLE_MANIFEST, SAMPLE_REQUEST_PUBLIC } from "./sample.ts";
import { classifyRequest, verifyRun } from "./verify.ts";

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

test("canon protocol is 1.1, not mixed with 1.0", () => {
  assert.equal(PROTOCOL, "R3-PEER/1.1");
});

test("sample body hash matches the fixture", () => {
  const parsed = JSON.parse(SAMPLE_MANIFEST);
  assert.equal(sha(SAMPLE_BODY), parsed.body_sha256);
  assert.equal(Buffer.byteLength(SAMPLE_BODY, "utf8"), parsed.body_utf8_bytes);
  assert.equal(parsed.protocol, "R3-PEER/1.1");
  assert.equal(parsed.model_requested, "deepseek-v4-flash");
  assert.equal(parsed.run_id, "sim-20260913-0001");
  assert.notEqual(parsed.request_sha256, parsed.request_public_sha256);
});

test("request_public is not classified as the private request", () => {
  const pub = JSON.parse(SAMPLE_REQUEST_PUBLIC);
  assert.equal(classifyRequest(pub), "public");
  assert.equal(
    classifyRequest({
      base_url: "https://api.deepseek.com",
      messages: [{ role: "user", content: "x" }],
      model: "deepseek-v4-flash",
      max_tokens: 256,
      temperature: 0.2,
    }),
    "private",
  );
});

test("verifier accepts the simulazione fixture including request_public", async () => {
  const out = await verifyRun({
    manifestText: SAMPLE_MANIFEST,
    bodyText: SAMPLE_BODY,
    requestPublicText: SAMPLE_REQUEST_PUBLIC,
    sample: true,
  });
  assert.equal(out.blocked, false);
  assert.equal(out.sample, true);
  assert.equal(out.run_id, "sim-20260913-0001");
  assert.equal(out.checks.find((c) => c.id === "body_sha256")?.ok, true);
  assert.equal(out.checks.find((c) => c.id === "request_public_sha256")?.ok, true);
  assert.equal(out.checks.find((c) => c.id === "protocol")?.ok, true);
  assert.equal(out.checks.find((c) => c.id === "run_id")?.ok, true);
  assert.equal(out.cost?.epistemic, "INFERENZA");
  assert.equal(out.cost?.rates_usd_per_million.input_cache_miss, 0.22);
  assert.equal(out.cost?.rates_usd_per_million.output, 0.66);
  assert.equal(out.cost?.usd, 0.00001628);
});

test("pasting request_public does not compare it to request_sha256", async () => {
  const out = await verifyRun({
    manifestText: SAMPLE_MANIFEST,
    bodyText: SAMPLE_BODY,
    requestPublicText: SAMPLE_REQUEST_PUBLIC,
  });
  const pub = out.checks.find((c) => c.id === "request_public_sha256");
  const priv = out.checks.find((c) => c.id === "request_sha256");
  assert.equal(pub?.ok, true);
  assert.equal(priv?.ok, null);
  assert.equal(out.checks.find((c) => c.id === "request_public_not_private"), undefined);
});

test("pasting the public record into the private slot is a fail, not a hash match", async () => {
  const out = await verifyRun({
    manifestText: SAMPLE_MANIFEST,
    bodyText: SAMPLE_BODY,
    requestPrivateText: SAMPLE_REQUEST_PUBLIC,
  });
  const priv = out.checks.find((c) => c.id === "request_sha256");
  assert.equal(priv?.ok, false);
  assert.match(priv?.detail ?? "", /request_public/);
});

test("protocol 1.0 is rejected by the 1.1 verifier", async () => {
  const manifest = JSON.parse(SAMPLE_MANIFEST);
  manifest.protocol = "R3-PEER/1.0";
  const out = await verifyRun({
    manifestText: JSON.stringify(manifest),
    bodyText: SAMPLE_BODY,
  });
  assert.equal(out.checks.find((c) => c.id === "protocol")?.ok, false);
});

test("secret pattern blocks the GitHub comment path", async () => {
  const poisoned = SAMPLE_MANIFEST.replace("SIMULAZIONE", "sk-abcdefghijklmnopqrstuvwxyz012345");
  const out = await verifyRun({
    manifestText: poisoned,
    bodyText: SAMPLE_BODY,
  });
  assert.equal(out.blocked, true);
  assert.equal(out.checks.find((c) => c.id === "no_secret")?.ok, false);
});

test("ok + empty body is a fail, not a silent success", async () => {
  const manifest = JSON.parse(SAMPLE_MANIFEST);
  manifest.status = "ok";
  manifest.body_sha256 = sha("");
  manifest.body_utf8_bytes = 0;
  const out = await verifyRun({
    manifestText: JSON.stringify(manifest),
    bodyText: "",
  });
  assert.equal(out.checks.find((c) => c.id === "empty_body")?.ok, false);
});

test("Flash off-peak inference uses review-chatgpt-0002 rates", () => {
  const cost = inferCostUsd({
    modelRequested: "deepseek-v4-flash",
    startedAtUtc: "2026-09-13T17:00:00.000Z",
    usage: {
      prompt_tokens: 20,
      completion_tokens: 18,
      prompt_tokens_details: { cached_tokens: 0 },
    },
  });
  assert.ok(cost);
  assert.equal(cost.tariff_band, "off-peak");
  assert.equal(cost.rates_usd_per_million.input_cache_hit, 0.007);
  assert.equal(cost.rates_usd_per_million.input_cache_miss, 0.22);
  assert.equal(cost.rates_usd_per_million.output, 0.66);
  assert.equal(cost.usd, 0.00001628);
});
