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
  /** Each time Sunny emailed the itinerary PDF to the customer. */
  emailed?: EmailedPdf[];
}

export interface EmailedPdf { to: string; cc: string[]; at: string; options: number }

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

export interface TopPick { option: FlightOption; reason: string }

/**
 * "Top 3 picks": three flights with no airline in common (a flight with two airlines uses up both), each with its reason. Simple rules, no AI call
 * (instant, no extra search): the customer's airline, the cheapest, then Google's best pick or the fastest;
 * any slot left empty goes to the cheapest other airline that isn't much slower. Sunny still chooses.
 */
export function topThree(options: FlightOption[], airline: string): TopPick[] {
  const picks: TopPick[] = [];
  // Every airline that flies any leg of a pick is "used": "American + Etihad" and "JetBlue + Etihad" both use
  // Etihad, so only one of them can be in the Top 3. That keeps the picks one per airline.
  const used = new Set<string>();
  const carriers = (o: FlightOption) => {
    const names = o.legs.map((l) => l.airline).filter(Boolean);
    return [...new Set((names.length ? names : o.airline.split(" + ")).map((n) => n.trim().toLowerCase()))];
  };
  const free = (o: FlightOption) => carriers(o).every((c) => !used.has(c));
  const byPrice = [...options].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  const take = (o: FlightOption | undefined, reason: string) => {
    if (!o || !free(o) || picks.length >= 3) return;
    carriers(o).forEach((c) => used.add(c));
    picks.push({ option: o, reason });
  };
  const fresh = (list: FlightOption[]) => list.find(free);
  // The customer may name several airlines ("KLM, Lufthansa etc."): each gets a slot when it flies the route.
  const wanted = airline.split(/,|\/|&|\band\b|\bor\b/i).map((w) => w.replace(/\betc\.?/i, "").trim()).filter((w) => w.length > 1).slice(0, 3);
  for (const w of wanted) {
    const lw = w.toLowerCase();
    const flies = byPrice.filter((o) => carriers(o).some((c) => c === lw || c.includes(lw)));
    take(fresh(flies.filter((o) => carriers(o).includes(lw))) ?? fresh(flies), `Customer asked for ${w}`);
  }
  take(fresh(byPrice), "Cheapest");
  const best = fresh(options.filter((o) => o.googleBest));
  if (best) take(best, "Google's best pick");
  else take(fresh([...options].sort((a, b) => a.minutes - b.minutes)), "Fastest");
  // Empty slots: the cheapest flight on new airlines that isn't much slower than the fastest (no 19-hour detours),
  // then any flight on new airlines if that is all there is.
  const quickest = Math.min(...options.map((o) => o.minutes).filter((m) => m > 0));
  while (picks.length < 3) {
    const next = fresh(byPrice.filter((o) => o.minutes <= quickest * 1.5)) ?? fresh(byPrice);
    if (!next) break;
    take(next, "Good value");
  }
  return picks;
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
