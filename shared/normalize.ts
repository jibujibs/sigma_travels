import { needsOf, type Car, type Flight, type Hotel, type Intent, type Needs, type PlanDay, type Recommendation, type Stop, type TripPlan } from "./types.js";

/* The model's JSON is untrusted: coerce every field into the shape the UI expects. */

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v.trim() : v == null ? d : String(v));
const num = (v: unknown, d = 0): number => {
  const n = Number(String(v ?? "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : d;
};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
export const hhmm = (v: unknown): string => {
  const m = /(\d{1,2}):(\d{2})/.exec(String(v ?? ""));
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};
const code = (v: unknown): string => str(v).replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "???";

export function normalizeRecommendations(raw: unknown): Recommendation[] {
  const list = Array.isArray(raw) ? raw : arr(obj(raw).destinations);
  return list.slice(0, 3).map((x) => {
    const d = obj(x);
    return {
      city: str(d.city, "Destination"),
      country: str(d.country),
      airport: code(d.airport),
      tagline: str(d.tagline),
      why: str(d.why),
      highlights: arr(d.highlights).slice(0, 4).map((h) => str(h)).filter(Boolean),
      weather: str(d.weather),
      visa: str(d.visa),
      flight_time: str(d.flight_time),
      est_total_inr: num(d.est_total_inr),
    };
  });
}

function flights(v: unknown): Flight[] {
  return arr(v).slice(0, 4).map((x) => {
    const f = obj(x);
    return {
      airline: str(f.airline, "Airline"),
      route: str(f.route),
      depart: hhmm(f.depart) || "09:00",
      arrive: hhmm(f.arrive),
      arrive_next_day: f.arrive_next_day === true,
      duration: str(f.duration),
      stops: str(f.stops, "Nonstop"),
      fare_inr: num(f.fare_inr),
    };
  });
}

/** Gemini's reading of the free text. Anything unclear falls back to "no destination, nothing specific". */
export function normalizeIntent(raw: unknown): Intent {
  const r = obj(raw);
  const d = obj(r.destination);
  const city = str(d.city);
  const destination = city ? { city, country: str(d.country), airport: str(d.airport).replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() } : null;
  const n = obj(r.needs);
  const needs: Needs = { flights: n.flights === true, hotel: n.hotel === true, car: n.car === true, itinerary: n.itinerary === true };
  const any = needs.flights || needs.hotel || needs.car || needs.itinerary;
  return { destination, needs: r.specific === true && any ? needs : null };
}

/** needs: what was asked for. When omitted (re-saving an existing plan) it is read from the plan itself. */
export function normalizePlan(raw: unknown, days: number, needsIn?: Needs): TripPlan {
  const p = obj(raw);
  const needs = needsIn ?? needsOf(p as { needs?: Partial<Needs> });
  const d = obj(p.destination);
  const fl = obj(p.flights);
  const hotels: Hotel[] = arr(p.hotels).slice(0, 5).map((x) => {
    const h = obj(x);
    return { name: str(h.name, "Hotel"), area: str(h.area), tier: str(h.tier), rate_inr: num(h.rate_inr), why: str(h.why) };
  });
  const cars: Car[] = arr(p.cars).slice(0, 4).map((x) => {
    const c = obj(x);
    return {
      name: str(c.name, "Car"), company: str(c.company), seats: Math.round(num(c.seats, 4)),
      daily_inr: num(c.daily_inr), mode: str(c.mode, "Self-drive"), includes: str(c.includes),
    };
  });
  const planDays: PlanDay[] = arr(p.days).slice(0, days).map((x) => {
    const day = obj(x);
    const stops: Stop[] = arr(day.stops).slice(0, 9).map((y) => {
      const s = obj(y);
      const kind = s.kind === "hotel" || s.kind === "car" ? s.kind : "visit";
      return {
        time: hhmm(s.time), name: str(s.name, "Stop"), note: str(s.note), kind,
        closed: arr(s.closed).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
      };
    });
    return { title: str(day.title, "Explore"), stops };
  });
  const plan: TripPlan = {
    needs,
    destination: { city: str(d.city, "Destination"), country: str(d.country), airport: code(d.airport), currency: str(d.currency), summary: str(d.summary) },
    flights: needs.flights ? { outbound: flights(fl.outbound), return: flights(fl.return) } : { outbound: [], return: [] },
    hotels: needs.hotel ? hotels : [],
    hotel_tax_pct: needs.hotel ? Math.min(40, Math.max(0, Number(p.hotel_tax_pct) || 0)) : 0,
    cars: needs.car ? cars : [],
    car_days: needs.car ? Math.min(days, Math.max(0, Math.round(Number(p.car_days) || 0))) || (needs.itinerary ? 0 : days) : 0,
    car_note: needs.car ? str(p.car_note) : "",
    food_per_person_day_inr: needs.itinerary ? num(p.food_per_person_day_inr, 1500) : 0,
    activities_per_person_inr: needs.itinerary ? num(p.activities_per_person_inr) : 0,
    days: needs.itinerary ? planDays : [],
    tips: arr(p.tips).slice(0, 6).map((t) => str(t)).filter(Boolean),
  };
  const missing = [
    needs.flights && !plan.flights.outbound.length && "outbound flights",
    needs.flights && !plan.flights.return.length && "return flights",
    needs.hotel && !plan.hotels.length && "hotels",
    needs.car && !plan.cars.length && "cars",
    needs.itinerary && !plan.days.length && "days",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Plan is missing ${missing.join(", ")}`);
  return plan;
}
