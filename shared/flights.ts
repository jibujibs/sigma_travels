import { z } from "zod";
import type { VoiceTrip } from "./voice.js";

/**
 * Real flights for a voice message (phase C), from Google Flights through SerpApi.
 * The app finds and compares; Sunny decides: every search field can be changed, and only the
 * flights Sunny adds go on the shortlist. Nothing is booked or sent to the customer from here.
 */

export const CABIN_OPTIONS = ["Economy", "Premium economy", "Business", "First"] as const;
export type Cabin = (typeof CABIN_OPTIONS)[number];
export type Stops = "any" | "nonstop" | "1";

/** What Sunny searches for. from may hold up to 3 airport codes (comma separated); to holds one. */
export interface FlightQuery {
  from: string;
  to: string;
  depart: string;   // YYYY-MM-DD
  return: string;   // YYYY-MM-DD, "" for one way
  adults: number;
  children: number;
  infants: number;
  cabin: Cabin;
  stops: Stops;
}

const iata = /^[A-Z]{3}$/;
const day = /^\d{4}-\d{2}-\d{2}$/;

export const flightQuerySchema = z.object({
  from: z.string().trim().toUpperCase().refine((s) => { const c = s.split(",").map((x) => x.trim()); return c.length >= 1 && c.length <= 3 && c.every((x) => iata.test(x)); },
    "Choose where they fly from (an airport such as COK)."),
  to: z.string().trim().toUpperCase().regex(iata, "Choose where they fly to (an airport such as DXB)."),
  depart: z.string().regex(day, "Choose the departure date."),
  return: z.string().refine((s) => s === "" || day.test(s), "Check the return date.").default(""),
  adults: z.number().int().min(1, "At least one adult must travel.").max(9),
  children: z.number().int().min(0).max(8),
  infants: z.number().int().min(0).max(4),
  cabin: z.enum(CABIN_OPTIONS),
  stops: z.enum(["any", "nonstop", "1"]),
}).refine((q) => !q.return || q.return >= q.depart, { message: "The return date is before the departure date.", path: ["return"] })
  .refine((q) => q.infants <= q.adults, { message: "Each infant needs an adult.", path: ["infants"] })
  .refine((q) => q.adults + q.children + q.infants <= 9, { message: "Up to 9 travellers per search.", path: ["adults"] })
  .refine((q) => !q.from.split(",").map((x) => x.trim()).includes(q.to), { message: "From and To are the same airport.", path: ["to"] });

export interface FlightLeg {
  airline: string;
  flightNo: string;
  from: string;       // airport code
  fromName: string;
  to: string;
  toName: string;
  dep: string;        // "2026-11-21 04:15" (local time at that airport, as Google gives it)
  arr: string;
  minutes: number;
  plane: string;
}

export interface FlightOption {
  id: string;
  airline: string;          // "Emirates" or "Air India + Emirates"
  logo: string;
  legs: FlightLeg[];
  layovers: { airport: string; name: string; minutes: number; overnight: boolean }[];
  minutes: number;
  /** Google's price in ₹ for all travellers (for a return trip: the whole round trip). null when Google shows none. */
  price: number | null;
  /** Google's own top picks ("best flights"). */
  googleBest: boolean;
  /** Present on outbound flights of a return trip: used to load the matching return flights. */
  departureToken?: string;
}

export interface FlightSearch {
  query: FlightQuery;
  at: string;               // ISO time of the search
  options: FlightOption[];
  googleUrl: string;
  priceLevel: string;       // "low" | "typical" | "high" | ""
  typical: [number, number] | null;
  /** True when the app searched by itself after the voice message was read. */
  auto?: boolean;
}

/** One option Sunny chose for the customer. */
export interface ShortlistItem {
  id: string;
  out: FlightOption;
  back: FlightOption | null;
  price: number | null;
  query: FlightQuery;
  googleUrl: string;
  addedAt: string;
}

/** Stored in voice_requests.flights. */
export interface VoiceFlights {
  search: FlightSearch | null;
  /** Why the last automatic search didn't run or failed (shown to Sunny). */
  note?: string;
  shortlist: ShortlistItem[];
}

export const SHORTLIST_MAX = 5;

/* ---------- from the voice trip ---------- */

const CABIN_OF: Record<string, Cabin> = { economy: "Economy", "premium economy": "Premium economy", business: "Business", first: "First" };

/** Search form values from the trip; anything the customer didn't say stays empty (never guessed). */
export function queryFromTrip(t: VoiceTrip | null, today: string): FlightQuery {
  return {
    from: t?.from?.airport ?? "",
    to: t?.to?.airport ?? "",
    depart: t?.depart && t.depart >= today ? t.depart : "",
    return: t?.return && t.return >= today ? t.return : "",
    adults: Math.max(1, t?.adults ?? 0),
    children: t?.children ?? 0,
    infants: Math.min(t?.infants ?? 0, Math.max(1, t?.adults ?? 0)),
    cabin: CABIN_OF[(t?.cabin ?? "").toLowerCase()] ?? "Economy",
    stops: "any",
  };
}

/**
 * The app searches by itself only when the customer clearly said where from, where to (a city with an
 * airport) and an exact date that Sunny doesn't need to confirm. Otherwise it says what to confirm first.
 */
export function autoSearchBlockers(t: VoiceTrip | null, today: string): string[] {
  if (!t) return ["trip details"];
  return [
    !t.from ? "departure city" : !t.from.airport && `which city in ${t.from.city} they fly from`,
    !t.to ? "destination" : !t.to.airport && `which city in ${t.to.city}`,
    !t.depart ? "travel date" : t.depart < today ? "travel date (it has passed)" : t.missing.some((m) => m.startsWith("confirm the travel date")) && "travel date (confirm it)",
  ].filter((x): x is string => Boolean(x));
}

/* ---------- helpers for the list ---------- */

export const travellers = (q: Pick<FlightQuery, "adults" | "children" | "infants">) =>
  [q.adults && `${q.adults} adult${q.adults > 1 ? "s" : ""}`, q.children && `${q.children} child${q.children > 1 ? "ren" : ""}`, q.infants && `${q.infants} infant${q.infants > 1 ? "s" : ""}`].filter(Boolean).join(", ");

export const hm = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
export const rupees = (n: number | null) => (n == null ? "—" : `₹${n.toLocaleString("en-IN")}`);
export const stopsOf = (o: FlightOption) => o.legs.length - 1;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "2026-11-21 04:15" → "Sat 21 Nov 04:15" */
export function niceTime(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}:\d{2})/.exec(s);
  if (!m) return s;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DOW[d.getUTCDay()]} ${+m[3]} ${MON[+m[2] - 1]} ${m[4].padStart(5, "0")}`;
}
export const timeOnly = (s: string) => (/\s(\d{1,2}:\d{2})/.exec(s)?.[1] ?? s).padStart(5, "0");
/** Days between departure and arrival dates (+1 for an overnight flight). */
export const dayShift = (dep: string, arr: string) => Math.round((Date.parse(arr.slice(0, 10)) - Date.parse(dep.slice(0, 10))) / 864e5);

/**
 * "⭐ Suggested" marks, with the reason. Simple rules, no AI call (instant and free): the customer's airline,
 * the cheapest, the fastest, and Google's own best pick. Sunny still chooses.
 */
export function suggestions(options: FlightOption[], airline: string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (o: FlightOption | undefined, why: string) => { if (o) out.set(o.id, [...(out.get(o.id) ?? []), why]); };
  const priced = options.filter((o) => o.price != null);
  const cheapest = [...priced].sort((a, b) => a.price! - b.price!)[0];
  add(cheapest, "cheapest");
  add([...options].sort((a, b) => a.minutes - b.minutes)[0], "fastest");
  const want = airline.trim().toLowerCase();
  if (want) add([...priced].filter((o) => o.airline.toLowerCase().includes(want)).sort((a, b) => a.price! - b.price!)[0] ?? options.find((o) => o.airline.toLowerCase().includes(want)), `customer asked for ${airline.trim()}`);
  add(options.find((o) => o.googleBest), "Google's best pick");
  return out;
}

function legLine(o: FlightOption): string {
  const first = o.legs[0], last = o.legs[o.legs.length - 1];
  const via = o.layovers.length ? `${o.layovers.length} stop via ${o.layovers.map((l) => l.airport).join(", ")}` : "Nonstop";
  return `${o.airline} ${o.legs.map((l) => l.flightNo).join(" / ")} · ${niceTime(first.dep)} ${first.from} → ${timeOnly(last.arr)} ${last.to}${dayShift(first.dep, last.arr) > 0 ? ` (+${dayShift(first.dep, last.arr)})` : ""} · ${via} · ${hm(o.minutes)}`;
}

/** Text Sunny copies into WhatsApp or an email. */
export function shortlistText(name: string, items: ShortlistItem[]): string {
  if (!items.length) return "";
  const q = items[0].query;
  const lines = [`Hi ${name}, here are flight options for you (${travellers(q)}, ${q.cabin}):`, ""];
  items.forEach((it, i) => {
    lines.push(`Option ${i + 1}: ${legLine(it.out)}`);
    if (it.back) lines.push(`   Return: ${legLine(it.back)}`);
    lines.push(`   Price: ${rupees(it.price)} total for ${travellers(it.query)}${it.back ? " (return trip)" : ""}`, "");
  });
  lines.push("Prices are from Google Flights today and can change until the tickets are booked.", "Sunny, Sigma Travels");
  return lines.join("\n");
}
