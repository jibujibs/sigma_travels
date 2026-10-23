import type { PaymentLink, PayRail, PayView, PnrResponse } from "../../shared/booking";
import type { IntentResponse, PlanResponse, RecommendResponse, Recommendation, TripBrief, TripPlan } from "../../shared/types";
import { dropSession, getAccessToken } from "./auth";
import type { PlanState } from "./trip";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    // Every call carries the Google sign-in token; the server refuses calls without it.
    const token = await getAccessToken();
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    res = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    throw new Error("Couldn't reach the server. Is `npm run dev` running?");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    if (res.status === 401) dropSession(); // signed out or expired: the app shows the sign-in page
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

export interface Profile { email: string; name: string; avatar: string; homeAirport: string }

export const api = {
  pnr: {
    get: (pnr: string) => request<PnrResponse>("GET", `/api/pnr?${q({ pnr })}`),
    createLink: (pnr: string, rail: PayRail, email: string) => post<{ payment: PaymentLink }>("/api/paylink", { pnr, rail, email }),
  },
  pay: {
    view: (token: string) => request<PayView>("GET", `/api/pay?${q({ token })}`),
    checkout: (token: string) => post<{ url: string }>("/api/pay", { action: "checkout", token }),
    confirm: (token: string, sessionId: string) => post<PayView>("/api/pay", { action: "confirm", token, sessionId }),
    demoPay: (token: string, last4: string) => post<PayView>("/api/pay", { action: "demo-pay", token, last4 }),
  },
  profile: {
    get: (guestId: string) => request<Profile>("GET", `/api/profile?${q({ guestId })}`),
    setHomeAirport: (homeAirport: string) => request<{ homeAirport: string }>("PUT", "/api/profile", { homeAirport }),
  },
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
