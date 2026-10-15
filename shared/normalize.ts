import type { Car, Flight, Hotel, PlanDay, Recommendation, Stop, TripPlan } from "./types.js";

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

export function normalizePlan(raw: unknown, days: number): TripPlan {
  const p = obj(raw);
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
    destination: { city: str(d.city, "Destination"), country: str(d.country), airport: code(d.airport), currency: str(d.currency), summary: str(d.summary) },
    flights: { outbound: flights(fl.outbound), return: flights(fl.return) },
    hotels,
    hotel_tax_pct: Math.min(40, Math.max(0, Number(p.hotel_tax_pct) || 0)),
    cars,
    car_days: Math.min(days, Math.max(0, Math.round(Number(p.car_days) || 0))),
    car_note: str(p.car_note),
    food_per_person_day_inr: num(p.food_per_person_day_inr, 1500),
    activities_per_person_inr: num(p.activities_per_person_inr),
    days: planDays,
    tips: arr(p.tips).slice(0, 6).map((t) => str(t)).filter(Boolean),
  };
  const missing = [
    !plan.flights.outbound.length && "outbound flights",
    !plan.flights.return.length && "return flights",
    !plan.hotels.length && "hotels",
    !plan.days.length && "days",
  ].filter(Boolean);
  if (missing.length) throw new Error(`Plan is missing ${missing.join(", ")}`);
  return plan;
}
