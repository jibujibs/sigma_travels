export const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const inr = (n: number) => "₹" + Math.round(n || 0).toLocaleString("en-IN");
export const inrPlain = (n: number) => "Rs " + Math.round(n || 0).toLocaleString("en-IN");

export function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
}
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
export const fmtDate = (d: Date) => `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
export const fmtLong = (d: Date) => `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export function todayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}
export function originCode(o: string): string {
  const m = /\(([A-Za-z]{3})\)/.exec(o);
  return m ? m[1].toUpperCase() : o.trim().slice(0, 3).toUpperCase();
}
export const originCity = (o: string) => o.replace(/\s*\(.*\)\s*/, "").trim() || o;
