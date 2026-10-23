import type { Booking } from "../shared/booking.js";

/**
 * Sample PNRs used until Sabre API access is set up (SABRE_MODE is not "live").
 * They follow what Sabre's Get Booking returns: travellers, flights, fares, payments.
 * Try SGM7QX (Kochi–Dubai return, 2 adults), TRV4LM (Trivandrum–Singapore, family),
 * SFO2NY (San Francisco–New York, USD) and PAID01 (already paid in Sabre).
 */
// Ticketing deadlines are kept a few days ahead of today, so the samples never expire mid-demo.
const inDays = (days: number, time: string) => `${new Date(Date.now() + days * 864e5).toISOString().slice(0, 10)}T${time}`;

const samples = (): Booking[] => [
  {
    pnr: "SGM7QX",
    createdAt: "2026-10-22T10:14",
    passengers: [
      { name: "BIJU/AISWARYA MS", type: "ADT", passport: "4821" },
      { name: "BIJU/ARJUN MR", type: "ADT", passport: "7765" },
    ],
    segments: [
      { airline: "Emirates", flight: "EK 531", from: "COK", fromCity: "Kochi", to: "DXB", toCity: "Dubai", depart: "2026-11-20T04:25", arrive: "2026-11-20T07:10", cabin: "Economy (Y)", status: "HK", baggage: "30 kg" },
      { airline: "Emirates", flight: "EK 530", from: "DXB", fromCity: "Dubai", to: "COK", toCity: "Kochi", depart: "2026-11-27T21:05", arrive: "2026-11-28T02:40", cabin: "Economy (Y)", status: "HK", baggage: "30 kg" },
    ],
    fare: { currency: "INR", base: 38400, taxes: 9180, total: 47580 },
    ticketingDeadline: inDays(7, "23:59"),
    contact: { email: "aiswaryabiju30@gmail.com", phone: "+91 98470 12345" },
    fareRules: "Changes allowed for INR 3,500 per person plus fare difference. Refundable for INR 6,000 per person before departure.",
    paidInSabre: false,
  },
  {
    pnr: "TRV4LM",
    createdAt: "2026-10-21T16:40",
    passengers: [
      { name: "NAIR/ANAND MR", type: "ADT", passport: "1290" },
      { name: "NAIR/DIVYA MRS", type: "ADT", passport: "5531" },
      { name: "NAIR/MEERA MISS", type: "CHD", passport: "9014" },
    ],
    segments: [
      { airline: "Singapore Airlines", flight: "SQ 525", from: "TRV", fromCity: "Trivandrum", to: "SIN", toCity: "Singapore", depart: "2026-12-18T23:50", arrive: "2026-12-19T07:00", cabin: "Economy (V)", status: "HK", baggage: "30 kg" },
      { airline: "Singapore Airlines", flight: "SQ 524", from: "SIN", fromCity: "Singapore", to: "TRV", toCity: "Trivandrum", depart: "2026-12-26T20:25", arrive: "2026-12-26T22:30", cabin: "Economy (V)", status: "HK", baggage: "30 kg" },
    ],
    fare: { currency: "INR", base: 82500, taxes: 21640, total: 104140 },
    ticketingDeadline: inDays(10, "18:00"),
    contact: { email: "anand.nair@example.com", phone: "+91 94470 55678" },
    fareRules: "Non-refundable. Date change allowed for INR 4,000 per person plus fare difference.",
    paidInSabre: false,
  },
  {
    pnr: "SFO2NY",
    createdAt: "2026-10-22T08:05",
    passengers: [{ name: "PATEL/RAHUL MR", type: "ADT", passport: "3307" }],
    segments: [
      { airline: "United Airlines", flight: "UA 1784", from: "SFO", fromCity: "San Francisco", to: "JFK", toCity: "New York", depart: "2026-11-12T07:00", arrive: "2026-11-12T15:35", cabin: "Economy (K)", status: "HK", baggage: "1 checked bag" },
      { airline: "United Airlines", flight: "UA 2215", from: "JFK", fromCity: "New York", to: "SFO", toCity: "San Francisco", depart: "2026-11-16T18:10", arrive: "2026-11-16T21:45", cabin: "Economy (K)", status: "HK", baggage: "1 checked bag" },
    ],
    fare: { currency: "USD", base: 412, taxes: 74.6, total: 486.6 },
    ticketingDeadline: inDays(5, "12:00"),
    contact: { email: "rahul.patel@example.com", phone: "+1 415 555 0142" },
    fareRules: "Changes free before departure (fare difference applies). Non-refundable; value kept as travel credit.",
    paidInSabre: false,
  },
  {
    pnr: "PAID01",
    createdAt: "2026-10-18T11:30",
    passengers: [{ name: "THOMAS/JOSEPH MR", type: "ADT", passport: "6620" }],
    segments: [
      { airline: "Qatar Airways", flight: "QR 517", from: "COK", fromCity: "Kochi", to: "DOH", toCity: "Doha", depart: "2026-11-05T04:00", arrive: "2026-11-05T06:15", cabin: "Economy (N)", status: "HK", baggage: "25 kg" },
    ],
    fare: { currency: "INR", base: 18200, taxes: 4950, total: 23150 },
    ticketingDeadline: inDays(3, "23:59"),
    contact: { email: "joseph.thomas@example.com", phone: "+91 98950 22110" },
    fareRules: "Non-refundable. Changes allowed for INR 3,000 plus fare difference.",
    paidInSabre: true,
  },
];

export const SAMPLE_PNRS = samples().map((b) => b.pnr);

/** Same contract as the real Sabre Get Booking will have: PNR in, booking out (or null if not found). */
export async function getSampleBooking(pnr: string): Promise<Booking | null> {
  return samples().find((x) => x.pnr === pnr.trim().toUpperCase()) ?? null;
}
