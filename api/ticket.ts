import { z } from "zod";
import { requireUser } from "../server/auth.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { originOf, toPaymentLink } from "../server/payments.js";
import { syncPaymentToSabre, ticketBooking } from "../server/sabre-sync.js";
import { latestPaymentLink } from "../server/supabase.js";

/**
 * POST /api/ticket { pnr, action } — agents only.
 *   action "record": (re)write the payment remark to the Sabre PNR
 *   action "issue":  issue the tickets in Sabre (records the payment first if needed)
 */
const schema = z.object({
  pnr: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, "Invalid PNR"),
  action: z.enum(["record", "issue"]),
});

export const POST = handle(async (request) => {
  await requireUser(request);
  const { pnr, action } = await parseBody(request, schema);
  const row = await latestPaymentLink(pnr);
  if (!row || row.status !== "paid") throw new HttpError(409, `PNR ${pnr} hasn't been paid through a payment link yet.`);
  const out = action === "record" ? await syncPaymentToSabre(row) : await ticketBooking(row);
  return json({ payment: toPaymentLink(out, originOf(request)) });
});
