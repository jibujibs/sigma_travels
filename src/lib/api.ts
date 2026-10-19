import type { IntentResponse, PlanResponse, RecommendResponse, Recommendation, TripBrief, TripPlan } from "../../shared/types";
import type { PlanState } from "./trip";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error("Couldn't reach the server. Is `npm run dev` running?");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (data.error) throw new ApiError(res.status, data.error);
    if (res.status === 504) throw new ApiError(504, "The server timed out waiting for Gemini. Try again, or choose fewer days.");
    throw new ApiError(res.status, `Request failed (${res.status}). Try again.`);
  }
  return data as T;
}

const post = <T,>(path: string, body: unknown, signal?: AbortSignal) => request<T>("POST", path, body, signal);
const q = (o: Record<string, string>) => new URLSearchParams(o).toString();

export interface TripSummary {
  id: string;
  created_at: string;
  total: number;
  criteria: TripBrief;
  destination?: { city?: string; country?: string; airport?: string } | null;
}
export interface SavedTrip extends TripSummary {
  segments: { plan: TripPlan; sel: PlanState["sel"]; carOn: boolean; food: PlanState["food"] };
}
export interface ChatMsg { role: "user" | "assistant"; content: string }

export const api = {
  intent: (idea: string, origin: string, signal?: AbortSignal) => post<IntentResponse>("/api/intent", { idea, origin }, signal),
  recommend: (brief: TripBrief, signal?: AbortSignal) => post<RecommendResponse>("/api/recommend", { brief }, signal),
  plan: (brief: TripBrief, d: Pick<Recommendation, "city" | "country" | "airport">, signal?: AbortSignal) =>
    post<PlanResponse>("/api/plan", { brief, destination: { city: d.city, country: d.country, airport: d.airport } }, signal),
  trips: {
    list: (guestId: string) => request<{ trips: TripSummary[] }>("GET", `/api/trips?${q({ guestId })}`),
    get: (guestId: string, id: string) => request<{ trip: SavedTrip }>("GET", `/api/trips?${q({ guestId, id })}`),
    save: (guestId: string, s: PlanState, total: number) =>
      post<{ id: string; createdAt: string }>("/api/trips", { guestId, brief: s.brief, plan: s.plan, sel: s.sel, carOn: s.carOn, food: s.food, total }),
    remove: (guestId: string, id: string) => request<{ ok: true }>("DELETE", `/api/trips?${q({ guestId, id })}`),
  },
  chat: {
    history: (guestId: string, threadId: string) => request<{ messages: ChatMsg[]; saved: boolean }>("GET", `/api/chat?${q({ guestId, threadId })}`),
    send: (body: { guestId: string; threadId: string; message: string; context: string; history: ChatMsg[] }) =>
      post<{ reply: string; model: string; saved: boolean }>("/api/chat", body),
  },
};
