import { z } from "zod";
import { requireUser } from "../server/auth.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { effectiveStatus, localToDate, newToken, originOf, toPaymentLink } from "../server/payments.js";
import { getBooking } from "../server/sabre.js";
import { createPaymentLink, latestPaymentLink } from "../server/supabase.js";

const schema = z.object({
  pnr: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, "Invalid PNR"),
  rail: z.enum(["stripe", "sabre"]),
  email: z.string().trim().email("Enter the customer's email address"),
});

/**
 * POST /api/paylink { pnr, rail, email } → a secure payment link for the customer. Agents only.
 * The amount always comes from the booking on the server, never from the browser.
 */
export const POST = handle(async (request) => {
  const agent = await requireUser(request);
  const { pnr, rail, email } = await parseBody(request, schema);
  const { booking } = await getBooking(pnr);
  if (booking.paidInSabre) throw new HttpError(409, `PNR ${pnr} is already paid in Sabre. No payment link is needed.`);
  const last = await latestPaymentLink(pnr);
  if (last && effectiveStatus(last) === "paid") throw new HttpError(409, `PNR ${pnr} has already been paid (${last.reference}).`);

  const deadline = localToDate(booking.ticketingDeadline).getTime();
  if (deadline <= Date.now()) throw new HttpError(409, `The ticketing deadline for ${pnr} has passed. Re-price the booking in Sabre first.`);
  // The link works for 3 days, and never past the ticketing deadline.
  const expires = new Date(Math.min(deadline, Date.now() + 3 * 864e5));

  const row = await createPaymentLink({
    token: newToken(),
    pnr,
    rail,
    amount: booking.fare.total,
    currency: booking.fare.currency,
    customer_email: email.toLowerCase(),
    agent_email: agent.email,
    expires_at: expires.toISOString(),
  });
  return json({ payment: toPaymentLink(row, originOf(request)) });
});
