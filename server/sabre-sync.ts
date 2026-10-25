import { getBooking, issueTickets, paymentRemark, recordPaymentInPnr } from "./sabre.js";
import { HttpError } from "./http.js";
import { updatePaymentLink, type PaymentLinkRow } from "./supabase.js";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * After a payment, write it into the Sabre PNR so the agent can ticket.
 * Safe to call more than once: does nothing if already recorded. Never throws — a failure is
 * saved on the row (sabre_status = failed) so the Agent Desk can show it and retry.
 */
export async function syncPaymentToSabre(row: PaymentLinkRow): Promise<PaymentLinkRow> {
  if (row.status !== "paid" || row.sabre_status === "recorded") return row;
  try {
    const remark = paymentRemark({
      amount: Number(row.amount), currency: row.currency, rail: row.rail,
      reference: row.reference ?? row.token.slice(0, 8), paidAt: row.paid_at ?? new Date().toISOString(),
    });
    await recordPaymentInPnr(row.pnr, remark);
    const saved = await updatePaymentLink(row.token, { sabre_status: "recorded", sabre_remark: remark, sabre_recorded_at: new Date().toISOString(), sabre_error: null });
    return saved ?? { ...row, sabre_status: "recorded", sabre_remark: remark };
  } catch (e) {
    console.warn(`[sabre] recording payment for ${row.pnr} failed:`, msg(e));
    const failed = { sabre_status: "failed" as const, sabre_error: msg(e) };
    try { return (await updatePaymentLink(row.token, failed)) ?? { ...row, ...failed }; } catch { return { ...row, ...failed }; }
  }
}

/** Issue tickets for a paid booking whose payment is recorded in Sabre. Throws HttpError for the agent to see. */
export async function ticketBooking(row: PaymentLinkRow): Promise<PaymentLinkRow> {
  if (row.status !== "paid") throw new HttpError(409, "The customer hasn't paid yet.");
  if (row.ticketed_at) throw new HttpError(409, "Tickets are already issued for this booking.");
  const synced = await syncPaymentToSabre(row);
  if (synced.sabre_status !== "recorded") throw new HttpError(409, `Record the payment in the Sabre PNR first. ${synced.sabre_error ?? ""}`.trim());
  const { booking } = await getBooking(row.pnr);
  const tickets = await issueTickets(booking);
  const saved = await updatePaymentLink(row.token, { ticket_numbers: tickets, ticketed_at: new Date().toISOString() }, "paid");
  if (!saved) throw new HttpError(500, "Tickets were issued but couldn't be saved. Check the payment_links table columns (see README).");
  return saved;
}
