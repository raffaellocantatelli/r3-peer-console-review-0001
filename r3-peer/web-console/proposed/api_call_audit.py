#!/usr/bin/env python3
"""Audit one OpenAI-compatible chat completion call without storing credentials.

Claudio Terzi · C.Terzi

PROPOSTA R3-PEER/1.1 — unique Python caller. Not on claudioterzi/Claudio@main yet.

Always writes:
  manifest.json, body.txt, request_public.json  (and response.json on success)

Opt-in --save-prompt also writes:
  request.json  (private original request, including the prompt)

request_sha256 hashes the private request.
request_public_sha256 hashes request_public.json.
The two hashes must never be compared to each other.

USD cost is never written to the manifest (INFERENZA lives in the verifier UI).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from openai import OpenAI

PROTOCOL = "R3-PEER/1.1"
TEST_ID = "R3-PEER-001"
PRESET = {
    "r3-peer-001": {
        "message": "R3-PEER test 001. Rispondi in una sola frase e identifica il modello che stai usando.",
        "model": "deepseek-v4-flash",
        "base_url": "https://api.deepseek.com",
        "max_tokens": 256,
        "temperature": 0.2,
    }
}


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical(value) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def write_json(path: Path, value) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def redact(text: str, api_key: str | None = None) -> str:
    if api_key:
        text = text.replace(api_key, "[REDACTED]")
    text = re.sub(r"sk-[A-Za-z0-9_-]{6,}", "sk-[REDACTED]", text)
    text = re.sub(r"Bearer\s+\S+", "Bearer [REDACTED]", text, flags=re.I)
    text = re.sub(r"api[_\s-]?key\s*[:=]\s*\S+", "api key: [REDACTED]", text, flags=re.I)
    text = re.sub(r"\*{2,}\d{2,}", "[REDACTED]", text)
    return text[:2000]


def http_status_of(exc: BaseException) -> int | None:
    for attr in ("status_code", "status"):
        value = getattr(exc, attr, None)
        if isinstance(value, int):
            return value
    resp = getattr(exc, "response", None)
    value = getattr(resp, "status_code", None)
    return value if isinstance(value, int) else None


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--preset", choices=sorted(PRESET))
    p.add_argument("--message")
    p.add_argument("--model")
    p.add_argument("--base-url")
    p.add_argument("--out-dir", default="output/api_audit")
    p.add_argument("--max-tokens", type=int)
    p.add_argument("--temperature", type=float)
    p.add_argument("--api-key-env", default="DEEPSEEK_API_KEY")
    p.add_argument(
        "--save-prompt",
        action="store_true",
        help="Also write request.json with the full private prompt. request_public.json is always written.",
    )
    p.add_argument("--protocol", default=PROTOCOL)
    p.add_argument("--test-id", default=TEST_ID)
    args = p.parse_args()

    spec = PRESET.get(args.preset, {})
    message = args.message or spec.get("message")
    model = args.model or spec.get("model")
    base_url = args.base_url or spec.get("base_url")
    max_tokens = args.max_tokens if args.max_tokens is not None else spec.get("max_tokens", 1000)
    temperature = args.temperature if args.temperature is not None else spec.get("temperature", 0.2)

    if not message or not model or not base_url:
        raise SystemExit("Servono --preset r3-peer-001 oppure --message --model --base-url.")
    if not (1 <= max_tokens <= 8192):
        raise SystemExit("--max-tokens fuori intervallo.")
    if not (0 <= temperature <= 2):
        raise SystemExit("--temperature fuori intervallo.")

    api_key = os.getenv(args.api_key_env)
    if not api_key:
        raise SystemExit(f"Manca la variabile ambiente {args.api_key_env}.")

    run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    out = Path(args.out_dir) / run_id
    out.mkdir(parents=True, exist_ok=False)

    request_record = {
        "base_url": base_url,
        "model": model,
        "messages": [{"role": "user", "content": message}],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    request_bytes = canonical(request_record)
    request_public = {
        "record": "request_public",
        "base_url": base_url,
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages_sha256": sha256(canonical(request_record["messages"])),
        "messages_utf8_bytes": len(canonical(request_record["messages"])),
        "prompt_saved": bool(args.save_prompt),
    }
    public_bytes = canonical(request_public)

    write_json(out / "request_public.json", request_public)
    if args.save_prompt:
        write_json(out / "request.json", request_record)

    def write_manifest(manifest: dict) -> None:
        write_json(out / "manifest.json", manifest)
        print(json.dumps({"run_dir": str(out), **manifest}, ensure_ascii=False, indent=2))

    base_manifest = {
        "run_id": run_id,
        "protocol": args.protocol,
        "test_id": args.test_id,
        "base_url": base_url,
        "model_requested": model,
        "prompt_saved": bool(args.save_prompt),
        "request_sha256": sha256(request_bytes),
        "request_public_sha256": sha256(public_bytes),
        "note": "This proves a recorded request/response exchange with the configured endpoint; nothing more.",
    }

    started = now_utc()
    t0 = time.perf_counter()
    client = OpenAI(api_key=api_key, base_url=base_url)
    try:
        response = client.chat.completions.create(
            model=model,
            messages=request_record["messages"],
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except Exception as exc:
        write_manifest(
            {
                **base_manifest,
                "status": "error",
                "started_at_utc": started,
                "completed_at_utc": now_utc(),
                "latency_ms": round((time.perf_counter() - t0) * 1000, 3),
                "http_status": http_status_of(exc),
                "error_type": type(exc).__name__,
                "error": redact(str(exc), api_key),
            }
        )
        return 2

    raw = response.model_dump(mode="json")
    choice = (raw.get("choices") or [{}])[0]
    message_obj = choice.get("message") or {}
    content = message_obj.get("content") or ""
    reasoning = message_obj.get("reasoning_content") or ""
    body_source = "content"
    body = content
    if not body and reasoning:
        body = reasoning
        body_source = "reasoning_content"

    body_bytes = body.encode("utf-8")
    write_json(out / "response.json", raw)
    (out / "body.txt").write_bytes(body_bytes)

    empty = len(body_bytes) == 0
    usage = raw.get("usage") or {}
    write_manifest(
        {
            **base_manifest,
            "status": "empty_body" if empty else "ok",
            "started_at_utc": started,
            "completed_at_utc": now_utc(),
            "latency_ms": round((time.perf_counter() - t0) * 1000, 3),
            "model_returned": raw.get("model"),
            "response_sha256": sha256(canonical(raw)),
            "body_sha256": sha256(body_bytes),
            "body_utf8_bytes": len(body_bytes),
            "body_empty": empty,
            "body_source": body_source,
            "usage": usage,
        }
    )
    return 0 if not empty else 3


if __name__ == "__main__":
    sys.exit(main())
