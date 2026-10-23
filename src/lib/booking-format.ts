import type { Passenger } from "../../shared/booking";

/** Money in the booking's own currency, e.g. "₹47,580" or "$486.60". */
export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency", currency, maximumFractionDigits: Number.isInteger(amount) ? 0 : 2, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-20T04:25" (local time at that airport) → "Fri 20 Nov". Read as written, no time-zone shift. */
export function day(t: string): string {
  const [y, m, d] = t.slice(0, 10).split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DOW[dow]} ${d} ${MON[m - 1]}`;
}
export const time = (t: string) => t.slice(11, 16);
export const dayTime = (t: string) => `${day(t)}, ${time(t)}`;

/** Whole days from now until a local "YYYY-MM-DDTHH:MM" time (read as UTC, like the server). */
export function daysUntil(t: string): number {
  return Math.ceil((Date.parse(`${t}:00Z`) - Date.now()) / 864e5);
}

/** "BIJU/AISWARYA MS" → "Aiswarya Biju (Ms)" for the customer page. */
export function displayName(sabreName: string): string {
  const [last = "", rest = ""] = sabreName.split("/");
  const parts = rest.trim().split(/\s+/);
  const title = /^(MR|MRS|MS|MISS|MSTR|DR)$/.test(parts.at(-1) ?? "") ? parts.pop()! : "";
  const cap = (s: string) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase());
  return `${cap(parts.join(" "))} ${cap(last)}${title ? ` (${cap(title)})` : ""}`.trim();
}

export const PAX_TYPE: Record<Passenger["type"], string> = { ADT: "Adult", CHD: "Child", INF: "Infant" };
export const STATUS_WORD: Record<string, string> = { HK: "Confirmed", HL: "Waitlisted", UC: "Unable", TK: "Schedule change" };
