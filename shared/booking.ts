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

/** A ticket issued in Sabre for one passenger. */
export interface Ticket {
  passenger: string;      // "BIJU/AISWARYA MS"
  number: string;         // 13 digits: airline code + serial, e.g. "1762401234567"
}

/** Whether the payment has been written into the Sabre PNR, so the agent can ticket. */
export interface SabreRecord {
  status: "recorded" | "failed";
  mode: "demo" | "live";
  remark?: string;        // the remark text written to the PNR
  recordedAt?: string;
  error?: string;
}

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
  sabre?: SabreRecord;    // set once the payment has been (or failed to be) written to the Sabre PNR
  tickets?: Ticket[];     // set once tickets are issued
  ticketedAt?: string;
}

/** What the agent page gets for a PNR. */
export interface PnrResponse {
  booking: Booking;
  source: "sabre" | "sample";
  payment: PaymentLink | null; // latest payment link for this PNR, if any
  stripeReady: boolean;        // a Stripe test/live key is set on the server
  sabreMode: "live" | "sample"; // sample = Sabre calls are simulated (no credentials yet)
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

/** What "Manage my booking" (Customer tab) shows after a PNR + email match. No passport digits or contact details. */
export interface ManageView {
  pnr: string;
  passengers: { name: string; type: Passenger["type"] }[];
  segments: Segment[];
  fare: Fare;
  ticketingDeadline: string;
  /** due = not paid yet; paid = paid through our payment link; paid_in_sabre = already paid at the agency. */
  status: "due" | "paid" | "paid_in_sabre";
  /** An open payment link the customer can pay now (absent when none was sent, or it expired). */
  payUrl?: string;
  payment?: { rail: PayRail; reference?: string; paidAt?: string };
  tickets?: Ticket[];
}
