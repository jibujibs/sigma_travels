/** A booking (PNR) as read from Sabre, in the shape the agent and customer pages use. */

export interface Passenger {
  name: string;           // "SURNAME/GIVEN MR" style, as in Sabre
  type: "ADT" | "CHD" | "INF";
  passport?: string;      // last digits only, shown masked
}

export interface Segment {
  airline: string;        // "Emirates"
  flight: string;         // "EK 531"
  from: string;           // "COK"
  fromCity: string;       // "Kochi"
  to: string;
  toCity: string;
  depart: string;         // "2026-11-20T04:25" local time at departure
  arrive: string;         // local time at arrival
  cabin: string;          // "Economy (Y)"
  status: string;         // "HK" = confirmed
  baggage: string;        // "30 kg"
}

export interface Fare {
  currency: string;       // "INR"
  base: number;           // whole group, in currency units
  taxes: number;
  total: number;
}

export interface Booking {
  pnr: string;
  createdAt: string;      // when the agent created it in Sabre
  passengers: Passenger[];
  segments: Segment[];
  fare: Fare;
  ticketingDeadline: string; // "2026-10-30T23:59"
  contact: { email: string; phone: string };
  fareRules: string;      // one line: change / refund rules
  paidInSabre: boolean;   // already paid before reaching us (form of payment on the PNR)
}

export type PayRail = "stripe" | "sabre";
export type LinkStatus = "sent" | "paid" | "expired";

export interface PaymentLink {
  pnr: string;
  rail: PayRail;
  status: LinkStatus;
  amount: number;
  currency: string;
  customerEmail: string;
  url: string;
  reference?: string;     // Stripe payment id or demo reference once paid
  paidAt?: string;
  createdAt: string;
}

/** What the agent page gets for a PNR. */
export interface PnrResponse {
  booking: Booking;
  source: "sabre" | "sample";
  payment: PaymentLink | null; // latest payment link for this PNR, if any
  stripeReady: boolean;        // a Stripe test/live key is set on the server
}

/** What the public customer page gets: no agent-only details. */
export interface PayView {
  pnr: string;
  passengers: { name: string; type: Passenger["type"] }[];
  segments: Segment[];
  fare: Fare;
  rail: PayRail;
  status: LinkStatus;
  reference?: string;
  paidAt?: string;
  stripe: boolean;             // true = pays on Stripe's page; false = demo card page
}
