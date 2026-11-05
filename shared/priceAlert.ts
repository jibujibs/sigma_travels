import { z } from "zod";
import type { TripPlan } from "./types.js";

/**
 * Budget price alerts (AI Trip Planner). Demo: prices are Gemini's estimates, like the rest of the
 * planner; switching the price source to Google Flights (SerpApi) later keeps everything else.
 */

/** A budget the traveller named, per person ("under $1000"). */
export interface BudgetCap { amount: number; currency: string }

const SYMBOL: Record<string, string> = { "$": "USD", "₹": "INR", "£": "GBP", "€": "EUR" };
const WORD: [RegExp, string][] = [
  [/^(?:us\s*)?dollars?$|^usd$|^bucks$/i, "USD"],
  [/^rupees?$|^rs\.?$|^inr$/i, "INR"],
  [/^pounds?$|^gbp$/i, "GBP"],
  [/^euros?$|^eur$/i, "EUR"],
  [/^dirhams?$|^aed$/i, "AED"],
  [/^riyals?$|^sar$/i, "SAR"],
];
const wordCurrency = (w: string) => WORD.find(([re]) => re.test(w.trim()))?.[1] ?? "";

/** "1,000" → 1000, "1.5k" → 1500, "1.2 lakh" → 120000. */
function amountOf(num: string, unit = ""): number {
  const n = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  const u = unit.toLowerCase();
  return Math.round(u === "k" ? n * 1000 : /^(lakh|lac|lakhs)$/.test(u) ? n * 100000 : n);
}

/**
 * The budget in the typed words, or null: "under $1000", "below 1000 dollars", "within ₹50,000",
 * "budget 1.5 lakh rupees", "max AED 3000". A plain number with no currency is not a budget (it may be a date or a count).
 */
export function budgetFromText(text: string): BudgetCap | null {
  const t = text.replace(/\s+/g, " ");
  const num = "(\\d{1,3}(?:,\\d{2,3})+|\\d+(?:\\.\\d+)?)\\s*(k|lakhs?|lac)?";
  // Symbol or code first: "$1000", "₹ 50,000", "rs 50000", "AED 3000", "USD 900"
  const pre = new RegExp(`(\\$|₹|£|€|\\brs\\.?|\\binr\\b|\\busd\\b|\\baed\\b|\\bgbp\\b|\\beur\\b|\\bsar\\b)\\s*${num}`, "i").exec(t);
  if (pre) {
    const cur = SYMBOL[pre[1]] ?? wordCurrency(pre[1]);
    const amount = amountOf(pre[2], pre[3]);
    if (cur && amount > 0) return { amount, currency: cur };
  }
  // Word after: "1000 dollars", "50,000 rupees", "1.5 lakh rupees"
  const post = new RegExp(`${num}\\s*(us\\s*dollars?|dollars?|usd|bucks|rupees?|rs\\.?|inr|pounds?|gbp|euros?|eur|dirhams?|aed|riyals?|sar)\\b`, "i").exec(t);
  if (post) {
    const cur = wordCurrency(post[3]);
    const amount = amountOf(post[1], post[2]);
    if (cur && amount > 0) return { amount, currency: cur };
  }
  return null;
}

/** The cheapest flights in a plan, per person: cheapest way out + cheapest way back (or out only). */
export function cheapestPerPerson(plan: Pick<TripPlan, "flights">): number | null {
  const low = (xs: { fare_inr: number }[]) => (xs.length ? Math.min(...xs.map((f) => f.fare_inr).filter((n) => n > 0)) : NaN);
  const out = low(plan.flights.outbound), back = low(plan.flights.return);
  if (!Number.isFinite(out)) return null;
  return Math.round(out + (Number.isFinite(back) ? back : 0));
}

export type AlertStatus = "active" | "notified" | "expired" | "stopped";

/** A saved alert, as the planner shows it. */
export interface PriceAlert {
  id: string;
  createdAt: string;
  email: string;
  origin: string;          // "San Francisco (SFO)"
  destination: string;     // "Kochi (COK)"
  depart: string;          // YYYY-MM-DD
  returnDate: string;      // YYYY-MM-DD
  adults: number;
  budget: number;          // per person
  currency: string;
  status: AlertStatus;
  startPrice: number | null;
  lastPrice: number | null;
  lastChecked: string | null;
  notifiedAt: string | null;
}

/** Per account / in total: the daily check costs a request per alert. */
export const ALERTS_PER_USER = 5;
export const ALERTS_TOTAL = 25;

const day = /^\d{4}-\d{2}-\d{2}$/;
export const alertCreateSchema = z.object({
  action: z.literal("alert-create"),
  email: z.string().trim().email("Check the email address."),
  origin: z.string().trim().min(2).max(80),
  destination: z.object({ city: z.string().trim().min(1).max(80), country: z.string().trim().max(80).default(""), airport: z.string().trim().max(3).default("") }),
  depart: z.string().regex(day, "Choose the travel date."),
  days: z.number().int().min(1).max(30),
  adults: z.number().int().min(1).max(9),
  budget: z.number().positive().max(100_000_000),
  currency: z.string().trim().regex(/^[A-Z]{3}$/),
  price: z.number().nonnegative().nullable().default(null),
});
export const alertIdSchema = z.object({ action: z.enum(["alert-check", "alert-test", "alert-stop"]), id: z.string().uuid() });
