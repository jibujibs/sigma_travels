import { generateJson } from "./gemini.js";
import { planPrompt } from "./prompts.js";
import { sendEmail } from "./email.js";
import { SIGMA } from "./customerEmail.js";
import { activeAlerts, updateAlert, type AlertRow } from "./supabase.js";
import { normalizePlan } from "../shared/normalize.js";
import { cheapestPerPerson, type PriceAlert } from "../shared/priceAlert.js";
import { money } from "../shared/currency.js";
import { DEFAULT_CC } from "../shared/contact.js";
import type { Needs, TripBrief } from "../shared/types.js";

/**
 * Budget price alerts. Demo: the price is the AI Trip Planner's own estimate (Gemini), asked again at
 * each check. To use real fares later, only cheapestNow() changes (Google Flights through SerpApi).
 */

const FLIGHTS_ONLY: Needs = { flights: true, hotel: false, car: false, itinerary: false };
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const list = (v: string | undefined) => (v ?? "").split(",").map((e) => e.trim()).filter(Boolean);

export function toAlertView(r: AlertRow): PriceAlert {
  return {
    id: r.id, createdAt: r.created_at, email: r.email, origin: r.origin, destination: r.destination,
    depart: r.depart, returnDate: addDays(r.depart, Math.max(0, r.days - 1)), adults: r.adults,
    budget: Number(r.budget), currency: r.currency, status: r.status,
    startPrice: r.start_price == null ? null : Number(r.start_price), lastPrice: r.last_price == null ? null : Number(r.last_price),
    lastChecked: r.last_checked, notifiedAt: r.notified_at,
  };
}

/** The cheapest flights per person for this alert's trip right now (the planner's estimate). */
export async function cheapestNow(a: AlertRow): Promise<number | null> {
  const brief: TripBrief = {
    idea: `Flights from ${a.origin} to ${a.destination}`, origin: a.origin, start: a.depart, days: a.days,
    pax: a.adults, budget: "Budget", interests: [], needs: FLIGHTS_ONLY,
  };
  const dest = { city: a.destination_city, country: a.destination_country, airport: a.destination_code };
  const { data } = await generateJson(planPrompt(brief, dest, FLIGHTS_ONLY), { maxOutputTokens: 8192, temperature: 0.6, label: "price-alert" });
  return cheapestPerPerson(normalizePlan(data, a.days, FLIGHTS_ONLY, a.currency));
}

/** The email the traveller gets (and the team, on CC) when the price is within the budget. */
export function alertEmail(a: AlertRow, price: number, stopUrl: string, test: boolean) {
  const route = `${a.origin} → ${a.destination}`;
  const when = `${nice(a.depart)} – ${nice(addDays(a.depart, Math.max(0, a.days - 1)))}`;
  const who = `${a.adults} adult${a.adults > 1 ? "s" : ""}`;
  const subject = `${test ? "[Test] " : ""}Price alert: ${a.origin.replace(/\s*\(.*\)/, "")} → ${a.destination.replace(/\s*\(.*\)/, "")} from ${money(price, a.currency)} per person`;
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const head = test
    ? `This is a test of your price alert. The price below is today's estimate${price <= Number(a.budget) ? "" : `; it is still above your budget of ${esc(money(a.budget, a.currency))}`}.`
    : `Good news: flights for your trip are now within your budget of ${esc(money(a.budget, a.currency))} per person.`;
  const html = `<div style="${font}font-size:15px;line-height:1.5;color:#1d2329;max-width:600px">
<p style="margin:0 0 12px">${head}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:0 0 14px;border:1px solid #e3e6ea;border-radius:8px">
<tr><td style="padding:10px 14px;color:#6b7480;font-size:13px">Trip</td><td style="padding:10px 14px"><b>${esc(route)}</b></td></tr>
<tr><td style="padding:10px 14px;color:#6b7480;font-size:13px;border-top:1px solid #e3e6ea">Dates</td><td style="padding:10px 14px;border-top:1px solid #e3e6ea">${esc(when)} · ${esc(who)}</td></tr>
<tr><td style="padding:10px 14px;color:#6b7480;font-size:13px;border-top:1px solid #e3e6ea">Price now</td><td style="padding:10px 14px;border-top:1px solid #e3e6ea"><b style="font-size:18px;color:#c8472b">${esc(money(price, a.currency))}</b> per person, return · your budget ${esc(money(a.budget, a.currency))}</td></tr>
</table>
<p style="margin:0 0 12px">Call Sunny on <a href="tel:+12142213300" style="color:#c8472b;font-weight:bold;text-decoration:none">${SIGMA.phone}</a> or reply to this email to book.</p>
<p style="margin:0 0 12px;font-size:12px;color:#6b7480">Estimated price (AI Trip Planner). Sunny will confirm the real fare before booking.</p>
<p style="margin:0;font-size:12px;color:#6b7480">${test ? "Your alert stays on." : "This alert is now complete."} <a href="${esc(stopUrl)}" style="color:#6b7480">Stop this alert</a></p>
</div>`;
  const text = [head, "", `Trip: ${route}`, `Dates: ${when} · ${who}`, `Price now: ${money(price, a.currency)} per person, return (your budget ${money(a.budget, a.currency)})`, "",
    `Call Sunny on ${SIGMA.phone} or reply to this email to book.`, "Estimated price (AI Trip Planner). Sunny will confirm the real fare before booking.", "",
    `Stop this alert: ${stopUrl}`].join("\n");
  return { subject, html, text };
}

export interface CheckResult { alert: PriceAlert; price: number | null; within: boolean; emailed: boolean; reason?: string }

/**
 * Checks one alert. Within the budget → email (traveller + team) and the alert is done (notified).
 * test: always email (marked [Test]) and keep the alert on, for showing it in a demo.
 */
export async function checkAlert(a: AlertRow, origin: string, test = false): Promise<CheckResult> {
  if (a.status === "active" && a.depart < today()) {
    const r = (await updateAlert(a.id, { status: "expired" })) ?? { ...a, status: "expired" as const };
    return { alert: toAlertView(r), price: null, within: false, emailed: false, reason: "The travel date has passed, so the alert has ended." };
  }
  const price = await cheapestNow(a);
  const within = price != null && price <= Number(a.budget);
  let row = (await updateAlert(a.id, { last_price: price, last_checked: new Date().toISOString() })) ?? a;
  let emailed = false, reason: string | undefined;
  if (price != null && (within || test)) {
    const stopUrl = `${origin}/api/trips?stop=${a.stop_token}`;
    const team = process.env.NOTIFY_CC !== undefined ? list(process.env.NOTIFY_CC) : [...DEFAULT_CC];
    const sent = await sendEmail({ ...alertEmail(row, price, stopUrl, test), to: [a.email], cc: team, replyTo: process.env.EMAIL_REPLY_TO?.trim() || SIGMA.email });
    emailed = sent.ok;
    if (!sent.ok) reason = sent.reason;
    if (sent.ok && within && !test && row.status === "active") row = (await updateAlert(a.id, { status: "notified", notified_at: new Date().toISOString() })) ?? row;
  }
  if (price == null) reason = "Couldn't get a price this time; it will be checked again.";
  return { alert: toAlertView(row), price, within, emailed, reason };
}

/** The daily run (Vercel Cron): every active alert not checked in the last 20 hours, three at a time. */
export async function runDueAlerts(origin: string): Promise<{ checked: number; notified: number; expired: number; failed: number }> {
  const due = (await activeAlerts()).filter((a) => !a.last_checked || Date.now() - Date.parse(a.last_checked) > 20 * 3600e3);
  const out = { checked: 0, notified: 0, expired: 0, failed: 0 };
  for (let i = 0; i < due.length; i += 3) {
    const results = await Promise.allSettled(due.slice(i, i + 3).map((a) => checkAlert(a, origin)));
    for (const r of results) {
      if (r.status === "rejected") { out.failed++; console.warn("[alerts] check failed:", r.reason instanceof Error ? r.reason.message : r.reason); continue; }
      out.checked++;
      if (r.value.alert.status === "notified") out.notified++;
      if (r.value.alert.status === "expired") out.expired++;
    }
  }
  return out;
}
