import { geminiKey, modelCandidates, thinkingFor } from "../server/gemini.js";
import { json } from "../server/http.js";
import { checkTables, isSupabaseConfigured } from "../server/supabase.js";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta";

/**
 * GET /api/health            → is the server configured? (never returns the key)
 * GET /api/health?check=1    → also checks the Supabase tables, lists the Gemini models
 *                              this key can use and times a tiny test call to each model.
 */
export async function GET(request: Request): Promise<Response> {
  const key = geminiKey();
  const base = { ok: true, gemini: Boolean(key), supabase: isSupabaseConfigured(), models: modelCandidates() };
  if (new URL(request.url).searchParams.get("check") !== "1") return json(base);
  const tables = base.supabase ? await checkTables() : undefined;
  if (!key) return json({ ...base, ...(tables ? { tables } : {}) });

  const headers = { "content-type": "application/json", "x-goog-api-key": key };
  let available: string[] = [];
  let listError: string | undefined;
  try {
    const r = await fetch(`${ENDPOINT}/models?pageSize=1000`, { headers, signal: AbortSignal.timeout(15_000) });
    if (r.ok) {
      const body = (await r.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
      available = (body.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /gemini/.test(m.name))
        .map((m) => m.name.replace(/^models\//, ""));
    } else listError = `HTTP ${r.status}`;
  } catch (e) {
    listError = (e as Error).name;
  }

  const ping = await Promise.all(base.models.map(async (model) => {
    const t0 = Date.now();
    try {
      const thinking = thinkingFor(model);
      const r = await fetch(`${ENDPOINT}/models/${encodeURIComponent(model)}:generateContent`, {
        method: "POST", headers, signal: AbortSignal.timeout(45_000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: 'Reply with only {"ok":true}' }] }],
          generationConfig: { responseMimeType: "application/json", maxOutputTokens: 64, ...(thinking ? { thinkingConfig: thinking } : {}) },
        }),
      });
      const detail = r.ok ? "" : (await r.text()).slice(0, 160);
      return { model, status: r.status, ms: Date.now() - t0, ...(detail ? { detail } : {}) };
    } catch (e) {
      return { model, status: (e as Error).name, ms: Date.now() - t0 };
    }
  }));

  return json({ ...base, ...(tables ? { tables } : {}), available, ...(listError ? { listError } : {}), ping });
}
