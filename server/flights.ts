import type { FlightLeg, FlightOption, FlightQuery, FlightSearch } from "../shared/flights.js";
import { HttpError } from "./http.js";

/**
 * Google Flights results through SerpApi (https://serpapi.com/google-flights-api).
 * The key (SERPAPI_API_KEY) is read on the server only; each call uses one search from the SerpApi plan.
 */
const ENDPOINT = "https://serpapi.com/search.json";
const CLASS: Record<FlightQuery["cabin"], string> = { Economy: "1", "Premium economy": "2", Business: "3", First: "4" };
const STOPS: Record<FlightQuery["stops"], string> = { any: "0", nonstop: "1", "1": "2" };

export const flightsConfigured = () => Boolean(process.env.SERPAPI_API_KEY?.trim());

function params(q: FlightQuery): Record<string, string> {
  return {
    engine: "google_flights",
    departure_id: q.from.replace(/\s+/g, ""),
    arrival_id: q.to,
    outbound_date: q.depart,
    ...(q.return ? { return_date: q.return, type: "1" } : { type: "2" }),
    adults: String(q.adults),
    children: String(q.children),
    infants_on_lap: String(q.infants),
    travel_class: CLASS[q.cabin],
    stops: STOPS[q.stops],
    currency: "INR",
    hl: "en",
    gl: "in",
  };
}

interface RawLeg {
  departure_airport?: { name?: string; id?: string; time?: string };
  arrival_airport?: { name?: string; id?: string; time?: string };
  duration?: number; airplane?: string; airline?: string; flight_number?: string;
}
interface RawOption {
  flights?: RawLeg[];
  layovers?: { duration?: number; name?: string; id?: string; overnight?: boolean }[];
  total_duration?: number; price?: number; airline_logo?: string; departure_token?: string;
}
interface RawResponse {
  error?: string;
  best_flights?: RawOption[];
  other_flights?: RawOption[];
  price_insights?: { price_level?: string; typical_price_range?: number[] };
  search_metadata?: { google_flights_url?: string; status?: string };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

function option(r: RawOption, i: number, best: boolean): FlightOption | null {
  const legs: FlightLeg[] = (r.flights ?? []).map((l) => ({
    airline: str(l.airline), flightNo: str(l.flight_number),
    from: str(l.departure_airport?.id), fromName: str(l.departure_airport?.name),
    to: str(l.arrival_airport?.id), toName: str(l.arrival_airport?.name),
    dep: str(l.departure_airport?.time), arr: str(l.arrival_airport?.time),
    minutes: num(l.duration), plane: str(l.airplane),
  }));
  if (!legs.length || !legs[0].dep) return null;
  const airlines = [...new Set(legs.map((l) => l.airline).filter(Boolean))];
  return {
    id: `${best ? "b" : "o"}${i}-${legs.map((l) => l.flightNo.replace(/\s/g, "")).join("-")}`,
    airline: airlines.join(" + ") || "Airline",
    logo: str(r.airline_logo),
    legs,
    layovers: (r.layovers ?? []).map((l) => ({ airport: str(l.id), name: str(l.name), minutes: num(l.duration), overnight: Boolean(l.overnight) })),
    minutes: num(r.total_duration) || legs.reduce((s, l) => s + l.minutes, 0),
    price: typeof r.price === "number" ? r.price : null,
    googleBest: best,
    ...(r.departure_token ? { departureToken: r.departure_token } : {}),
  };
}

async function call(p: Record<string, string>): Promise<RawResponse> {
  const key = process.env.SERPAPI_API_KEY?.trim();
  if (!key) throw new HttpError(503, "Flight search isn't set up: add SERPAPI_API_KEY to .env.local (local) or Vercel → Settings → Environment Variables.");
  let res: Response;
  try {
    res = await fetch(`${ENDPOINT}?${new URLSearchParams({ ...p, api_key: key })}`, { signal: AbortSignal.timeout(45_000) });
  } catch (e) {
    const name = (e as Error)?.name;
    throw new HttpError(504, name === "TimeoutError" || name === "AbortError" ? "Google Flights took too long to answer. Try again." : "Couldn't reach the flight search (SerpApi). Check the internet connection.");
  }
  const body = (await res.json().catch(() => ({}))) as RawResponse;
  const msg = str(body.error);
  if (res.status === 401 || /invalid api key/i.test(msg)) throw new HttpError(502, "SerpApi rejected the key. Check SERPAPI_API_KEY.");
  if (res.status === 429 || /run out of searches|plan.*limit|searches per/i.test(msg)) throw new HttpError(429, "This month's SerpApi searches are used up (free plan: 250). They reset next month.");
  // "Google Flights hasn't returned any results for this query." is not an error: it's an empty list.
  if (msg && !/hasn't returned any results|no results/i.test(msg)) throw new HttpError(502, `Flight search failed: ${msg.slice(0, 160)}`);
  if (!res.ok && !msg) throw new HttpError(502, `Flight search failed (${res.status}). Try again.`);
  return body;
}

function toList(body: RawResponse): FlightOption[] {
  const best = (body.best_flights ?? []).map((r, i) => option(r, i, true));
  const other = (body.other_flights ?? []).map((r, i) => option(r, i, false));
  return [...best, ...other].filter((o): o is FlightOption => Boolean(o)).slice(0, 60);
}

export async function searchFlights(q: FlightQuery, auto = false): Promise<FlightSearch> {
  const body = await call(params(q));
  const range = body.price_insights?.typical_price_range;
  return {
    query: q,
    at: new Date().toISOString(),
    options: toList(body),
    googleUrl: str(body.search_metadata?.google_flights_url),
    priceLevel: str(body.price_insights?.price_level),
    typical: Array.isArray(range) && range.length === 2 ? [num(range[0]), num(range[1])] : null,
    ...(auto ? { auto: true } : {}),
  };
}

/** Return flights that go with one outbound flight of a return-trip search (prices are for the whole round trip). */
export async function returnFlights(q: FlightQuery, departureToken: string): Promise<FlightOption[]> {
  if (!q.return) throw new HttpError(400, "This search is one way, so there are no return flights.");
  const body = await call({ ...params(q), departure_token: departureToken });
  return toList(body);
}
