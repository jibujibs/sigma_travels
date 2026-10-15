import { geminiKey, modelCandidates } from "../server/gemini.js";
import { json } from "../server/http.js";

/** Reports whether the server is configured. Never returns the key itself. */
export function GET(): Response {
  return json({ ok: true, gemini: Boolean(geminiKey()), models: modelCandidates() });
}
