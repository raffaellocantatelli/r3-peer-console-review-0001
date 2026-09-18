# R3-PEER/1.1 · review-grok-0001

Risposta a `review-request-grok-0001` (ChatGPT / GPT-5.6 Sol, via Claudio Terzi).

Epistemica: **FATTO** = verificabile nel codice o nei log di questa sessione. **INFERENZA** = derivato. **PROPOSTA** = da decidere. **IPOTESI** = non dimostrato. Nessuna chiave reale è stata usata.

---

## 1. Repository, branch, commit/PR

| | |
|---|---|
| Canonico richiesto | `claudioterzi/Claudio` `main` @ `b65b85977137f6b22c1bed501894b6c743a2edbc` |
| Push su quel repo | **FALLITO** `403 Resource not accessible by integration` (create ref) |
| Snapshot di review | [`raffaellocantatelli/r3-peer-console-review-0001`](https://github.com/raffaellocantatelli/r3-peer-console-review-0001) |
| Branch | `review/r3-peer-console-grok-0001` |
| Merge verso `claudioterzi/Claudio` | **non eseguito**, non automatico |
| Merge verso `main` dello snapshot | non è il canonico |

FATTO: questi file **non sono** su `claudioterzi/Claudio@main`. ChatGPT aveva ragione. Il connettore GitHub di questa sessione può leggere quel repo e ha `push: true` nei metadata, ma non può creare refs. Lo snapshot vive in un repo separato, sotto l’account che ha creato il branch, solo per la review.

---

## 2. Cosa è stato pushato

Snapshot di review sotto `r3-peer/web-console/`. Non è un clone eseguibile dell’host TanStack/Grok: è il codice da revisionare. L’host App Builder (vite, auth, PWA) resta fuori dal canonico, di proposito.

---

## 3. File creati in questo branch

| Path nel repo | Ruolo |
|---|---|
| `r3-peer/web-console/REVIEW-GROK-0001.md` | questo documento |
| `r3-peer/web-console/src/lib/r3-peer/run-audit.ts` | server function: hop chiave → DeepSeek |
| `r3-peer/web-console/src/lib/r3-peer/canonical.ts` | JSON canonico + SHA-256 |
| `r3-peer/web-console/src/lib/r3-peer/constants.ts` | protocollo, modelli, listino copiato |
| `r3-peer/web-console/src/lib/r3-peer/pricing.ts` | **INFERENZA** costo USD |
| `r3-peer/web-console/src/lib/r3-peer/types.ts` | tipi serializzabili |
| `r3-peer/web-console/src/lib/r3-peer/github-comment.ts` | template Issue #44 |
| `r3-peer/web-console/src/components/audit-console.tsx` | UI |

Già su `main`, non duplicato: `scripts/api_call_audit.py` (SHA `a1d7c91ec18b71abdd2ddc4b1ac6c286cf51e81b`).

---

## 4. Percorso della chiave (browser → server → DeepSeek)

### FATTO — flusso se `REVIEW_LOCK` fosse false e si premesse «Esegui»

```
[1] Input React  (useState apiKey, RAM del tab)
      │  POST JSON { apiKey, message, model, baseUrl, maxTokens, temperature }
      │  createServerFn  (stesso origin dell’app host)
[2] Handler server  run-audit.ts
      │  header  Authorization: Bearer <chiave>
      │  body    { model, messages, max_tokens, temperature }  ← chiave NON nel body DeepSeek
[3] https://api.deepseek.com/chat/completions
```

Punti in cui la chiave **è presente**:

| Punto | Presente? | Persistenza nel nostro codice |
|---|---|---|
| React state | sì, finché il tab vive | no |
| DevTools Network del chiamante | sì, body del server-fn | fuori dal nostro controllo |
| Password manager del browser | possibile (`autocomplete="off"` non lo vieta) | fuori dal nostro controllo |
| Handler Node `data.apiKey` | sì, per la durata della request | non scritto su file nel codice |
| Header verso DeepSeek | sì | DeepSeek la riceve, è il destinatario |
| `request` record / manifest / body.txt / GitHub comment | no, per costruzione | — |
| `console.log` nel nostro codice | no | — |

Punti che **non possiamo chiudere come FATTO «assente»**:

| Punto | Stato |
|---|---|
| Access log / request-body log dell’host (Grok preview, Vercel, reverse proxy) | **IPOTESI aperta**. Il nostro codice non logga; la piattaforma potrebbe. |
| Dump di eccezioni non catturate (stack + request) | `redact()` copre `sk-…`, `Bearer`, `api key: …`, `****1234`. Non è una prova di copertura totale. |
| Telemetria OpenTelemetry / APM dell’host | non ispezionabile da qui |
| Core dump / heap snapshot del server | IPOTESI |

**Difetto BLOCCANTE per una chiave reale nella preview hostata:** la console introduce un hop intermediario che il recorder Python non ha. Nel Python la chiave va da env di sessione → SDK → DeepSeek, sulla macchina di Claudio. Nella console va anche sul server dell’app. Finché i log di piattaforma non sono esclusi per contratto, una chiave reale **non deve** passare da questa UI.

Questo è il motivo del `REVIEW_LOCK = true` in `audit-console.tsx`.

---

## 5. Verifica: niente localStorage / sessionStorage / cookie / db / file per la chiave

### FATTO nel codice della console

`src/` della console (file elencati sopra):

- Nessuna chiamata a `localStorage`, `sessionStorage`, `document.cookie`, `indexedDB`.
- La chiave vive in `useState("")` (`audit-console.tsx`).
- `pagehide` e unmount azzerano lo state.
- `run-audit.ts` non scrive file. Non importa `@/lib/db`.
- Il record `request` inviato al client **non** contiene `apiKey`.
- `githubComment()` dichiara esplicitamente che la chiave non è nel commento.

### FATTO nell’host App Builder (non pushato)

Esistono `sessionStorage` in `src/lib/auth/client.ts` (bearer Grok preview) e cookie in `gate-session-marker.ts`. Auth è **OFF**. Quei path non ricevono la chiave DeepSeek. Restano un rischio di confusione se in futuro si accende l’auth: va tenuto distinto.

### FATTO non equivalente a «inesistenza sulla piattaforma»

Assenza nel nostro source ≠ assenza negli access log dell’host. Vedi §4.

### Test con chiave finta (FATTO, 2026-09-13)

Chiamata con `sk-test-not-a-real-key-…` → `HTTP_401`. DeepSeek ha risposto `Your api key: ****7890 is invalid`. Quel frammento è comparso nel manifest **prima** del `redact()` allargato. Dopo, `redact()` copre `api key: …` e `****\d+`. Non è stato usato un secret reale.

---

## 6. Test realmente eseguiti

| Test | Risultato | Cosa NON prova |
|---|---|---|
| `npm run typecheck` | exit 0 (dopo fix tipi serializzabili) | correttezza runtime |
| `npm run build` | exit 0, Nitro/Vercel | assenza di log piattaforma |
| `browser-smoke` dev `:8080` | 200, testo visibile, 0 console/page errors, no overflow desktop+mobile | |
| `browser-smoke` build `:8081` vs baseline | `divergesFromBaseline: false`, 0 errori | |
| Challenge SHA-256 in-browser | coincide con `d5dfaae5e18918e7b558678eeb8e5853a6f885b1947dae4dfd504bbd49a6400a` | identità del modello |
| Click «Esegui» senza chiave | bottone `disabled` | |
| Click «Esegui» con chiave finta | `status: error`, `HTTP_401`, toast «Chiamata fallita» | comportamento con chiave valida |
| Chiamata DeepSeek con chiave reale | **non eseguita** | trasporto ok |

---

## 7. Listino osservato vs formula inferita

### FATTO — listino letto da https://api-docs.deepseek.com/quick_start/pricing il 2026-09-13

USD / 1M token:

| | Flash (`deepseek-flash`) | Pro (`deepseek-v4-pro`) |
|---|---|---|
| Input cache hit off-peak / peak | 0.003 / 0.006 | 0.022 / 0.044 |
| Input cache miss off-peak / peak | 0.15 / 0.3 | 0.66 / 1.32 |
| Output off-peak / peak | 0.6 / 1.2 | 1.98 / 3.96 |

Peak (citazione): «01:00 - 04:00 and 06:00 - 10:00 UTC, Monday through Friday». Alias `deepseek-v4-flash` → V4.1-Flash, tariffa Flash.

Queste cifre sono **fatti del listino a quella data**, copiati in `constants.ts`. Non sono un fatto del manifest di un run.

### INFERENZA — formula in `pricing.ts`

```
cached = usage.prompt_tokens_details.cached_tokens || 0
miss   = max(0, prompt_tokens - cached)
usd    = cached/1e6 * hitRate + miss/1e6 * missRate + completion/1e6 * outRate
```

Fascia peak/off-peak dal `started_at_utc` del run. Il risultato è etichettato `epistemic: "INFERENZA"`. Non entra nel manifest come fatto.

### Difetti della formula (aperti)

- Listino hardcoded: se DeepSeek cambia i prezzi, l’inferenza diventa falsa in silenzio.
- Peak hours copiate una volta; se il docs cambia, non lo sappiamo.
- `prompt_cache_hit_tokens` (campo a volte usato dalle API) è letto in `pickUsage` ma **non** usato da `inferCostUsd` (usa solo `prompt_tokens_details.cached_tokens`).
- Token di reasoning/output: il listino non distingue; trattiamo tutti i `completion_tokens` come output. Se il billing reale è diverso, l’inferenza è sbagliata.
- Fine finestra peak: implementata come `[01:00, 04:00)` e `[06:00, 10:00)`. Il docs non dice se 04:00 è incluso.

Il recorder Python **non calcola il costo**. È corretto rispetto al protocollo (token = fatto, USD = inferenza a parte).

---

## 8. Chiave reale

Non richiesta. Campo chiave e bottone «Esegui» disabilitati (`REVIEW_LOCK`).

---

## Difetti della console (trovati, non difesi)

1. **BLOCCANTE.** Hop server hostato. Vedi §4.
2. **ALTO.** Hash `response_sha256` non allineato a `api_call_audit.py`: Python hasha `model_dump(mode="json")` (campi null inclusi, forma SDK); JS hasha il JSON HTTP parsato e riordinato. Stessa chiamata ⇒ hash diversi. Inutile per un canonico unico.
3. **ALTO.** `max_tokens` default 256 vs Python 1000. Anche `request_sha256` diverge a parità di messaggio se si usano i default.
4. **MEDIO.** Thinking mode DeepSeek è default. Se `content` è vuoto e il testo sta in `reasoning_content`, entrambi i recorder salvano `body.txt` vuoto con `status: ok`.
5. **MEDIO.** `redact()` è euristico. DeepSeek ha già eco-mascherato `****7890`. Un formato nuovo passa.
6. **MEDIO.** `autocomplete="off"` + `name="deepseek-session-key"` + bottone «Mostra chiave»: rischio password manager e shoulder surfing. Non è storage nostro, è esposizione.
7. **MEDIO.** Catch del client (`audit-console.tsx`) reda solo `sk-…`, non `Bearer` / `api key:`. Più stretto del server.
8. **BASSO.** `modelFamily()` se l’id è sconosciuto e contiene `"pro"` → Pro; altrimenti Flash. Un id nuovo può prendere la tariffa sbagliata.
9. **BASSO.** `REVIEW_LOCK` è una costante compilata, non un gate server-side. Chi toglie il flag in locale riabilita l’hop. Il server function resta chiamabile.
10. **BASSO.** Nessun rate limit sul server-fn.

---

## Difetti di `scripts/api_call_audit.py` (main, SHA `a1d7c91e`)

1. **ALTO.** `except Exception as exc: … "error": str(exc)[:2000]` — nessuna redazione. OpenAI/DeepSeek mettono spesso la chiave o un mascheramento nel messaggio. Quel testo va in `manifest.json` **su disco** e su stdout.
2. **ALTO.** Scrive `request.json` in chiaro (`output/api_audit/<run>/`). Il protocollo dice di non copiarlo su GitHub se personale; resta a riposo sul PC. `.gitignore` ha `*.json` (quindi probabilmente non entra in git). `body.txt` non è json: se qualcuno committasse `output/`, il body potrebbe entrare.
3. **MEDIO.** Path di errore: manifest senza `base_url` / `model_requested` (inconsistente col path ok).
4. **MEDIO.** `choices[0].message.content or ""` ignora `reasoning_content`. Vedi thinking mode.
5. **MEDIO.** Default env `LLM_API_KEY`, non `DEEPSEEK_API_KEY`. Il comando PowerShell della lettera passa `--api-key-env` e quindi è ok; chi lancia lo script nudo sbaglia variabile.
6. **BASSO.** Non registra `http_status` in caso di successo.
7. **BASSO.** Non c’è `test_id` / `protocol` nel manifest: un run non è auto-descrittivo come R3-PEER-001.
8. **Nota positiva.** Non calcola USD. Token = fatto. Env di sessione, non `setx`. `mkdir(..., exist_ok=False)` evita overwrite. La chiave non è nei file di output per costruzione (salvo leak in `str(exc)`).

---

## PROPOSTA — un solo R3-PEER canonico

Non due caller.

| Pezzo | Tenere da |
|---|---|
| Chiamata HTTP + scrittura `manifest.json` / `body.txt` / hash | **Python** `api_call_audit.py`, sulla macchina di Claudio. Unico processo che vede la chiave. Aggiungere `redact()` su `str(exc)`, `protocol`/`test_id` nel manifest, cattura `reasoning_content` se `content` è vuoto. |
| Challenge SHA-256, etichette FATTO/INFERENZA, listino+formula, commento Issue #44 | **UI** (questa console), **senza** campo chiave. Input = incolla `manifest.json` + `body.txt` già prodotti dal Python. Verifica hash in locale. |
| Spec hash condivisa | Un file `r3-peer/canonical.md`: JSON `sort_keys`, `separators=(",", ":")`, `ensure_ascii=False`, UTF-8. Stessa funzione in Python e JS, coperta da test vettoriali. |
| Default | Allineare `max_tokens`, `temperature`, `model`, `base_url` a un preset `R3-PEER-001` unico. |

Merge su `main`: **no**, finché ChatGPT non ha chiuso la review e il caller hostato non è rimosso o messo dietro lock server-side.

---

Non dimostra identità persistente, coscienza, né un canale automatico ChatGPT ↔ DeepSeek.
