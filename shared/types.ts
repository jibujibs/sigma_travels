export type Budget = "Budget" | "Mid-range" | "Luxury";

/** What the traveller wants back. A full trip is all four. */
export interface Needs {
  flights: boolean;
  hotel: boolean;
  car: boolean;
  itinerary: boolean; // day-by-day plan with sightseeing, food and activities
}
export const ALL_NEEDS: Needs = { flights: true, hotel: true, car: true, itinerary: true };
export const isFullTrip = (n: Needs) => n.flights && n.hotel && n.car && n.itinerary;
/** Saved trips from before this feature have no needs: treat them as full trips. */
export const needsOf = (x: { needs?: Partial<Needs> } | null | undefined): Needs => {
  const n = x?.needs;
  if (!n) return { ...ALL_NEEDS };
  const out = { flights: !!n.flights, hotel: !!n.hotel, car: !!n.car, itinerary: !!n.itinerary };
  return out.flights || out.hotel || out.car || out.itinerary ? out : { ...ALL_NEEDS };
};

/** What the traveller tells us on the idea form. */
export interface TripBrief {
  idea: string;
  origin: string;
  start: string; // YYYY-MM-DD
  days: number; // 1–10; the return flight is on the last day
  pax: number; // adults, 1–6
  budget: Budget;
  interests: string[];
  needs?: Needs; // missing on trips saved before this feature = full trip
}

export interface Recommendation {
  city: string;
  country: string;
  airport: string;
  tagline: string;
  why: string;
  highlights: string[];
  weather: string;
  visa: string;
  flight_time: string;
  est_total_inr: number;
}

export interface Flight {
  airline: string;
  route: string;
  depart: string; // HH:MM
  arrive: string;
  arrive_next_day: boolean;
  duration: string;
  stops: string;
  fare_inr: number; // per person, one way
}

export interface Hotel {
  name: string;
  area: string;
  tier: string;
  rate_inr: number; // per room per night, before tax
  why: string;
}

export interface Car {
  name: string;
  company: string;
  seats: number;
  daily_inr: number;
  mode: string; // Self-drive | With driver
  includes: string;
}

export type StopKind = "visit" | "hotel" | "car" | "flight";

export interface Stop {
  time: string;
  name: string;
  note: string;
  kind: StopKind;
  closed: number[]; // weekdays 0=Sun…6=Sat
}

export interface PlanDay {
  title: string;
  stops: Stop[];
}

export interface TripPlan {
  needs: Needs; // which parts Gemini was asked for; the rest are empty
  destination: { city: string; country: string; airport: string; currency: string; summary: string };
  flights: { outbound: Flight[]; return: Flight[] };
  hotels: Hotel[];
  hotel_tax_pct: number;
  cars: Car[];
  car_days: number;
  car_note: string;
  food_per_person_day_inr: number;
  activities_per_person_inr: number;
  days: PlanDay[];
  tips: string[];
}

/** What the traveller's free text asks for. destination is null when no single place is named. */
export interface Intent {
  destination: { city: string; country: string; airport: string } | null;
  needs: Needs | null; // null when the text doesn't ask for anything specific
}
export interface IntentResponse extends Intent {
  model: string;
}

export interface RecommendResponse {
  destinations: Recommendation[];
  model: string;
}
export interface PlanResponse {
  plan: TripPlan;
  model: string;
}
