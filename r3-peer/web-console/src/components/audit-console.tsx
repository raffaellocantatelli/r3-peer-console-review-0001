import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  ShieldOff,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { sha256Hex } from "@/lib/r3-peer/canonical";
import {
  CHALLENGE,
  CHALLENGE_EXPECTED,
  CHALLENGE_FORMULA,
  CHANNEL_ID,
  DEFAULT_BASE_URL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_MESSAGE,
  DEFAULT_TEMPERATURE,
  ISSUE_URL,
  MODELS,
  PROTOCOL,
  TEST_ID,
} from "@/lib/r3-peer/constants";
import { githubComment } from "@/lib/r3-peer/github-comment";
import { runDeepseekAudit } from "@/lib/r3-peer/run-audit";
import type { AuditResult } from "@/lib/r3-peer/types";
import { cn } from "@/lib/utils";

const REVIEW_LOCK = true;

export function AuditConsole() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState<(typeof MODELS)[number]["id"]>("deepseek-flash");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    const forget = () => setApiKey("");
    window.addEventListener("pagehide", forget);
    return () => {
      window.removeEventListener("pagehide", forget);
      setApiKey("");
    };
  }, []);

  const canRun =
    !REVIEW_LOCK && apiKey.trim().length >= 8 && message.trim().length > 0 && !busy;

  async function onRun() {
    setBusy(true);
    setError(null);
    try {
      const out = await runDeepseekAudit({
        data: {
          apiKey: apiKey.trim(),
          message: message.trim(),
          model,
          baseUrl: baseUrl.trim() || DEFAULT_BASE_URL,
          maxTokens: DEFAULT_MAX_TOKENS,
          temperature: DEFAULT_TEMPERATURE,
        },
      });
      setResult(out);
      if (out.manifest.status === "ok") {
        toast("Chiamata registrata. Status ok.");
      } else {
        toast("Chiamata fallita. Vedi il manifest.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg.replace(/sk-[A-Za-z0-9_-]{6,}/g, "sk-[REDACTED]"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 pb-24 sm:px-6 sm:py-10 lg:px-8">
      <Header challengeOk={challengeOk} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <section className="rise-in-2 rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgba(28,24,20,0.1)] sm:p-6">
          <div className="mb-5 flex items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                Sessione
              </p>
              <h2 className="font-display text-2xl font-medium tracking-tight">Esegui {TEST_ID}</h2>
            </div>
            <Badge variant={REVIEW_LOCK ? "error" : "mute"}>
              {REVIEW_LOCK ? "review lock" : "chiave non persistita"}
            </Badge>
          </div>

          {REVIEW_LOCK ? (
            <div className="mb-5 rounded-lg bg-seal/10 px-4 py-3 text-sm leading-relaxed text-seal">
              Review R3-PEER/1.1 in corso (review-request-grok-0001). Non inserire una chiave API
              reale in questa console finché la review indipendente non è chiusa. Il challenge SHA-256
              resta verificabile senza chiave.
            </div>
          ) : null}

          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="api-key">Chiave DeepSeek (solo sessione)</Label>
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="api-key"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    name="deepseek-session-key"
                    type={showKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-…"
                    className="pl-10 pr-11 font-mono"
                    disabled={REVIEW_LOCK}
                  />
                  <button
                    type="button"
                    aria-label={showKey ? "Nascondi chiave" : "Mostra chiave"}
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-paper-2 hover:text-ink"
                  >
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setApiKey("");
                    toast("Chiave cancellata dalla memoria.");
                  }}
                >
                  Dimentica
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {REVIEW_LOCK
                  ? "Campo disabilitato durante la review. Nessuna chiave reale richiesta."
                  : "Transita una sola volta verso il server per la chiamata, poi sparisce. Non va in localStorage, file o registro."}
              </p>
            </div>

            <fieldset className="flex flex-col gap-2">
              <Label>Modello</Label>
              <div className="grid gap-2 sm:grid-cols-3">
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModel(m.id)}
                    className={cn(
                      "rounded-lg px-3 py-3 text-left shadow-[0_0_0_1px_rgba(28,24,20,0.12)] transition-[background-color,box-shadow] duration-150",
                      model === m.id ? "bg-ink text-paper shadow-none" : "bg-paper hover:bg-paper-2",
                    )}
                  >
                    <span className="block font-mono text-[12px] font-medium">{m.label}</span>
                    <span
                      className={cn(
                        "mt-1 block text-[12px] leading-snug",
                        model === m.id ? "text-paper/70" : "text-muted-foreground",
                      )}
                    >
                      {m.note}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-col gap-2">
              <Label htmlFor="message">Messaggio</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-24 font-mono text-[13px] leading-relaxed"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="base-url">Base URL</Label>
              <Input
                id="base-url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="font-mono text-[13px]"
              />
              <p className="text-sm text-muted-foreground">
                FATTO: documentazione ufficiale DeepSeek, {DEFAULT_BASE_URL}, senza /v1.
              </p>
            </div>

            <Button type="button" size="lg" disabled={!canRun} onClick={() => void onRun()}>
              {busy ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Chiamata in corso
                </>
              ) : (
                "Esegui chiamata audit"
              )}
            </Button>
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
          <RulesCard />
        </aside>
      </div>

      {result ? <ResultPanel result={result} /> : <EmptyLedger />}
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
              Registro di audit
            </h1>
          </div>
        </div>
        <a
          href={ISSUE_URL}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[12px] text-muted-foreground underline-offset-4 hover:text-ink hover:underline"
        >
          Issue #44
        </a>
      </div>
      <p className="max-w-2xl text-base leading-relaxed text-muted-foreground">
        Chiama DeepSeek, registra token, latenza e hash. Il costo in dollari non è un fatto: è una
        conversione successiva dal listino. La chiave vive solo in questa sessione.
      </p>
      <div className="flex flex-wrap gap-2">
        <Badge variant="fatto">Fatto</Badge>
        <Badge variant="inferenza">Inferenza</Badge>
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

function RulesCard() {
  return (
    <section className="rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgba(28,24,20,0.1)] sm:p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        Epistemica
      </p>
      <h2 className="mt-1 font-display text-xl font-medium">Cosa copiare su GitHub</h2>
      <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
        <li>
          <span className="text-ink">Sì —</span> manifest.json (hash, modello, token, latenza)
        </li>
        <li>
          <span className="text-ink">Sì —</span> body.txt (risposta del modello)
        </li>
        <li>
          <span className="text-ink">No —</span> request.json se contiene dati personali
        </li>
        <li>
          <span className="text-ink">Mai —</span> la chiave API
        </li>
      </ul>
      <p className="mt-4 flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
        <ShieldOff className="mt-0.5 size-4 shrink-0" />
        Non dimostra coscienza, identità persistente, né un canale automatico fra strumenti.
      </p>
    </section>
  );
}

function EmptyLedger() {
  return (
    <section className="rounded-xl border border-dashed border-border px-4 py-10 text-center sm:px-6">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
        Ledger
      </p>
      <p className="mt-2 font-display text-xl text-ink">Nessuna chiamata in questa sessione</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        {REVIEW_LOCK
          ? "Nessuna chiave richiesta. La review indipendente deve chiudersi prima di qualsiasi chiamata reale."
          : "Incolla la chiave, lascia il messaggio preimpostato, esegui. Il primo test usa Flash: basta che risponda, sia tracciabile, costi poco."}
      </p>
    </section>
  );
}

function ResultPanel({ result }: { result: AuditResult }) {
  const ok = result.manifest.status === "ok";
  const manifestText = JSON.stringify(result.manifest, null, 2);
  const comment = useMemo(() => githubComment(result), [result]);
  const usage = result.manifest.usage;

  return (
    <section className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgba(28,24,20,0.1)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            Run {result.run_id}
          </p>
          <h2 className="font-display text-2xl font-medium">Esito</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={ok ? "ok" : "error"}>{result.manifest.status}</Badge>
          <Badge variant="fatto">Fatto</Badge>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Modello richiesto" value={result.manifest.model_requested ?? "—"} />
        <Stat label="Modello restituito" value={result.manifest.model_returned ?? "—"} />
        <Stat
          label="Latenza"
          value={`${Math.round(result.manifest.latency_ms)} ms`}
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

      {ok ? (
        <article className="rounded-lg bg-paper px-4 py-3">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            body.txt
          </p>
          <p className="mt-2 text-base leading-relaxed whitespace-pre-wrap">{result.body || "—"}</p>
        </article>
      ) : (
        <article className="rounded-lg bg-seal/8 px-4 py-3 text-seal">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em]">
            {result.manifest.error_type}
          </p>
          <p className="mt-2 text-sm leading-relaxed">{result.manifest.error}</p>
        </article>
      )}

      <CopyBlock title="manifest.json" text={manifestText} />
      {ok ? <CopyBlock title="body.txt" text={result.body} /> : null}

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

      <CopyBlock title="Commento pronto per Issue #44" text={comment} />
    </section>
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
      <dd
        className={cn(
          "mt-1 break-all font-mono text-sm text-ink",
          tabular && "tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function CopyBlock({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-lg bg-ink text-paper">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-paper/70">{title}</p>
        <button
          type="button"
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 font-mono text-[11px] uppercase tracking-[0.12em] text-paper/80 hover:bg-white/8"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            toast("Copiato.");
            window.setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? "Copiato" : "Copia"}
        </button>
      </div>
      <pre className="max-h-64 overflow-auto px-3 pb-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-paper/90">
        {text}
      </pre>
    </div>
  );
}
