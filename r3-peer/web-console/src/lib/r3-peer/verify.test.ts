import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { SAMPLE_BODY, SAMPLE_MANIFEST } from "./sample.ts";
import { verifyRun } from "./verify.ts";

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

test("sample body hash matches the fixture", () => {
  const parsed = JSON.parse(SAMPLE_MANIFEST);
  assert.equal(sha(SAMPLE_BODY), parsed.body_sha256);
  assert.equal(Buffer.byteLength(SAMPLE_BODY, "utf8"), parsed.body_utf8_bytes);
});

test("verifier accepts the simulazione fixture", async () => {
  const out = await verifyRun({
    manifestText: SAMPLE_MANIFEST,
    bodyText: SAMPLE_BODY,
    sample: true,
  });
  assert.equal(out.blocked, false);
  assert.equal(out.sample, true);
  const body = out.checks.find((c) => c.id === "body_sha256");
  assert.equal(body?.ok, true);
  assert.equal(out.cost?.epistemic, "INFERENZA");
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
