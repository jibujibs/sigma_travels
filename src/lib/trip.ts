import type { Stop, TripBrief, TripPlan } from "../../shared/types";
import { addDays, inr, originCode, parseISO } from "./format";

export type FoodStyle = "street" | "mid" | "fine";
export interface Selection { out: number; ret: number; hotel: number; car: number }
export interface PlanState { brief: TripBrief; plan: TripPlan; sel: Selection; carOn: boolean; food: FoodStyle }

export const FOOD_LABEL: Record<FoodStyle, string> = { street: "Street & local", mid: "Mixed", fine: "Fine dining" };
const FOOD_X: Record<FoodStyle, number> = { street: 0.6, mid: 1, fine: 2.2 };

export interface BuiltStop extends Stop { isClosed: boolean }
export interface BuiltDay { title: string; date: Date; stops: BuiltStop[]; warn: number }

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
  const dest = plan.destination.airport, home = originCode(brief.origin);

  return plan.days.map((d, i) => {
    const stops: Stop[] = d.stops
      .filter((x) => useCar || x.kind !== "car")
      .map((x) => ({ ...x, kind: x.kind || "visit", name: sub(x.name), note: sub(x.note || "") }));
    if (i === 0 && out) stops.unshift({ time: out.depart, kind: "flight", name: `${out.airline} · ${out.route || home + " → " + dest}`, note: flightNote(out), closed: [] });
    if (i === plan.days.length - 1 && ret) stops.push({ time: ret.depart, kind: "flight", name: `${ret.airline} · ${ret.route || dest + " → " + home}`, note: flightNote(ret), closed: [] });
    const date = addDays(start, i);
    const dow = date.getUTCDay();
    const built = stops.map((x) => ({ ...x, isClosed: x.closed.includes(dow) }));
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
