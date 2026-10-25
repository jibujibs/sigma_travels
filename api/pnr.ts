import { requireUser } from "../server/auth.js";
import { handle, HttpError, json } from "../server/http.js";
import { originOf, toPaymentLink } from "../server/payments.js";
import { getBooking, sabreMode } from "../server/sabre.js";
import { syncPaymentToSabre } from "../server/sabre-sync.js";
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
