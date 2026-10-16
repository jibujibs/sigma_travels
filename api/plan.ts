import { generateJson } from "../server/gemini.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { planPrompt } from "../server/prompts.js";
import { normalizePlan } from "../shared/normalize.js";
import { planRequestSchema } from "../shared/schemas.js";

export const POST = handle(async (request) => {
  const { brief, destination } = await parseBody(request, planRequestSchema);
  const { data, model } = await generateJson(planPrompt(brief, destination), { maxOutputTokens: 24576, temperature: 0.6, label: "plan" });
  try {
    return json({ plan: normalizePlan(data, brief.days), model });
  } catch (err) {
    throw new HttpError(502, `Gemini's plan was incomplete (${err instanceof Error ? err.message : "unknown"}). Try again.`);
  }
});
