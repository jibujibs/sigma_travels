import { requireUser } from "../server/auth.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { alertById, countActiveAlerts, deleteTrip, ensureAuthUser, getTrip, insertAlert, listAlerts, listTrips, saveTrip, stopAlertByToken, updateAlert } from "../server/supabase.js";
import { checkAlert, runDueAlerts, toAlertView } from "../server/priceAlerts.js";
import { alertCreateSchema, alertIdSchema, ALERTS_PER_USER, ALERTS_TOTAL } from "../shared/priceAlert.js";
import { originOf } from "../server/payments.js";
import { airportFor } from "../shared/airports.js";
import { z } from "zod";
import { normalizePlan } from "../shared/normalize.js";
import { saveTripSchema, tripEmailSchema } from "../shared/schemas.js";
import { canEmailAnyone, sendEmail } from "../server/email.js";
import { DEFAULT_CC } from "../shared/contact.js";

/** Saved trips, stored in Supabase's existing "itineraries" table, per signed-in account. */

async function account(request: Request): Promise<string> {
  const user = await requireUser(request);
  return (await ensureAuthUser(user)).id;
}

/** A small page for the "Stop this alert" link in the email (opened without signing in). */
const page = (title: string, body: string, status = 200) => new Response(
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<body style="font-family:Arial,Helvetica,sans-serif;background:#faf5ef;color:#2b1a14;display:grid;place-items:center;min-height:100vh;margin:0">
<div style="background:#fff;border:1px solid #ecdcd0;border-radius:16px;padding:28px 32px;max-width:420px"><h1 style="margin:0 0 8px;font-size:22px">${title}</h1><p style="margin:0;color:#7a6359">${body}</p></div></body>`,
  { status, headers: { "content-type": "text/html; charset=utf-8" } });

// GET /api/trips           → list (newest first)
// GET /api/trips?id=…      → one trip with its full plan
// GET /api/trips?alerts=1  → my price alerts
// GET /api/trips?stop=…    → "Stop this alert" link from the alert email (no sign-in; the token is the key)
// GET /api/alerts-cron     → (rewrite to ?cron=1) the daily check, called by Vercel Cron with CRON_SECRET
export const GET = handle(async (request) => {
  const q = new URL(request.url).searchParams;
  const stop = q.get("stop");
  if (stop) {
    if (!/^[0-9a-f-]{36}$/i.test(stop)) return page("Link not valid", "This stop link isn't valid.", 400);
    const a = await stopAlertByToken(stop);
    return a ? page("Price alert stopped", `You won't get more emails for ${a.origin} → ${a.destination}.`) : page("Already stopped", "This price alert was not found or has already ended.", 404);
  }
  if (q.get("cron")) {
    const secret = process.env.CRON_SECRET?.trim();
    if (!secret) throw new HttpError(503, "Add CRON_SECRET in Vercel → Settings → Environment Variables for the daily price alert check.");
    if (request.headers.get("authorization") !== `Bearer ${secret}`) throw new HttpError(401, "Not allowed.");
    return json(await runDueAlerts(originOf(request)));
  }
  const userId = await account(request);
  if (q.get("alerts")) return json({ alerts: (await listAlerts(userId)).map(toAlertView) });
  const id = q.get("id");
  if (id) {
    const trip = await getTrip(userId, id);
    if (!trip) throw new HttpError(404, "Trip not found");
    return json({ trip });
  }
  return json({ trips: await listTrips(userId) });
});

// POST /api/trips  { brief, plan, sel, carOn, food, total }
export const POST = handle(async (request) => {
  const userId = await account(request);
  const body = await parseBody(request, saveTripSchema);
  let plan;
  try {
    plan = normalizePlan(body.plan, body.brief.days);
  } catch {
    throw new HttpError(400, "The plan to save is incomplete");
  }
  const saved = await saveTrip(userId, body.brief, { plan, sel: body.sel, carOn: body.carOn, food: body.food }, body.total, plan.price_currency);
  return json({ id: saved.id, createdAt: saved.created_at });
});

// DELETE /api/trips?id=…
export const DELETE = handle(async (request) => {
  const userId = await account(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) throw new HttpError(400, "Missing trip id");
  await deleteTrip(userId, id);
  return json({ ok: true });
});

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const list = (v: string | undefined) => (v ?? "").split(",").map((e) => e.trim()).filter(Boolean);

// PATCH /api/trips { action: "email", subject, text, filename, pdf (base64), extra[], note }
// Emails the trip PDF to the team group (NOTIFY_CC, else the default team list) plus any extra addresses.
// PATCH /api/trips { action: "alert-create", … }            "Yes, notify me" on the planner's budget card
// PATCH /api/trips { action: "alert-check" | "alert-test" | "alert-stop", id }   My price alerts
const patchSchema = z.discriminatedUnion("action", [tripEmailSchema, alertCreateSchema, alertIdSchema]);
export const PATCH = handle(async (request) => {
  const user = await requireUser(request);
  const body = await parseBody(request, patchSchema);
  if (body.action === "alert-create") {
    const userId = (await ensureAuthUser(user)).id;
    if ((await countActiveAlerts(userId)) >= ALERTS_PER_USER) throw new HttpError(409, `You already have ${ALERTS_PER_USER} active price alerts. Stop one in My price alerts first.`);
    if ((await countActiveAlerts()) >= ALERTS_TOTAL) throw new HttpError(409, "Price alerts are full right now. Sunny will contact you about this trip.");
    // The airport list's code beats a code Gemini got wrong (Kochi is COK, not COC).
    const d = { ...body.destination, airport: airportFor(body.destination.city) || body.destination.airport };
    const row = await insertAlert({
      user_id: userId, email: body.email, origin: body.origin,
      destination: d.airport ? `${d.city} (${d.airport.toUpperCase()})` : d.city,
      destination_city: d.city, destination_country: d.country, destination_code: d.airport.toUpperCase(),
      depart: body.depart, days: body.days, adults: body.adults, budget: body.budget, currency: body.currency,
      start_price: body.price, source: "gemini",
    });
    return json({ alert: toAlertView(row) });
  }
  if (body.action !== "email") {
    const userId = (await ensureAuthUser(user)).id;
    const a = await alertById(body.id);
    if (!a || a.user_id !== userId) throw new HttpError(404, "That price alert wasn't found.");
    if (body.action === "alert-stop") return json({ alert: toAlertView((await updateAlert(a.id, { status: "stopped" })) ?? { ...a, status: "stopped" }) });
    if (body.action === "alert-check" && a.status !== "active") throw new HttpError(409, "This alert isn't active any more.");
    return json(await checkAlert(a, originOf(request), body.action === "alert-test"));
  }
  if (!canEmailAnyone()) throw new HttpError(503, "Email isn't set up on the server (GMAIL_USER and GMAIL_APP_PASSWORD).");
  const pdf = Buffer.from(body.pdf, "base64");
  if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new HttpError(400, "That isn't a PDF.");
  const group = process.env.NOTIFY_CC !== undefined ? list(process.env.NOTIFY_CC) : [...DEFAULT_CC];
  const seen = new Set<string>();
  const to = [...group, ...body.extra].filter((e) => { const k = e.toLowerCase(); return !seen.has(k) && Boolean(seen.add(k)); });
  if (!to.length) throw new HttpError(400, "No one to send to: NOTIFY_CC is empty and no address was added.");
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const html = `<div style="${font}font-size:15px;line-height:1.5;color:#1d2329;max-width:640px">
<p style="margin:0 0 12px">Trip itinerary from the Sigma Travels AI Trip Planner, sent by ${esc(user.name || user.email)}. The full itinerary is attached as a PDF.</p>
${body.note ? `<p style="margin:0 0 12px;padding:10px 14px;background:#f6f7f9;border-left:3px solid #c8472b;border-radius:6px">${esc(body.note).replace(/\n/g, "<br>")}</p>` : ""}
<pre style="${font}white-space:pre-wrap;font-size:14px;background:#f6f7f9;border-radius:8px;padding:12px 14px;margin:0">${esc(body.text)}</pre>
<p style="margin:12px 0 0;font-size:12px;color:#6b7480">Prices are AI estimates, not live fares. Check availability before booking.</p></div>`;
  const r = await sendEmail({
    subject: body.subject, html, text: `${body.note ? body.note + "\n\n" : ""}${body.text}\n\nThe full itinerary is attached as a PDF.`,
    to, cc: [], replyTo: user.email || undefined,
    attachments: [{ filename: body.filename, content: pdf, contentType: "application/pdf" }],
  });
  if (!r.ok) throw new HttpError(502, r.reason);
  return json({ sentTo: to, at: new Date().toISOString() });
});
