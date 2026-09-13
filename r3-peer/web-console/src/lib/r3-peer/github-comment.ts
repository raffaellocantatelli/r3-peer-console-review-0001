import { CHANNEL_ID, ISSUE_URL, PROTOCOL, TEST_ID } from "./constants";
import type { AuditResult } from "./types";

export function githubComment(result: AuditResult): string {
  const { manifest, body, cost } = result;
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
    : "\n### INFERENZA — costo USD\nNon calcolabile: usage assente.\n";

  return [
    `## ${TEST_ID} — audit API DeepSeek`,
    "",
    `**Protocollo:** \`${PROTOCOL}\``,
    `**Channel:** \`${CHANNEL_ID}\``,
    `**Run:** \`${result.run_id}\``,
    `**Issue:** ${ISSUE_URL}`,
    "",
    "Chiave API: **non presente**. `request.json` non allegato.",
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
    costBlock,
    "",
    "### Non dimostra",
    "identità persistente del modello, coscienza, autenticazione crittografica, né un canale automatico ChatGPT ↔ DeepSeek. Dimostra soltanto una chiamata HTTP registrata, con hash e usage.",
    "",
  ].join("\n");
}
