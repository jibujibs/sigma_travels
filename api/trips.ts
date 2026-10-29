import { requireUser } from "../server/auth.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { deleteTrip, ensureAuthUser, getTrip, listTrips, saveTrip } from "../server/supabase.js";
import { normalizePlan } from "../shared/normalize.js";
import { saveTripSchema, tripEmailSchema } from "../shared/schemas.js";
import { canEmailAnyone, sendEmail } from "../server/email.js";
import { DEFAULT_CC } from "../shared/contact.js";

/** Saved trips, stored in Supabase's existing "itineraries" table, per signed-in account. */

async function account(request: Request): Promise<string> {
  const user = await requireUser(request);
  return (await ensureAuthUser(user)).id;
}

// GET /api/trips           → list (newest first)
// GET /api/trips?id=…      → one trip with its full plan
export const GET = handle(async (request) => {
  const userId = await account(request);
  const id = new URL(request.url).searchParams.get("id");
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
  const saved = await saveTrip(userId, body.brief, { plan, sel: body.sel, carOn: body.carOn, food: body.food }, body.total);
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
export const PATCH = handle(async (request) => {
  const user = await requireUser(request);
  const body = await parseBody(request, tripEmailSchema);
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
${body.note ? `<p style="margin:0 0 12px;padding:10px 14px;background:#f6f7f9;border-left:3px solid #0f766e;border-radius:6px">${esc(body.note).replace(/\n/g, "<br>")}</p>` : ""}
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
