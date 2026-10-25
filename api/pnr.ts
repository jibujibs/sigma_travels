import { z } from "zod";
import { requireUser } from "../server/auth.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { originOf, toPaymentLink } from "../server/payments.js";
import { getBooking, sabreMode } from "../server/sabre.js";
import { syncPaymentToSabre, ticketBooking } from "../server/sabre-sync.js";
import { stripeReady } from "../server/stripe.js";
import { latestPaymentLink } from "../server/supabase.js";
import type { PnrResponse } from "../shared/booking.js";

/** GET /api/pnr?pnr=SGM7QX → the booking from Sabre (or a sample PNR) plus its latest payment link. Agents only. */
export const GET = handle(async (request) => {
  await requireUser(request);
  const pnr = (new URL(request.url).searchParams.get("pnr") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(pnr)) throw new HttpError(400, "Enter the 6-character PNR (record locator), e.g. SGM7QX.");
  const { booking, source } = await getBooking(pnr);
  let row = await latestPaymentLink(pnr);
  // A paid booking whose payment isn't in Sabre yet (e.g. paid before this step existed): record it now.
  if (row && row.status === "paid" && !row.sabre_status) row = await syncPaymentToSabre(row);
  const body: PnrResponse = { booking, source, payment: row ? toPaymentLink(row, originOf(request)) : null, stripeReady: stripeReady(), sabreMode: sabreMode() };
  return json(body);
});

/**
 * POST /api/pnr { pnr, action } — Sabre step after payment. Agents only.
 *   action "record": (re)write the payment remark to the Sabre PNR
 *   action "issue":  issue the tickets in Sabre (records the payment first if needed)
 * (Lives here rather than in its own file: the Vercel Hobby plan allows 12 functions.)
 */
const actionSchema = z.object({
  pnr: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, "Invalid PNR"),
  action: z.enum(["record", "issue"]),
});

export const POST = handle(async (request) => {
  await requireUser(request);
  const { pnr, action } = await parseBody(request, actionSchema);
  const row = await latestPaymentLink(pnr);
  if (!row || row.status !== "paid") throw new HttpError(409, `PNR ${pnr} hasn't been paid through a payment link yet.`);
  const out = action === "record" ? await syncPaymentToSabre(row) : await ticketBooking(row);
  return json({ payment: toPaymentLink(out, originOf(request)) });
});
