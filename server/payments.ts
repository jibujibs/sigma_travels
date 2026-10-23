import type { Booking, PaymentLink, PayView } from "../shared/booking.js";
import type { PaymentLinkRow } from "./supabase.js";

/** A link stops working once paid, replaced, or past its expiry (set before the ticketing deadline). */
export function effectiveStatus(row: PaymentLinkRow): PaymentLinkRow["status"] {
  if (row.status === "sent" && Date.parse(row.expires_at) < Date.now()) return "expired";
  return row.status;
}

export function toPaymentLink(row: PaymentLinkRow, origin: string): PaymentLink {
  return {
    pnr: row.pnr,
    rail: row.rail,
    status: effectiveStatus(row),
    amount: Number(row.amount),
    currency: row.currency,
    customerEmail: row.customer_email,
    url: `${origin}/pay/${row.token}`,
    reference: row.reference ?? undefined,
    paidAt: row.paid_at ?? undefined,
    createdAt: row.created_at,
  };
}

/** The customer page sees names, flights and the amount only: no passport digits, contact details or agent info. */
export function toPayView(row: PaymentLinkRow, booking: Booking, stripe: boolean): PayView {
  return {
    pnr: booking.pnr,
    passengers: booking.passengers.map((p) => ({ name: p.name, type: p.type })),
    segments: booking.segments,
    fare: { ...booking.fare, total: Number(row.amount), currency: row.currency },
    rail: row.rail,
    status: effectiveStatus(row),
    reference: row.reference ?? undefined,
    paidAt: row.paid_at ?? undefined,
    stripe: row.rail === "stripe" && stripe,
  };
}

/** Booking times are local times without a zone; read them as UTC for expiry maths. */
export const localToDate = (t: string) => new Date(/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(t) ? `${t}:00Z` : t);

/** Where links point: SITE_URL if set (e.g. a custom domain), else the address this request came in on. */
export const originOf = (request: Request) => process.env.SITE_URL?.trim().replace(/\/+$/, "") || new URL(request.url).origin;

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Buffer.from(bytes).toString("base64url");
}
