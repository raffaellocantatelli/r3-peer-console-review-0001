import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from "react";
import {
  Check,
  Copy,
  FileJson,
  FileText,
  LoaderCircle,
  ShieldOff,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sha256Hex } from "@/lib/r3-peer/canonical.ts";
import {
  CHALLENGE,
  CHALLENGE_EXPECTED,
  CHALLENGE_FORMULA,
  CHANNEL_ID,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MESSAGE,
  DEFAULT_TEMPERATURE,
  ISSUE_HARDENING_URL,
  ISSUE_URL,
  PROTOCOL,
  TEST_ID,
} from "@/lib/r3-peer/constants.ts";
import { githubComment } from "@/lib/r3-peer/github-comment.ts";
import { SAMPLE_BODY, SAMPLE_MANIFEST } from "@/lib/r3-peer/sample.ts";
import { verifyRun } from "@/lib/r3-peer/verify.ts";
import type { VerifyCheck, VerifyResult } from "@/lib/r3-peer/types.ts";
import { cn } from "@/lib/utils";

const PYTHON_CMD = `python scripts/api_call_audit.py --preset r3-peer-001 --api-key-env DEEPSEEK_API_KEY`;

export function AuditConsole() {
  const [manifestText, setManifestText] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [requestText, setRequestText] = useState("");
  const [showRequest, setShowRequest] = useState(false);
  const [sample, setSample] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [challengeOk, setChallengeOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void sha256Hex(`${CHALLENGE}|ACK|DEEPSEEK`).then((hex) => {
      if (!cancelled) setChallengeOk(hex === CHALLENGE_EXPECTED);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const canVerify = manifestText.trim().length > 2 && !busy;

  async function onVerify() {
    setBusy(true);
    setError(null);
    try {
      const out = await verifyRun({
        manifestText,
        bodyText,
        requestText: showRequest ? requestText : undefined,
        sample,
      });
      setResult(out);
      if (out.blocked) toast("Verifica bloccata: possibile secret nel testo.");
      else toast("Verifica locale completata.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function loadSample() {
    setManifestText(SAMPLE_MANIFEST);
    setBodyText(SAMPLE_BODY);
    setRequestText("");
    setShowRequest(false);
    setSample(true);
    setResult(null);
    toast("Esempio di simulazione caricato. Non è una chiamata reale.");
  }

  function clearAll() {
    setManifestText("");
    setBodyText("");
    setRequestText("");
    setSample(false);
    setResult(null);
    setError(null);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
      <Header challengeOk={challengeOk} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="rise-in-2 rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgba(28,24,20,0.1)] sm:p-6">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Verifier
              </p>
              <h2 className="font-display text-2xl font-medium tracking-tight">
                Controlla {TEST_ID}
              </h2>
            </div>
            <Badge variant="ok">nessun secret</Badge>
          </div>

          <div className="mb-5 rounded-lg bg-ok/10 px-4 py-3 text-sm leading-relaxed text-ok">
            Questa UI non chiama DeepSeek e non accetta chiavi. Incolla i file prodotti in locale
            dal recorder Python. Hardening:{" "}
            <a href={ISSUE_HARDENING_URL} className="underline underline-offset-4" target="_blank" rel="noreferrer">
              Issue #45
            </a>
            .
          </div>

          <div className="flex flex-col gap-5">
            <PasteField
              id="manifest"
              label="manifest.json"
              icon={<FileJson className="size-4" />}
              value={manifestText}
              accept=".json,application/json"
              onChange={(v) => {
                setManifestText(v);
                setSample(false);
              }}
            />
            <PasteField
              id="body"
              label="body.txt"
              icon={<FileText className="size-4" />}
              value={bodyText}
              accept=".txt,text/plain"
              onChange={(v) => {
                setBodyText(v);
                setSample(false);
              }}
            />

            <div>
              <button
                type="button"
                className="min-h-11 text-left text-sm text-muted-foreground underline-offset-4 hover:text-ink hover:underline"
                onClick={() => setShowRequest((v) => !v)}
              >
                {showRequest
                  ? "Nascondi request.json"
                  : "Opzionale: verifica anche request.json (solo se non contiene dati personali)"}
              </button>
              {showRequest ? (
                <div className="mt-3">
                  <PasteField
                    id="request"
                    label="request.json"
                    icon={<FileJson className="size-4" />}
                    value={requestText}
                    accept=".json,application/json"
                    onChange={setRequestText}
                  />
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="lg" disabled={!canVerify} onClick={() => void onVerify()}>
                {busy ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Calcolo hash
                  </>
                ) : (
                  "Verifica in locale"
                )}
              </Button>
              <Button type="button" variant="outline" size="lg" onClick={loadSample}>
                Esempio simulazione
              </Button>
              <Button type="button" variant="ghost" size="lg" onClick={clearAll}>
                Pulisci
              </Button>
            </div>
            {error ? (
              <p className="flex items-start gap-2 text-sm text-seal">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {error}
              </p>
            ) : null}
          </div>
        </section>

        <aside className="rise-in-3 flex flex-col gap-5">
          <ProtocolCard challengeOk={challengeOk} />
          <CallerCard />
        </aside>
      </div>

      {result ? <ResultPanel result={result} /> : <EmptyLedger />}
    </div>
  );
}

function PasteField({
  id,
  label,
  value,
  accept,
  icon,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  accept: string;
  icon: ReactNode;
  onChange: (value: string) => void;
}) {
  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    onChange(await file.text());
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="flex items-center gap-2">
          {icon}
          {label}
        </Label>
        <label className="inline-flex min-h-11 cursor-pointer items-center font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-ink">
          Apri file
          <input type="file" accept={accept} className="hidden" onChange={(e) => void onFile(e)} />
        </label>
      </div>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="min-h-32 font-mono text-[13px] leading-relaxed"
      />
    </div>
  );
}

function Header({ challengeOk }: { challengeOk: boolean | null }) {
  return (
    <header className="rise-in flex flex-col gap-5 border-b border-border pb-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Mark />
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              {PROTOCOL} · {CHANNEL_ID}
            </p>
            <h1 className="font-display text-[2rem] leading-none font-medium tracking-tight sm:text-[2.4rem]">
              Verifier di audit
            </h1>
          </div>
        </div>
        <div className="flex gap-3 font-mono text-[12px]">
          <a
            href={ISSUE_URL}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground underline-offset-4 hover:text-ink hover:underline"
          >
            #44
          </a>
          <a
            href={ISSUE_HARDENING_URL}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground underline-offset-4 hover:text-ink hover:underline"
          >
            #45
          </a>
        </div>
      </div>
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
        Un solo caller: Python, sulla macchina che detiene la chiave. Qui si verificano hash e
        si formatta il commento. Il costo in dollari resta un’inferenza dal listino.
      </p>
      <div className="flex flex-wrap gap-2">
        <Badge variant="fatto">Fatto</Badge>
        <Badge variant="inferenza">Inferenza</Badge>
        <Badge variant="simulazione">Simulazione</Badge>
        {challengeOk === true ? <Badge variant="ok">Challenge SHA-256 verificato</Badge> : null}
        {challengeOk === false ? <Badge variant="error">Challenge non coincide</Badge> : null}
      </div>
    </header>
  );
}

function Mark() {
  return (
    <span
      aria-hidden="true"
      className="relative flex size-12 shrink-0 items-center justify-center rounded-lg bg-ink text-paper"
    >
      <span className="font-display text-lg font-medium tracking-tight">R3</span>
      <span className="absolute top-1.5 right-1.5 size-1.5 bg-seal" />
    </span>
  );
}

function ProtocolCard({ challengeOk }: { challengeOk: boolean | null }) {
  return (
    <section className="rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgba(28,24,20,0.1)] sm:p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        Challenge locale
      </p>
      <h2 className="mt-1 font-display text-xl font-medium">Handshake Issue #44</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Verifica riproducibile, senza rete e senza chiave. Dimostra solo che la formula è corretta.
      </p>
      <dl className="mt-4 space-y-3 font-mono text-[12px] leading-relaxed">
        <div>
          <dt className="text-muted-foreground">challenge</dt>
          <dd className="break-all text-ink">{CHALLENGE}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{CHALLENGE_FORMULA}</dt>
          <dd className="break-all text-ink">{CHALLENGE_EXPECTED}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm">
        {challengeOk === null ? "Calcolo in corso…" : null}
        {challengeOk === true ? (
          <span className="text-ok">Coincide. FATTO verificato in questa sessione.</span>
        ) : null}
        {challengeOk === false ? (
          <span className="text-seal">Non coincide. Non registrare come fatto.</span>
        ) : null}
      </p>
    </section>
  );
}

function CallerCard() {
  const [copied, setCopied] = useState(false);
  return (
    <section className="rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgba(28,24,20,0.1)] sm:p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        Caller Python
      </p>
      <h2 className="mt-1 font-display text-xl font-medium">Unico processo con la chiave</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Non lanciare un run reale finché l’hardening di{" "}
        <a href={ISSUE_HARDENING_URL} className="text-ink underline underline-offset-4" target="_blank" rel="noreferrer">
          Issue #45
        </a>{" "}
        non è nel recorder canonico. Env di sessione, mai persistente.
      </p>
      <pre className="mt-4 overflow-auto rounded-lg bg-ink px-3 py-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-paper">
        {PYTHON_CMD}
      </pre>
      <button
        type="button"
        className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground hover:text-ink"
        onClick={async () => {
          await navigator.clipboard.writeText(PYTHON_CMD);
          setCopied(true);
          toast("Comando copiato.");
          window.setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copiato" : "Copia comando"}
      </button>
      <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
        <li>
          Preset: {DEFAULT_BASE_URL}, deepseek-flash, max_tokens {DEFAULT_MAX_TOKENS}, temperature{" "}
          {DEFAULT_TEMPERATURE}.
        </li>
        <li className="break-words">Messaggio: {DEFAULT_MESSAGE}</li>
        <li>
          <ShieldOff className="mr-1 inline size-4 align-text-bottom" />
          Mai la chiave, mai request.json se personale.
        </li>
      </ul>
    </section>
  );
}

function EmptyLedger() {
  return (
    <section className="rounded-xl border border-dashed border-border px-4 py-10 text-center sm:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        Ledger
      </p>
      <p className="mt-2 font-display text-xl text-ink">Nessun file in questa sessione</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Incolla manifest.json e body.txt, oppure carica l’esempio di simulazione. Nessuna chiave
        richiesta.
      </p>
    </section>
  );
}

function ResultPanel({ result }: { result: VerifyResult }) {
  const comment = useMemo(() => githubComment(result), [result]);
  const fails = result.checks.filter((c) => c.ok === false).length;
  const usage = result.manifest.usage;

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgba(28,24,20,0.1)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Run {result.run_id}
          </p>
          <h2 className="font-display text-2xl font-medium">Esito verifica</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {result.sample ? <Badge variant="simulazione">Simulazione</Badge> : null}
          <Badge variant={result.blocked || fails ? "error" : "ok"}>
            {result.blocked ? "bloccato" : fails ? `${fails} fail` : result.manifest.status}
          </Badge>
          <Badge variant="fatto">Fatto</Badge>
        </div>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {result.checks.map((c) => (
          <CheckRow key={c.id} check={c} />
        ))}
      </ul>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Modello richiesto" value={result.manifest.model_requested ?? "—"} />
        <Stat label="Modello restituito" value={result.manifest.model_returned ?? "—"} />
        <Stat
          label="Latenza"
          value={
            typeof result.manifest.latency_ms === "number"
              ? `${Math.round(result.manifest.latency_ms)} ms`
              : "—"
          }
          tabular
        />
        <Stat
          label="Token totali"
          value={
            typeof usage?.total_tokens === "number"
              ? usage.total_tokens.toLocaleString("it-IT")
              : "—"
          }
          tabular
        />
      </dl>

      <article className="rounded-lg bg-paper px-4 py-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          body.txt
        </p>
        <p className="mt-2 text-base leading-relaxed whitespace-pre-wrap">{result.body || "—"}</p>
      </article>

      <div className="rounded-lg bg-paper-2 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            Inferenza — costo USD
          </p>
          <Badge variant="inferenza">Inferenza</Badge>
        </div>
        {result.cost ? (
          <div className="mt-2 flex flex-col gap-1">
            <p className="font-display text-3xl font-medium tabular-nums tracking-tight">
              ${result.cost.usd.toFixed(6)}
            </p>
            <p className="text-sm text-muted-foreground">
              {result.cost.model_family} · {result.cost.tariff_band} · listino {result.cost.as_of} ·
              cache hit {result.cost.tokens.cached} / miss {result.cost.tokens.cache_miss} / out{" "}
              {result.cost.tokens.completion}
            </p>
            <p className="text-sm text-muted-foreground">{result.cost.note}</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Usage assente: costo non convertito.</p>
        )}
      </div>

      <CopyBlock title="Commento pronto per Issue #44" text={comment} blocked={result.blocked} />
    </section>
  );
}

function CheckRow({ check }: { check: VerifyCheck }) {
  const tone =
    check.ok === true ? "text-ok" : check.ok === false ? "text-seal" : "text-muted-foreground";
  return (
    <li className="rounded-lg bg-paper px-3 py-3">
      <p className={cn("font-mono text-[11px] uppercase tracking-[0.12em]", tone)}>
        {check.ok === true ? "ok" : check.ok === false ? "fail" : "n/a"} · {check.epistemic} ·{" "}
        {check.label}
      </p>
      <p className="mt-1 text-sm leading-snug text-muted-foreground">{check.detail}</p>
    </li>
  );
}

function Stat({
  label,
  value,
  tabular,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div className="rounded-lg bg-paper px-3 py-3">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </dt>
      <dd className={cn("mt-1 break-all font-mono text-sm text-ink", tabular && "tabular-nums")}>
        {value}
      </dd>
    </div>
  );
}

function CopyBlock({
  title,
  text,
  blocked,
}: {
  title: string;
  text: string;
  blocked?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg bg-ink text-paper">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/70">{title}</p>
        <button
          type="button"
          disabled={blocked}
          className="inline-flex h-11 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] uppercase tracking-[0.12em] text-paper/80 hover:bg-white/8 disabled:opacity-40"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast("Copiato.");
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copiato" : blocked ? "Bloccato" : "Copia"}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto px-3 pb-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-paper/90">
        {text}
      </pre>
    </div>
  );
}
