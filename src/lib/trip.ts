import type { Stop, TripBrief, TripPlan } from "../../shared/types";
import { addDays, inr, originCode, parseISO } from "./format";

export type FoodStyle = "street" | "mid" | "fine";
export interface Selection { out: number; ret: number; hotel: number; car: number }
export interface PlanState { brief: TripBrief; plan: TripPlan; sel: Selection; carOn: boolean; food: FoodStyle }

export const FOOD_LABEL: Record<FoodStyle, string> = { street: "Street & local", mid: "Mixed", fine: "Fine dining" };
const FOOD_X: Record<FoodStyle, number> = { street: 0.6, mid: 1, fine: 2.2 };

export interface BuiltStop extends Stop { isClosed: boolean }
export interface BuiltDay { title: string; date: Date; stops: BuiltStop[]; warn: number }

const mins = (t: string) => { const m = /^(\d{2}):(\d{2})$/.exec(t); return m ? +m[1] * 60 + +m[2] : -1; };

/** Home airport code: "(TRV)" typed by the user, else the origin of Gemini's outbound route, else the first letters. */
export function homeCode(plan: TripPlan, origin: string): string {
  const typed = /\(([A-Za-z]{3})\)/.exec(origin);
  if (typed) return typed[1].toUpperCase();
  const route = /^\s*([A-Z]{3})\b/.exec(plan.flights.outbound[0]?.route ?? "");
  return route ? route[1] : originCode(origin);
}

/** Default return flight: the earliest one leaving at least 2 h after the last activity of the final day. */
export function bestReturn(plan: TripPlan): number {
  const last = plan.days[plan.days.length - 1];
  const lastStop = Math.max(-1, ...(last?.stops ?? []).map((s) => mins(s.time)));
  const opts = plan.flights.return.map((f, i) => ({ i, t: mins(f.depart) }));
  const ok = opts.filter((o) => o.t >= lastStop + 120).sort((a, b) => a.t - b.t);
  if (ok.length) return ok[0].i;
  return opts.sort((a, b) => b.t - a.t)[0]?.i ?? 0;
}

export function picks(s: PlanState) {
  const p = s.plan;
  return {
    out: p.flights.outbound[s.sel.out] ?? p.flights.outbound[0],
    ret: p.flights.return[s.sel.ret] ?? p.flights.return[0],
    hotel: p.hotels[s.sel.hotel] ?? p.hotels[0],
    car: p.cars[s.sel.car] ?? p.cars[0],
  };
}

/** Plan days + the chosen flights, with {hotel}/{car} tokens swapped for the chosen options. */
export function buildDays(s: PlanState): BuiltDay[] {
  const { plan, brief } = s;
  const { out, ret, hotel, car } = picks(s);
  const useCar = s.carOn && !!car;
  const start = parseISO(brief.start);
  const carLabel = car ? car.name + (car.company ? " · " + car.company : "") : "rental car";
  const sub = (t: string) => t.replace(/\{hotel\}/g, hotel?.name ?? "your hotel").replace(/\{car\}/g, carLabel);
  const flightNote = (f: typeof out) => [f.stops, f.duration, f.arrive ? `lands ${f.arrive}${f.arrive_next_day ? " (+1 day)" : ""}` : ""].filter(Boolean).join(" · ");
  const dest = plan.destination.airport, home = homeCode(plan, brief.origin);

  return plan.days.map((d, i) => {
    const stops: Stop[] = d.stops
      .filter((x) => useCar || x.kind !== "car")
      .map((x) => ({ ...x, kind: x.kind || "visit", name: sub(x.name), note: sub(x.note || "") }));
    if (i === 0 && out) stops.unshift({ time: out.depart, kind: "flight", name: `${out.airline} · ${out.route || home + " → " + dest}`, note: flightNote(out), closed: [] });
    if (i === plan.days.length - 1 && ret) stops.push({ time: ret.depart, kind: "flight", name: `${ret.airline} · ${ret.route || dest + " → " + home}`, note: flightNote(ret), closed: [] });
    const date = addDays(start, i);
    const dow = date.getUTCDay();
    // Keep the day in time order (Gemini's stops and the chosen flight can interleave).
    const built = stops
      .map((x, k) => ({ ...x, isClosed: x.closed.includes(dow), k }))
      .sort((a, b) => (mins(a.time) < 0 || mins(b.time) < 0 ? a.k - b.k : mins(a.time) - mins(b.time) || a.k - b.k))
      .map(({ k: _k, ...x }) => x);
    return { title: d.title, date, stops: built, warn: built.filter((x) => x.isClosed).length };
  });
}

export interface QuoteLine { label: string; value: number; why: string }
export function price(s: PlanState) {
  const { plan, brief } = s;
  const { out, ret, hotel, car } = picks(s);
  const pax = brief.pax, rooms = Math.ceil(pax / 2), nights = Math.max(1, plan.days.length - 1);
  const lines: QuoteLine[] = [];
  lines.push({ label: "Flights", value: (out.fare_inr + ret.fare_inr) * pax, why: `${inr(out.fare_inr)} + ${inr(ret.fare_inr)} × ${pax} adult${pax > 1 ? "s" : ""}` });
  const tax = plan.hotel_tax_pct / 100;
  lines.push({ label: "Hotel", value: hotel.rate_inr * rooms * nights * (1 + tax), why: `${inr(hotel.rate_inr)} × ${rooms} room${rooms > 1 ? "s" : ""} × ${nights} nights${tax ? ` + ${plan.hotel_tax_pct}% tax` : ""}` });
  if (s.carOn && car && plan.car_days > 0) lines.push({ label: "Rental car", value: car.daily_inr * plan.car_days, why: `${inr(car.daily_inr)} × ${plan.car_days} day${plan.car_days > 1 ? "s" : ""} · ${car.mode}` });
  const food = plan.food_per_person_day_inr * FOOD_X[s.food];
  lines.push({ label: "Food", value: food * plan.days.length * pax, why: `${inr(food)} per person per day` });
  if (plan.activities_per_person_inr) lines.push({ label: "Sights and activities", value: plan.activities_per_person_inr * pax, why: `${inr(plan.activities_per_person_inr)} per person` });
  const total = lines.reduce((a, l) => a + l.value, 0);
  return { lines, total, perPerson: total / pax, rooms, nights, car, carTooSmall: s.carOn && !!car && pax > car.seats };
}
