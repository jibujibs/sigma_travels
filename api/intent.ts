import { requireUser } from "../server/auth.js";
import { generateJson } from "../server/gemini.js";
import { handle, json, parseBody } from "../server/http.js";
import { intentPrompt } from "../server/prompts.js";
import { destinationFromText, normalizeIntent, originFromText } from "../shared/normalize.js";
import { intentRequestSchema } from "../shared/schemas.js";

/** Reads the traveller's free text: which place (if one is named) and which parts of a trip they want. */
export const POST = handle(async (request) => {
  await requireUser(request); // signed-in, approved users only: nothing reaches Gemini otherwise
  const { idea, origin } = await parseBody(request, intentRequestSchema);
  // If Gemini can't answer, the typed words still give From and To ("from Dubai to Kochi"), so the plan isn't lost.
  const read = await generateJson(intentPrompt(idea, origin), { maxOutputTokens: 1024, temperature: 0.1, label: "intent" })
    .catch((e) => { console.warn("[intent] Gemini failed, reading the words only:", e instanceof Error ? e.message : e); return null; });
  const intent = read ? normalizeIntent(read.data) : { destination: null, origin: null, needs: null };
  // What the traveller typed beats Gemini's guess (and never the home airport line in the prompt).
  // A typed route ("from Dubai to Kochi") also fixes the destination, keeping Gemini's country when it agrees.
  const from = originFromText(idea), to = destinationFromText(idea);
  const destination = from && to ? (intent.destination?.airport === to.airport ? intent.destination : to) : intent.destination ?? to;
  return json({
    ...intent,
    destination,
    origin: from ?? intent.origin ?? null,
    model: read?.model ?? "",
  });
});
