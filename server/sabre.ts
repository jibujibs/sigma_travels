import type { Booking, Ticket } from "../shared/booking.js";
import { HttpError } from "./http.js";
import { getSampleBooking, SAMPLE_PNRS } from "./sabre-mock.js";

/**
 * Sabre access point for the booking & payment flow.
 *
 * Until the agency's Sabre API credentials are set up, everything here runs in demo mode:
 * bookings come from realistic sample PNRs (server/sabre-mock.ts), and writing the payment to
 * the PNR or issuing tickets is simulated (nothing is sent to Sabre).
 *
 * With SABRE_MODE=live these become Sabre REST calls (Booking Management API), against CERT
 * (test) first, then production:
 *   1. token          POST /v2/auth/token            (EPR + PCC + password → access token)
 *   2. getBooking     POST /v1/trip/orders/getBooking (PNR → travellers, flights, fares)
 *   3. modifyBooking  POST /v1/trip/orders/modifyBooking (add the payment remark to the PNR)
 *   4. fulfillTickets POST /v1/trip/orders/fulfillTickets (issue the tickets)
 * The exact request bodies are written and tested once CERT credentials are available.
 */
export const sabreMode = (): "live" | "sample" => (process.env.SABRE_MODE === "live" ? "live" : "sample");

const notConnected = (what: string) =>
  new HttpError(501, `Live Sabre ${what} isn't connected yet. It needs the agency's Sabre CERT credentials. Remove SABRE_MODE=live to use demo mode.`);

export async function getBooking(pnr: string): Promise<{ booking: Booking; source: "sabre" | "sample" }> {
  if (sabreMode() === "live") throw notConnected("booking lookup");
  const booking = await getSampleBooking(pnr);
  if (!booking) throw new HttpError(404, `PNR ${pnr} wasn't found. Sample PNRs for the demo: ${SAMPLE_PNRS.join(", ")}.`);
  return { booking, source: "sample" };
}

/** "24OCT26" — the date style Sabre uses in remarks. */
function sabreDate(iso: string): string {
  const d = new Date(iso);
  const mon = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"][d.getUTCMonth()];
  return `${String(d.getUTCDate()).padStart(2, "0")}${mon}${String(d.getUTCFullYear()).slice(2)}`;
}

/** The remark written to the PNR so the agent sees, inside Sabre, that the booking is paid. Upper-case ASCII, as Sabre stores it. */
export function paymentRemark(p: { amount: number; currency: string; rail: "stripe" | "sabre"; reference: string; paidAt: string }): string {
  const via = p.rail === "stripe" ? "STRIPE" : "SABRE";
  return `PAYMENT RECEIVED ${p.currency} ${p.amount} VIA ${via} REF ${p.reference.toUpperCase()} ${sabreDate(p.paidAt)} SIGMA AGENT DESK`;
}

/** Writes the payment remark to the PNR (modifyBooking). Demo mode: simulated. */
export async function recordPaymentInPnr(pnr: string, remark: string): Promise<{ mode: "demo" | "live" }> {
  void pnr; void remark;
  if (sabreMode() === "live") throw notConnected("payment remark");
  return { mode: "demo" };
}

// Ticket numbers start with the airline's 3-digit code.
const AIRLINE_CODES: Record<string, string> = { EK: "176", SQ: "618", UA: "016", QR: "157", AI: "098", EY: "607" };

/** Issues one ticket per passenger (fulfillTickets). Demo mode: realistic made-up numbers. */
export async function issueTickets(booking: Booking): Promise<Ticket[]> {
  if (sabreMode() === "live") throw notConnected("ticketing");
  const carrier = booking.segments[0]?.flight.split(" ")[0] ?? "";
  const prefix = AIRLINE_CODES[carrier] ?? "999";
  const base = Date.now() % 1e9;
  return booking.passengers.map((p, i) => ({ passenger: p.name, number: `${prefix}${String(base + i).padStart(10, "0")}` }));
}
