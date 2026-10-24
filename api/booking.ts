import { z } from "zod";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { effectiveStatus, originOf } from "../server/payments.js";
import { getBooking } from "../server/sabre.js";
import { latestPaymentLink } from "../server/supabase.js";
import type { ManageView } from "../shared/booking.js";

/**
 * POST /api/booking { pnr, email } → "Manage my booking" for the Customer tab. Public (customers don't sign in).
 * The email must match the booking's contact email (or the email the payment link was sent to), so knowing a
 * PNR alone shows nothing. A wrong PNR and a wrong email give the same answer, so neither can be probed.
 */
const bodySchema = z.object({
  pnr: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, "Enter the 6-character booking reference (PNR), e.g. SGM7QX."),
  email: z.string().trim().toLowerCase().email("Enter the email address used for the booking."),
});

const NOT_FOUND = "We couldn't find a booking with that PNR and email. Check both, or contact your travel agent.";

export const POST = handle(async (request) => {
  const { pnr, email } = await parseBody(request, bodySchema);

  let booking;
  try {
    ({ booking } = await getBooking(pnr));
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) throw new HttpError(404, NOT_FOUND);
    throw err;
  }
  const row = await latestPaymentLink(pnr);
  const emails = [booking.contact.email, row?.customer_email].filter(Boolean).map((e) => e!.trim().toLowerCase());
  if (!emails.includes(email)) throw new HttpError(404, NOT_FOUND);

  const linkStatus = row ? effectiveStatus(row) : null;
  const status: ManageView["status"] = booking.paidInSabre ? "paid_in_sabre" : linkStatus === "paid" ? "paid" : "due";
  const view: ManageView = {
    pnr: booking.pnr,
    passengers: booking.passengers.map((p) => ({ name: p.name, type: p.type })),
    segments: booking.segments,
    // The amount comes from the payment link when one exists (that is what the customer is charged).
    fare: row ? { ...booking.fare, total: Number(row.amount), currency: row.currency } : booking.fare,
    ticketingDeadline: booking.ticketingDeadline,
    status,
    payUrl: status === "due" && row && linkStatus === "sent" ? `${originOf(request)}/pay/${row.token}` : undefined,
    payment: status === "paid" && row ? { rail: row.rail, reference: row.reference ?? undefined, paidAt: row.paid_at ?? undefined } : undefined,
  };
  return json(view);
});
