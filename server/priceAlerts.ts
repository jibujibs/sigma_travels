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

/**
 * The email the traveller gets (and the team, on CC). Shows the price now against the budget (under / over)
 * and against the price when the alert was made (down / up). test: a preview sent from "Send test email".
 */
export function alertEmail(a: AlertRow, price: number, stopUrl: string, test: boolean, logo = "") {
  const cur = a.currency, budget = Number(a.budget), start = a.start_price == null ? null : Number(a.start_price);
  const m = (n: number) => money(n, cur);
  const within = price <= budget;
  const city = (p: string) => p.replace(/\s*\(.*\)/, "");
  const codeOf = (p: string) => /\(([A-Z]{3})\)/.exec(p)?.[1] ?? city(p);
  const back = addDays(a.depart, Math.max(0, a.days - 1));
  const who = `${a.adults} adult${a.adults > 1 ? "s" : ""}`;
  const diffBudget = Math.abs(Math.round(price - budget));
  const change = start != null && start > 0 ? Math.round(price - start) : null;
  const pct = change != null && start ? Math.round((Math.abs(change) / start) * 100) : 0;

  const C = { coral: "#c8472b", coralSoft: "#fde6dd", ink: "#2b1a14", muted: "#7a6359", line: "#ecdcd0", cream: "#faf5ef", green: "#1f7a3f", greenSoft: "#e1f3e6", red: "#a3261b", redSoft: "#fbe4e1" };
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const title = within ? "Good news! Your flights are now within budget" : test ? "Your price alert: today's price" : "Your price alert";
  const lead = within
    ? `Flights for your trip have dropped to <b>${esc(m(price))}</b> per person, within your budget of <b>${esc(m(budget))}</b>.`
    : `Today's price is <b>${esc(m(price))}</b> per person, still above your budget of <b>${esc(m(budget))}</b>. We'll email you as soon as it drops to ${esc(m(budget))} or less.`;
  const budgetChip = within
    ? `<span style="display:inline-block;background:${C.greenSoft};color:${C.green};font-weight:bold;font-size:13px;padding:5px 10px;border-radius:999px">✓ ${esc(m(diffBudget))} under your budget</span>`
    : `<span style="display:inline-block;background:${C.redSoft};color:${C.red};font-weight:bold;font-size:13px;padding:5px 10px;border-radius:999px">${esc(m(diffBudget))} above your budget</span>`;
  const changeLine = change == null || change === 0 ? (change === 0 ? `Same as when you set the alert (${esc(m(start!))}).` : "")
    : change < 0
      ? `<span style="color:${C.green};font-weight:bold">▼ ${esc(m(-change))} cheaper (${pct}%)</span> than when you set the alert (<s>${esc(m(start!))}</s>).`
      : `<span style="color:${C.red};font-weight:bold">▲ ${esc(m(change))} higher (${pct}%)</span> than when you set the alert (${esc(m(start!))}).`;

  const subject = within
    ? `${test ? "[Test] " : ""}✅ Price drop: ${city(a.origin)} → ${city(a.destination)} now ${m(price)} per person (budget ${m(budget)})`
    : `${test ? "[Test] " : ""}Price alert: ${city(a.origin)} → ${city(a.destination)} now ${m(price)} per person (budget ${m(budget)})`;

  const html = `<div style="background:${C.cream};padding:20px 0;${font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid ${C.line};border-radius:14px;border-collapse:separate;overflow:hidden">
<tr><td style="background:${C.coral};padding:16px 24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="${font}color:#ffffff;font-size:18px;font-weight:bold">${logo ? `<img src="${esc(logo)}" width="64" height="35" alt="" style="vertical-align:middle;border:0;background:#fff;border-radius:6px;padding:2px;margin-right:10px">` : "Σ "}Sigma Tours &amp; Travels</td>
    <td align="right" style="${font}color:#ffffff;font-size:12px;letter-spacing:.08em;font-weight:bold">${test ? "TEST · " : ""}PRICE ALERT</td>
  </tr></table>
</td></tr>
${test ? `<tr><td style="background:#fff7e0;color:#6b4d00;${font}font-size:13px;padding:8px 24px">This is a test email sent from “Send test email”. Your alert stays on.</td></tr>` : ""}
<tr><td style="padding:24px 24px 8px">
  <div style="${font}font-size:22px;line-height:1.3;font-weight:bold;color:${C.ink};margin:0 0 8px">${within ? "🎉 " : "🔔 "}${title}</div>
  <div style="${font}font-size:15px;line-height:1.5;color:${C.ink}">${lead}</div>
</td></tr>
<tr><td style="padding:12px 24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px;background:${within ? C.greenSoft : C.coralSoft}">
  <tr><td style="padding:18px 20px">
    <div style="${font}font-size:12px;letter-spacing:.06em;color:${C.muted};font-weight:bold">PRICE NOW · PER PERSON, RETURN</div>
    <div style="${font}font-size:36px;font-weight:bold;color:${within ? C.green : C.coral};margin:4px 0 8px">${esc(m(price))}</div>
    <div style="margin:0 0 8px">${budgetChip}</div>
    ${changeLine ? `<div style="${font}font-size:14px;color:${C.ink}">${changeLine}</div>` : ""}
  </td></tr></table>
</td></tr>
<tr><td style="padding:8px 24px 4px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:12px">
  <tr>
    <td style="padding:14px 18px;${font}">
      <div style="font-size:26px;font-weight:bold;color:${C.ink}">${esc(codeOf(a.origin))} <span style="color:${C.coral}">✈</span> ${esc(codeOf(a.destination))}</div>
      <div style="font-size:13px;color:${C.muted}">${esc(a.origin)} → ${esc(a.destination)}</div>
    </td>
    <td align="right" style="padding:14px 18px;${font}font-size:14px;color:${C.ink};line-height:1.6">
      <b>${esc(nice(a.depart))}</b> → <b>${esc(nice(back))}</b><br>${esc(who)} · Your budget ${esc(m(budget))}
    </td>
  </tr></table>
</td></tr>
<tr><td style="padding:18px 24px 8px" align="center">
  <a href="tel:+12142213300" style="display:inline-block;background:${C.coral};color:#ffffff;${font}font-size:16px;font-weight:bold;text-decoration:none;padding:13px 26px;border-radius:10px">📞 Call Sunny · ${SIGMA.phone}</a>
  <div style="${font}font-size:13px;color:${C.muted};margin:8px 0 0">or reply to this email to book</div>
</td></tr>
<tr><td style="padding:16px 24px 20px;border-top:1px solid ${C.line}">
  <div style="${font}font-size:12px;line-height:1.5;color:${C.muted}">Estimated price from the AI Trip Planner. Sunny will confirm the real fare before booking.<br>
  ${within && !test ? "This alert is now complete." : "We check once a day until the travel date."} <a href="${esc(stopUrl)}" style="color:${C.muted}">Stop this alert</a></div>
</td></tr>
</table></div>`;

  const text = [
    test ? "[TEST EMAIL — your alert stays on]" : "",
    within ? `Good news! Flights for your trip are now ${m(price)} per person, within your budget of ${m(budget)} (${m(diffBudget)} under).`
      : `Today's price is ${m(price)} per person, ${m(diffBudget)} above your budget of ${m(budget)}.`,
    change == null || change === 0 ? "" : change < 0 ? `Down ${m(-change)} (${pct}%) since you set the alert (was ${m(start!)}).` : `Up ${m(change)} (${pct}%) since you set the alert (was ${m(start!)}).`,
    "", `Trip: ${a.origin} → ${a.destination}`, `Dates: ${nice(a.depart)} – ${nice(back)} · ${who}`, "",
    `Call Sunny on ${SIGMA.phone} or reply to this email to book.`, "Estimated price from the AI Trip Planner. Sunny will confirm the real fare before booking.", "",
    `Stop this alert: ${stopUrl}`,
  ].filter((l, i, xs) => l !== "" || xs[i - 1] !== "").join("\n").trim();
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
    const sent = await sendEmail({ ...alertEmail(row, price, stopUrl, test, `${origin}/sigma-logo.png`), to: [a.email], cc: team, replyTo: process.env.EMAIL_REPLY_TO?.trim() || SIGMA.email });
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
