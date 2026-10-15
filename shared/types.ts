export type Budget = "Budget" | "Mid-range" | "Luxury";

/** What the traveller tells us on the idea form. */
export interface TripBrief {
  idea: string;
  origin: string;
  start: string; // YYYY-MM-DD
  days: number; // 3–10
  pax: number; // adults, 1–6
  budget: Budget;
  interests: string[];
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

export interface RecommendResponse {
  destinations: Recommendation[];
  model: string;
}
export interface PlanResponse {
  plan: TripPlan;
  model: string;
}
