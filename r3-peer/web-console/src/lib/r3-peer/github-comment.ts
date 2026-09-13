import { CHANNEL_ID, ISSUE_HARDENING_URL, ISSUE_URL, PROTOCOL, TEST_ID } from "./constants.ts";
import type { VerifyResult } from "./types.ts";

export function githubComment(result: VerifyResult): string {
  if (result.blocked) {
    return "Commento bloccato: il testo incollato contiene un pattern da secret. Non copiare su GitHub.";
  }

  const { manifest, body, cost, sample } = result;
  const costBlock = cost
    ? [
        "",
        "### INFERENZA — costo USD",
        "Non è un fatto del manifest. Conversione dal listino ufficiale DeepSeek.",
        "",
        "```json",
        JSON.stringify(cost, null, 2),
        "```",
      ].join("\n")
    : "\n### INFERENZA — costo USD\nNon calcolabile: usage o model_requested assenti.\n";

  const checks = result.checks
    .filter((c) => c.ok !== null)
    .map((c) => `- \`${c.id}\` ${c.ok ? "ok" : "FAIL"} — ${c.detail}`)
    .join("\n");

  const lines = [
    `## ${TEST_ID} — audit API DeepSeek`,
    "",
  ];
  if (sample) {
    lines.push(
      "> SIMULAZIONE. Non è un run reale. Non registrare come FATTO di chiamata.",
      "",
    );
  }
  lines.push(
    `**Protocollo:** \`${manifest.protocol ?? PROTOCOL}\``,
    `**Channel:** \`${CHANNEL_ID}\``,
    `**Run:** \`${result.run_id}\``,
    `**Issue test:** ${ISSUE_URL}`,
    `**Issue hardening:** ${ISSUE_HARDENING_URL}`,
    "",
    "Chiave API: **non presente**. Questa UI non la riceve.",
    "`request.json` non allegato.",
    "",
    "### FATTO — manifest.json",
    "",
    "```json",
    JSON.stringify(manifest, null, 2),
    "```",
    "",
    "### FATTO — body.txt",
    "",
    "```",
    body || "(vuoto)",
    "```",
    "",
    "### FATTO — verifiche locali",
    "",
    checks || "_nessuna_",
    costBlock,
    "",
    "### Non dimostra",
    "identità persistente del modello, coscienza, autenticazione crittografica, né un canale automatico ChatGPT ↔ DeepSeek. Dimostra soltanto che i file di un recorder sono internamente coerenti (hash del body, campi del manifest).",
    "",
  );
  return lines.join("\n");
}
