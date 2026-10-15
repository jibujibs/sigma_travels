import type { PlanResponse, RecommendResponse, Recommendation, TripBrief } from "../../shared/types";

async function post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error("Couldn't reach the server. Is `npm run dev` running?");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  recommend: (brief: TripBrief, signal?: AbortSignal) => post<RecommendResponse>("/api/recommend", { brief }, signal),
  plan: (brief: TripBrief, d: Pick<Recommendation, "city" | "country" | "airport">, signal?: AbortSignal) =>
    post<PlanResponse>("/api/plan", { brief, destination: { city: d.city, country: d.country, airport: d.airport } }, signal),
};
