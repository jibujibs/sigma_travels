import { generateJson } from "../server/gemini.js";
import { handle, json, parseBody } from "../server/http.js";
import { intentPrompt } from "../server/prompts.js";
import { normalizeIntent } from "../shared/normalize.js";
import { intentRequestSchema } from "../shared/schemas.js";

/** Reads the traveller's free text: which place (if one is named) and which parts of a trip they want. */
export const POST = handle(async (request) => {
  const { idea, origin } = await parseBody(request, intentRequestSchema);
  const { data, model } = await generateJson(intentPrompt(idea, origin), { maxOutputTokens: 1024, temperature: 0.1, label: "intent" });
  return json({ ...normalizeIntent(data), model });
});
