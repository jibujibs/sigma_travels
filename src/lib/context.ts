import type { Recommendation, TripBrief } from "../../shared/types";
import { fmtDate, planCur } from "./format";
import { currencyForPlace, money } from "../../shared/currency";
import { buildDays, FOOD_LABEL, needsList, picks, planNeeds, price, tripLength, type PlanState } from "./trip";

/** Plain-text summary of what the traveller sees, sent to Sigma Copilot with each question. */
export function copilotContext(brief: TripBrief, recs: Recommendation[] | null, plan: PlanState | null): string {
  const out: string[] = [];
  out.push(`Form: from ${brief.origin}; idea "${brief.idea || "-"}"; start ${brief.start}; ${brief.days} days; ${brief.pax} adult(s); ${brief.budget}; interests ${brief.interests.join(", ") || "-"}.`);
  if (recs?.length) {
    out.push("Recommended destinations: " + recs.map((r) => `${r.city}, ${r.country} (${r.airport}): ${r.tagline}; visa ${r.visa}; weather ${r.weather}; est. ${money(r.est_total_inr, currencyForPlace(brief.origin))}`).join(" | "));
  }
  if (plan) {
    out.push(`Prices are estimates in ${planCur(plan.plan)}.`);
    const p = plan.plan, cur = planCur(plan.plan), inr = (x: number) => money(x, cur), n = planNeeds(plan), { out: o, ret, hotel, car } = picks(plan), q = price(plan), days = buildDays(plan);
    out.push(`Current plan: ${p.destination.city}, ${p.destination.country} (${p.destination.airport}), ${tripLength(plan)} day(s) from ${plan.brief.start}, ${plan.brief.pax} adult(s). Shows only: ${needsList(n).join(", ")}. ${p.destination.summary}`);
    if (n.flights && o && ret) {
      out.push(`Selected outbound: ${o.airline} ${o.route} ${o.depart}-${o.arrive}${o.arrive_next_day ? "+1" : ""}, ${o.stops}, ${inr(o.fare_inr)} pp. Return: ${ret.airline} ${ret.route} ${ret.depart}-${ret.arrive}${ret.arrive_next_day ? "+1" : ""}, ${ret.stops}, ${inr(ret.fare_inr)} pp.`);
      out.push("Other flights out: " + p.flights.outbound.map((f) => `${f.airline} ${f.depart} ${inr(f.fare_inr)}`).join("; ") + ". Back: " + p.flights.return.map((f) => `${f.airline} ${f.depart} ${inr(f.fare_inr)}`).join("; "));
    }
    if (n.hotel && hotel) {
      out.push(`Selected hotel: ${hotel.name} (${hotel.area}, ${hotel.tier}) ${inr(hotel.rate_inr)}/night.`);
      out.push("Other hotels: " + p.hotels.map((h) => `${h.name} ${inr(h.rate_inr)} (${h.tier})`).join("; "));
    }
    if (n.car) out.push(`Car: ${plan.carOn && car ? `${car.name}, ${car.company}, ${car.mode}, ${inr(car.daily_inr)}/day for ${p.car_days} days` : "not included"}.`);
    if (n.itinerary) out.push(`Food style: ${FOOD_LABEL[plan.food]}.`);
    out.push(`Quote: ${q.lines.map((l) => `${l.label} ${inr(l.value)}`).join(", ")}; total ${inr(q.total)} (${inr(q.perPerson)} pp).`);
    days.forEach((d, i) => out.push(`Day ${i + 1} ${fmtDate(d.date)} ${d.title}: ` + d.stops.map((s) => `${s.time} ${s.name}${s.isClosed ? " (closed that day)" : ""}`).join("; ")));
    if (p.tips.length) out.push("Tips: " + p.tips.join(" | "));
  }
  return out.join("\n").slice(0, 15000);
}
