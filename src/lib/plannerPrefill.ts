import type { TripBrief } from "../../shared/types";
import { placeLabel, type VoiceTrip } from "../../shared/voice";

/** Hands a voice message's trip from the Agent tab to the AI Trip Planner tab ("Open in AI Trip Planner"). */
const KEY = "sigma-planner-prefill";

export interface PlannerPrefill { trip: VoiceTrip; from: string }

export function setPlannerPrefill(p: PlannerPrefill): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked: the planner opens empty */ }
}

/** Read without removing (React's StrictMode runs state initialisers twice); clearPlannerPrefill() after mount. */
export function peekPlannerPrefill(): PlannerPrefill | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PlannerPrefill) : null;
  } catch {
    return null;
  }
}

/** Used once: the next visit to the planner starts normally. */
export function clearPlannerPrefill(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}

const dayMs = 864e5;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The planner form filled from a voice trip; anything the customer didn't say keeps the planner's own value. */
export function briefFromTrip(base: TripBrief, t: VoiceTrip, today: string): TripBrief {
  const start = t.depart && t.depart >= today ? t.depart : base.start;
  const days = t.depart && t.return ? clamp(Math.round((Date.parse(t.return) - Date.parse(t.depart)) / dayMs) + 1, 1, 10) : base.days;
  const pax = t.adults + t.children > 0 ? clamp(t.adults + t.children, 1, 6) : base.pax;
  return {
    ...base,
    idea: t.to ? t.to.city : base.idea,
    origin: t.from ? placeLabel(t.from) : base.origin,
    start,
    days,
    pax,
    needs: { flights: true, hotel: true, car: true, itinerary: true },
  };
}
