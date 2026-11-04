import { requireUser } from "../server/auth.js";
import { generateJson } from "../server/gemini.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { planPrompt } from "../server/prompts.js";
import { normalizePlan } from "../shared/normalize.js";
import { planRequestSchema } from "../shared/schemas.js";
import { currencyForPlace } from "../shared/currency.js";
import { ALL_NEEDS } from "../shared/types.js";

export const POST = handle(async (request) => {
  await requireUser(request); // signed-in, approved users only: nothing reaches Gemini otherwise
  const { brief, destination } = await parseBody(request, planRequestSchema);
  const needs = brief.needs ?? ALL_NEEDS;
  // A day-by-day plan is the long part; without it the answer is short.
  const maxOutputTokens = needs.itinerary ? 24576 : 8192;
  const { data, model } = await generateJson(planPrompt(brief, destination, needs), { maxOutputTokens, temperature: 0.6, label: "plan" });
  try {
    // Prices in the currency of the airport the trip starts from (the prompt asks Gemini for it).
    return json({ plan: normalizePlan(data, brief.days, needs, currencyForPlace(brief.origin)), model });
  } catch (err) {
    throw new HttpError(502, `Gemini's answer was incomplete (${err instanceof Error ? err.message : "unknown"}). Try again.`);
  }
});
