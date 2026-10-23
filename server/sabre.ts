import type { Booking } from "../shared/booking.js";
import { HttpError } from "./http.js";
import { getSampleBooking, SAMPLE_PNRS } from "./sabre-mock.js";

/**
 * Sabre access point for the booking & payment flow.
 *
 * Until the agency's Sabre API credentials are set up, bookings come from realistic
 * sample PNRs (server/sabre-mock.ts). With SABRE_MODE=live, this is where the
 * Booking Management API calls go: token (/v2/auth/token), Get Booking
 * (/v1/trip/orders/getBooking), Modify Booking (payment remark) and Fulfill
 * Tickets (ticket issue). Those are added once CERT credentials are available.
 */
export const sabreMode = (): "live" | "sample" => (process.env.SABRE_MODE === "live" ? "live" : "sample");

export async function getBooking(pnr: string): Promise<{ booking: Booking; source: "sabre" | "sample" }> {
  if (sabreMode() === "live") {
    throw new HttpError(501, "Live Sabre access isn't connected yet. Remove SABRE_MODE=live to use the sample PNRs.");
  }
  const booking = await getSampleBooking(pnr);
  if (!booking) throw new HttpError(404, `PNR ${pnr} wasn't found. Sample PNRs for the demo: ${SAMPLE_PNRS.join(", ")}.`);
  return { booking, source: "sample" };
}
