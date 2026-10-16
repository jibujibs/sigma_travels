import { generateJson } from "../server/gemini.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { recommendPrompt } from "../server/prompts.js";
import { normalizeRecommendations } from "../shared/normalize.js";
import { recommendRequestSchema } from "../shared/schemas.js";

export const POST = handle(async (request) => {
  const { brief } = await parseBody(request, recommendRequestSchema);
  const { data, model } = await generateJson(recommendPrompt(brief), { maxOutputTokens: 8192, label: "recommend" });
  const destinations = normalizeRecommendations(data);
  if (!destinations.length) throw new HttpError(502, "Gemini didn't suggest any destinations. Try again.");
  return json({ destinations, model });
});
