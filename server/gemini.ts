import { HttpError } from "./http.js";

/**
 * Minimal Gemini REST client (no SDK). The key is read from the server
 * environment only and is sent in a header, never in the URL or to the browser.
 */
const FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3-flash-preview", "gemini-2.5-flash"];
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || undefined;
}

export function modelCandidates(): string[] {
  const pinned = process.env.GEMINI_MODEL?.trim();
  return [...new Set([pinned, ...FALLBACK_MODELS].filter((m): m is string => Boolean(m)))];
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
}

/** Parses JSON even if the model wrapped it in a code fence or added a stray sentence. */
export function parseLooseJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    /* fall through */
  }
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fall through */
    }
  }
  const first = t.search(/[[{]/);
  const last = Math.max(t.lastIndexOf("}"), t.lastIndexOf("]"));
  if (first >= 0 && last > first) return JSON.parse(t.slice(first, last + 1));
  throw new Error("No JSON in model reply");
}

const tooSlow = () => new HttpError(504, "Gemini took too long to answer. Try again, or choose fewer days.");

/** Lowest thinking setting each model family accepts (Gemini 2.5 uses a token budget, 3.x a level). */
export function thinkingFor(model: string): Record<string, unknown> | undefined {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-2\.5-pro/.test(model)) return { thinkingBudget: 128 };
  if (/^gemini-[3-9]/.test(model)) return { thinkingLevel: "low" };
  return undefined;
}

export async function generateJson(prompt: string, opts: { maxOutputTokens?: number; temperature?: number } = {}): Promise<{ data: unknown; model: string }> {
  const key = geminiKey();
  if (!key) throw new HttpError(503, "GEMINI_API_KEY is not set on the server. Add it to .env.local (local) or Vercel → Settings → Environment Variables.");

  // Finish before Vercel's function limit (maxDuration 60 s in vercel.json) so the user
  // gets a readable error instead of a bare 504. Override with GEMINI_TIMEOUT_MS.
  const deadline = Date.now() + (Number(process.env.GEMINI_TIMEOUT_MS) || 55_000);

  for (const model of modelCandidates()) {
    // Ask for minimal "thinking" so answers come back fast. If a model rejects the
    // setting, retry the same model once without it.
    for (const thinking of [thinkingFor(model), undefined]) {
      const remaining = deadline - Date.now();
      if (remaining < 3000) throw tooSlow();
      const started = Date.now();
      let res: Response;
      try {
        res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          signal: AbortSignal.timeout(remaining),
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: opts.temperature ?? 0.7,
              maxOutputTokens: opts.maxOutputTokens ?? 16384,
              ...(thinking ? { thinkingConfig: thinking } : {}),
            },
          }),
        });
      } catch (err) {
        const name = (err as Error)?.name;
        if (name === "TimeoutError" || name === "AbortError") throw tooSlow();
        throw new HttpError(502, "Couldn't reach Gemini. Check the server's internet connection.");
      }

      if (res.status === 404) break; // model not available for this key: try the next model
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        if (res.status === 400 && thinking && /thinking/i.test(detail)) continue; // retry without thinkingConfig
        if (res.status === 429) throw new HttpError(429, "Gemini rate limit reached. Wait a minute and try again.");
        if (res.status === 400 && /api key/i.test(detail)) throw new HttpError(502, "Gemini rejected the API key. Check GEMINI_API_KEY.");
        if (res.status === 403) throw new HttpError(502, "This Gemini key isn't allowed to use the API. Check the key's project settings.");
        console.error(`[gemini] ${model} ${res.status}`, detail.slice(0, 500));
        throw new HttpError(502, "Gemini returned an error. Try again.");
      }

      let body: GeminiResponse;
      try {
        body = (await res.json()) as GeminiResponse;
      } catch {
        throw tooSlow();
      }
      console.log(`[gemini] ${model} answered in ${Date.now() - started} ms`);
      if (body.promptFeedback?.blockReason) throw new HttpError(422, "Gemini declined this request. Try rewording your idea.");
      const cand = body.candidates?.[0];
      const text = (cand?.content?.parts ?? []).filter((p) => !p.thought).map((p) => p.text ?? "").join("");
      if (!text.trim()) throw new HttpError(502, cand?.finishReason === "MAX_TOKENS" ? "Gemini's answer was cut short. Try fewer days." : "Gemini returned an empty answer. Try again.");
      try {
        return { data: parseLooseJson(text), model };
      } catch {
        throw new HttpError(502, cand?.finishReason === "MAX_TOKENS" ? "Gemini's answer was cut short. Try fewer days." : "Gemini's answer couldn't be read. Try again.");
      }
    }
  }
  throw new HttpError(502, "None of the Gemini models are available for this key. Set GEMINI_MODEL to a model your key can use.");
}
