import { requireUser } from "../server/auth.js";
import { handle, HttpError, json } from "../server/http.js";
import { originOf, toPaymentLink } from "../server/payments.js";
import { getBooking } from "../server/sabre.js";
import { stripeReady } from "../server/stripe.js";
import { latestPaymentLink } from "../server/supabase.js";
import type { PnrResponse } from "../shared/booking.js";

/** GET /api/pnr?pnr=SGM7QX → the booking from Sabre (or a sample PNR) plus its latest payment link. Agents only. */
export const GET = handle(async (request) => {
  await requireUser(request);
  const pnr = (new URL(request.url).searchParams.get("pnr") ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(pnr)) throw new HttpError(400, "Enter the 6-character PNR (record locator), e.g. SGM7QX.");
  const { booking, source } = await getBooking(pnr);
  const row = await latestPaymentLink(pnr);
  const body: PnrResponse = { booking, source, payment: row ? toPaymentLink(row, originOf(request)) : null, stripeReady: stripeReady() };
  return json(body);
});
