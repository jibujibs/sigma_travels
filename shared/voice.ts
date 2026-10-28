import { z } from "zod";
import { flightQuerySchema, SHORTLIST_MAX, type VoiceFlights } from "./flights.js";
import { airportFor } from "./airports.js";

/** Longest voice message a customer can record. */
export const VOICE_MAX_SECONDS = 180;
/** Base64 size cap (a 3-minute Opus/AAC recording is about 1–2 MB; Vercel accepts request bodies up to 4.5 MB). */
export const VOICE_MAX_BASE64 = 4_000_000;

export type VoiceStatus = "new" | "contacted" | "ticketed" | "closed";
export const VOICE_STATUSES: VoiceStatus[] = ["new", "contacted", "ticketed", "closed"];

/** Customer → server: the recording and how to reach them. */
export const voiceSubmitSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().trim().max(30).default(""),
  email: z.string().trim().max(120).default(""),
  /** Base64 audio, no "data:" prefix. */
  audio: z.string().min(100, "The recording is empty. Record your message again.").max(VOICE_MAX_BASE64, "The recording is too large. Keep it under 3 minutes."),
  mime: z.string().regex(/^audio\/[a-z0-9.+-]+(;.*)?$/i, "Unsupported audio format"),
  seconds: z.number().int().min(1).max(VOICE_MAX_SECONDS + 5),
}).refine((v) => v.phone.length >= 6 || /^\S+@\S+\.\S+$/.test(v.email), {
  message: "Enter a phone number or an email address so Sunny can contact you.",
  path: ["phone"],
}).refine((v) => !v.email || /^\S+@\S+\.\S+$/.test(v.email), { message: "Check the email address.", path: ["email"] });

export const voiceStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "contacted", "ticketed", "closed"]),
});


/** One voice request as Sunny sees it in the Agent inbox. */
export interface VoiceRequest {
  id: string;
  createdAt: string;
  name: string;
  phone: string;
  email: string;
  seconds: number;
  /** Short-lived link to play the recording (null if storage is unavailable). */
  audioUrl: string | null;
  /** Language the customer spoke, e.g. "Malayalam". */
  language: string;
  /** What the customer said, in their own language. */
  transcript: string;
  /** English version (same as transcript when they spoke English). */
  english: string;
  status: VoiceStatus;
  /** Set when transcription failed; the recording is still saved. */
  error?: string;
  /** True while the voice is still being turned into text (it runs after the customer is told "sent"). */
  processing: boolean;
  /** Trip details read from the message (null: none described, or not read yet). */
  trip: VoiceTrip | null;
  /** False when the trip column hasn't been added in Supabase yet (run supabase/voice_requests.sql). */
  tripSaved: boolean;
  /** Real flights found for this message and Sunny's shortlist (phase C). */
  flights: VoiceFlights | null;
  /** False when the flights column hasn't been added in Supabase yet. */
  flightsSaved: boolean;
}

/* ---------- trip details read from the message (phase B) ---------- */

export interface TripPlace { city: string; airport: string }

/** What the customer asked for, as understood from the message (and corrected by Sunny). Empty strings / 0 = not mentioned. */
export interface VoiceTrip {
  from: TripPlace | null;
  to: TripPlace | null;
  /** YYYY-MM-DD */
  depart: string;
  /** YYYY-MM-DD; "" for one-way or not mentioned */
  return: string;
  oneWay: boolean;
  adults: number;
  children: number;
  infants: number;
  cabin: string;    // Economy, Premium economy, Business, First, or ""
  airline: string;  // preferred airline, e.g. "Emirates", or ""
  budget: string;   // e.g. "under ₹50,000 per person", or ""
  /** Anything else Sunny should know (hotel, flexible dates, visa…). */
  notes: string;
  /** What Sunny still has to ask; worked out from the fields above, never guessed. */
  missing: string[];
  /** True once Sunny has edited and saved it. */
  edited?: boolean;
}

export const CABINS = ["Economy", "Premium economy", "Business", "First"];

const isoDay = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const count = (v: unknown, max: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0; };
const place = (v: unknown): TripPlace | null => {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const city = str(o.city).slice(0, 60);
  const airport = str(o.airport).replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  // Gemini sometimes leaves out the code of a well-known city ("Dubai"): take it from our airport list.
  return city ? { city, airport: airport.length === 3 ? airport : airportFor(city) } : null;
};
const cabinOf = (v: unknown) => CABINS.find((c) => c.toLowerCase() === str(v).toLowerCase()) ?? "";

/** What the agent still has to ask the customer, from the fields alone (so it is always right after an edit). */
export function missingFor(t: Pick<VoiceTrip, "from" | "to" | "depart" | "return" | "oneWay" | "adults" | "children">): string[] {
  return [
    !t.from && "departure city",
    !t.to && "destination",
    // A country or region without an airport ("Saudi Arabia"): flights need a city.
    t.from && !t.from.airport && `which city in ${t.from.city} they fly from`,
    t.to && !t.to.airport && `which city in ${t.to.city}`,
    !t.depart && "travel date",
    // No return date said: it's a one-way trip, so there is nothing to ask.
    t.adults + t.children === 0 && "number of travellers",
  ].filter((x): x is string => Boolean(x));
}

/** Gemini's JSON (or Sunny's edit) is untrusted: coerce it into a VoiceTrip, or null when no trip was described at all. */
export function normalizeTrip(raw: unknown, edited = false): VoiceTrip | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const depart = isoDay.test(str(r.depart)) ? str(r.depart) : "";
  let ret = isoDay.test(str(r.return)) ? str(r.return) : "";
  if (ret && depart && ret < depart) ret = "";
  const base = {
    from: place(r.from), to: place(r.to), depart, return: ret,
    oneWay: r.oneWay === true && !ret,
    adults: count(r.adults, 9), children: count(r.children, 9), infants: count(r.infants, 9),
    cabin: cabinOf(r.cabin), airline: str(r.airline).slice(0, 40), budget: str(r.budget).slice(0, 80), notes: str(r.notes).slice(0, 400),
  };
  if (!base.to && !base.from && !base.depart) return null;
  return { ...base, missing: missingFor(base), ...(edited ? { edited: true } : {}) };
}

/**
 * A date said without a year ("13th October") that has already passed lands next year: ask Sunny to confirm it.
 * Not stored, so it disappears once Sunny edits and saves the trip.
 */
export function withDateCheck(t: VoiceTrip | null, sent: string): VoiceTrip | null {
  if (!t || t.edited || !t.depart) return t;
  const days = (Date.parse(t.depart) - Date.parse(sent.slice(0, 10))) / 864e5;
  if (!(days >= 300)) return t;
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const when = `${Number(t.depart.slice(8, 10))} ${MON[Number(t.depart.slice(5, 7)) - 1]} ${t.depart.slice(0, 4)}`;
  return { ...t, missing: [...t.missing, `confirm the travel date (${when} is almost a year away)`] };
}

/** Sunny's actions on one message (PATCH /api/voice). */
export const voicePatchSchema = z.union([
  z.object({ id: z.string().uuid(), status: z.enum(["new", "contacted", "ticketed", "closed"]) }),
  z.object({ id: z.string().uuid(), action: z.literal("read-trip") }),
  z.object({ id: z.string().uuid(), action: z.literal("retry") }),
  z.object({ id: z.string().uuid(), action: z.literal("save-trip"), trip: z.record(z.unknown()) }),
  z.object({ id: z.string().uuid(), action: z.literal("flights-search"), query: flightQuerySchema }),
  z.object({ id: z.string().uuid(), action: z.literal("flights-return"), query: flightQuerySchema, token: z.string().min(10).max(4000) }),
  z.object({ id: z.string().uuid(), action: z.literal("flights-save"), shortlist: z.array(z.record(z.unknown())).max(SHORTLIST_MAX, `Up to ${SHORTLIST_MAX} options per customer.`) }),
]);

/** "Kochi (COK)" for a place, as the airport suggestions show it. */
export const placeLabel = (p: TripPlace | null) => (p ? (p.airport ? `${p.city} (${p.airport})` : p.city) : "");

/** One line for emails and lists, e.g. "Kochi → Dubai · 15–22 Nov · 2 adults · Business · Emirates". */
export function tripLine(t: VoiceTrip): string {
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
  const people = [t.adults && `${t.adults} adult${t.adults > 1 ? "s" : ""}`, t.children && `${t.children} child${t.children > 1 ? "ren" : ""}`, t.infants && `${t.infants} infant${t.infants > 1 ? "s" : ""}`].filter(Boolean).join(", ");
  const sameMonth = t.return && t.return.slice(0, 7) === t.depart.slice(0, 7);
  const dates = t.depart ? (t.return ? `${sameMonth ? Number(t.depart.slice(8, 10)) : d(t.depart)}–${d(t.return)}` : `${d(t.depart)}${t.oneWay ? " (one way)" : ""}`) : "";
  return [`${t.from?.city ?? "?"} → ${t.to?.city ?? "?"}`, dates, people, t.cabin, t.airline].filter(Boolean).join(" · ");
}
