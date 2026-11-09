import { z } from "zod";
import { countryOfAirport } from "./currency.js";
import type { ShortlistItem } from "./flights.js";

/**
 * The customer chooses one of Sunny's flight options (from the "Choose this option" buttons in the
 * flight-options email) and enters what's needed to book it in Sabre: each traveller's name as in the
 * passport, date of birth, gender, nationality and passport details, plus contact details.
 * Public page /choose/<token> (no sign-in); stored in voice_requests.choice. Sunny books from the Agent tab.
 */

export type PaxType = "adult" | "child" | "infant";
export const TITLES = ["MR", "MRS", "MS", "MISS", "MSTR"] as const;
export const TITLE_LABEL: Record<(typeof TITLES)[number], string> = { MR: "Mr", MRS: "Mrs", MS: "Ms", MISS: "Miss", MSTR: "Master" };

export interface ChoicePassenger {
  type: PaxType;
  title: (typeof TITLES)[number];
  /** Given / first name(s), as in the passport, capitals. */
  given: string;
  /** Surname, as in the passport, capitals. */
  surname: string;
  dob: string;              // YYYY-MM-DD
  gender: "M" | "F";
  nationality: string;
  passportNo: string;       // "" when not needed (domestic)
  passportExpiry: string;   // YYYY-MM-DD or ""
  passportCountry: string;
  ffn: string;              // frequent flyer, optional
  meal: string;             // optional
  assistance: string;       // optional
}

export interface CustomerChoice {
  /** 1-based option number in Sunny's list, and a copy of the option as it was when chosen. */
  option: number;
  item: ShortlistItem;
  passengers: ChoicePassenger[];
  contact: { email: string; phone: string };
  notes: string;
  confirmedAt: string;
  /** Times the customer changed it after the first confirm. */
  edits?: number;
}

/** What the public choose page gets: no internal ids, no passport numbers. */
export interface ChooseView {
  firstName: string;
  route: string;            // "Kochi (COK) → Doha (DOH)"
  options: ShortlistItem[];
  pax: { adults: number; children: number; infants: number };
  international: boolean;
  contact: { email: string; phone: string };
  /** The customer's earlier choice (passport numbers left out), when they confirmed already. */
  chosen: { option: number; confirmedAt: string; names: string[] } | null;
  /** True once Sunny has ticketed or closed the request: the choice can't change. */
  locked: boolean;
}

/** Different countries at either end (or unknown): passport details are needed. */
export function isInternational(item: Pick<ShortlistItem, "out" | "back">): boolean {
  const a = item.out.legs[0]?.from ?? "", z = item.out.legs[item.out.legs.length - 1]?.to ?? "";
  const ca = countryOfAirport(a), cz = countryOfAirport(z);
  return !ca || !cz || ca !== cz;
}

/** The traveller types, in order, from the counts in the search. */
export const paxTypes = (q: { adults: number; children: number; infants: number }): PaxType[] =>
  [...Array(q.adults).fill("adult"), ...Array(q.children).fill("child"), ...Array(q.infants).fill("infant")];

/** Age in whole years on a date (both YYYY-MM-DD). */
export function ageOn(dob: string, on: string): number {
  const [y1, m1, d1] = dob.split("-").map(Number), [y2, m2, d2] = on.split("-").map(Number);
  return y2 - y1 - (m2 < m1 || (m2 === m1 && d2 < d1) ? 1 : 0);
}

/** Months between two dates (YYYY-MM-DD), whole months. */
export const monthsBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
};

/** "NAIR/ANAND MR" as Sabre writes names. */
export const sabreName = (p: Pick<ChoicePassenger, "surname" | "given" | "title">) => `${p.surname}/${p.given} ${p.title}`.replace(/\s+/g, " ").trim();

const day = /^\d{4}-\d{2}-\d{2}$/;
const nameRe = /^[A-Z][A-Z' -]*$/;
const up = (s: string) => s.trim().replace(/\s+/g, " ").toUpperCase();

export const passengerSchema = z.object({
  type: z.enum(["adult", "child", "infant"]),
  title: z.enum(TITLES),
  given: z.string().transform(up).pipe(z.string().min(1, "Enter the given name as in the passport.").max(40).regex(nameRe, "Use letters only (A–Z), as in the passport.")),
  surname: z.string().transform(up).pipe(z.string().min(1, "Enter the surname as in the passport.").max(40).regex(nameRe, "Use letters only (A–Z), as in the passport.")),
  dob: z.string().regex(day, "Enter the date of birth."),
  gender: z.enum(["M", "F"], { errorMap: () => ({ message: "Choose the gender as in the passport." }) }),
  nationality: z.string().trim().min(2, "Enter the nationality.").max(40),
  passportNo: z.string().transform((s) => s.replace(/\s+/g, "").toUpperCase()).pipe(z.string().max(20).regex(/^[A-Z0-9]*$/, "Passport number: letters and numbers only.")),
  passportExpiry: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/).default(""),
  passportCountry: z.string().trim().max(40).default(""),
  ffn: z.string().trim().max(30).default(""),
  meal: z.string().trim().max(40).default(""),
  assistance: z.string().trim().max(120).default(""),
});

export const chooseSubmitSchema = z.object({
  option: z.number().int().min(1).max(10),
  passengers: z.array(passengerSchema).min(1).max(9),
  contact: z.object({
    email: z.string().trim().email("Check the email address."),
    phone: z.string().trim().min(6, "Enter a phone number.").max(30),
  }),
  notes: z.string().trim().max(500).default(""),
  agree: z.literal(true, { errorMap: () => ({ message: "Tick the box to confirm the details are as in the passports." }) }),
});
export type ChooseSubmit = z.infer<typeof chooseSubmitSchema>;

/**
 * Checks that need the trip: the right number and kinds of travellers, ages that fit, and passports
 * valid for the journey. Returns the first problem in plain words, or null.
 */
export function checkPassengers(item: ShortlistItem, passengers: ChoiceSubmitPassenger[], today: string): string | null {
  const want = paxTypes(item.query);
  if (passengers.length !== want.length) return `Enter details for all ${want.length} travellers.`;
  const depart = item.query.depart, last = item.query.return || depart;
  const intl = isInternational(item);
  for (const [i, p] of passengers.entries()) {
    const who = `Traveller ${i + 1}`;
    if (p.type !== want[i]) return `${who}: expected ${want[i]}.`;
    if (p.dob >= today) return `${who}: check the date of birth.`;
    const age = ageOn(p.dob, depart);
    if (age > 120) return `${who}: check the date of birth.`;
    if (p.type === "adult" && age < 12) return `${who} is under 12 on the travel date: travellers under 12 travel as a child.`;
    if (p.type === "child" && (age < 2 || age > 11)) return `${who}: a child is 2 to 11 years old on the travel date.`;
    if (p.type === "infant" && age >= 2) return `${who}: an infant is under 2 on the travel date.`;
    if (intl) {
      if (!p.passportNo) return `${who}: enter the passport number (needed for international flights).`;
      if (!p.passportExpiry) return `${who}: enter the passport expiry date.`;
      if (!p.passportCountry) return `${who}: enter the country that issued the passport.`;
      if (p.passportExpiry <= last) return `${who}: the passport expires before the trip ends.`;
    }
  }
  return null;
}
type ChoiceSubmitPassenger = z.infer<typeof passengerSchema>;

/** A passport that ends within 6 months of the last travel date: many countries refuse entry. */
export function passportWarnings(item: ShortlistItem, passengers: Pick<ChoicePassenger, "passportExpiry">[]): number[] {
  const last = item.query.return || item.query.depart;
  return passengers.flatMap((p, i) => (p.passportExpiry && monthsBetween(last, p.passportExpiry) < 6 ? [i] : []));
}

/** Passport number for the Agent tab before Sunny presses Show: ••••1290. */
export const maskPassport = (n: string) => (n ? `••••${n.slice(-4)}` : "");

/** voice_requests.choice: the options emailed to the customer (as they were then) and what they chose. */
export interface ChoiceRecord {
  offered: ShortlistItem[];
  offeredAt: string;
  chosen: CustomerChoice | null;
}
