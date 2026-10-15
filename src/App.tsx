import { useCallback, useEffect, useRef, useState } from "react";
import type { Recommendation, TripBrief } from "../shared/types";
import { CopilotDrawer } from "./components/CopilotDrawer";
import { IdeaForm } from "./components/IdeaForm";
import { MyTrips } from "./components/MyTrips";
import { PlanView } from "./components/PlanView";
import { Recommendations } from "./components/Recommendations";
import { api, ApiError, type TripSummary } from "./lib/api";
import { copilotContext } from "./lib/context";
import { getGuestId } from "./lib/guest";
import { addDays, iso, todayUTC } from "./lib/format";
import { downloadTripPdf } from "./lib/pdf";
import { bestReturn, price, type PlanState } from "./lib/trip";

const STORE = "sigma-ai-planner-v1";

const defaultBrief = (): TripBrief => ({
  idea: "", origin: "Kochi (COK)", start: iso(addDays(todayUTC(), 30)), days: 7, pax: 2, budget: "Mid-range", interests: [],
});

/** Only the traveller's preferences survive a refresh; results always start empty. */
interface Prefs { origin: string; start: string; days: number; pax: number; budget: TripBrief["budget"] }

function loadBrief(): TripBrief {
  const brief = defaultBrief();
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? "null") as (Partial<Prefs> & { brief?: Partial<Prefs> }) | null;
    const p = raw?.brief ?? raw; // older versions saved { brief, recs, planState, ... }
    if (!p) return brief;
    return {
      ...brief,
      origin: typeof p.origin === "string" && p.origin.trim() ? p.origin : brief.origin,
      start: typeof p.start === "string" && p.start >= iso(todayUTC()) ? p.start : brief.start,
      days: Number(p.days) >= 3 && Number(p.days) <= 10 ? Number(p.days) : brief.days,
      pax: Number(p.pax) >= 1 && Number(p.pax) <= 6 ? Number(p.pax) : brief.pax,
      budget: p.budget === "Budget" || p.budget === "Luxury" || p.budget === "Mid-range" ? p.budget : brief.budget,
    };
  } catch {
    return brief;
  }
}

type Busy = { label: string; startedAt: number } | null;

export default function App() {
  const [brief, setBrief] = useState<TripBrief>(loadBrief);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [planState, setPlanState] = useState<PlanState | null>(null);
  const [model, setModel] = useState<string | undefined>();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string>();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const ctl = useRef<AbortController | null>(null);
  const toastTimer = useRef<number>(undefined);
  const [guestId] = useState(getGuestId);
  // Saved trips (Supabase). null = not checked yet, false = Supabase not configured/reachable.
  const [tripsOn, setTripsOn] = useState<boolean | null>(null);
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [showTrips, setShowTrips] = useState(false);
  const [tripBusy, setTripBusy] = useState<string | null>(null);
  const [savedFor, setSavedFor] = useState<PlanState | null>(null);

  const refreshTrips = useCallback(async () => {
    try {
      const r = await api.trips.list(guestId);
      setTrips(r.trips);
      setTripsOn(true);
    } catch (e) {
      setTripsOn(false);
      if (!(e instanceof ApiError && e.status === 503)) console.warn("My trips unavailable:", (e as Error).message);
    }
  }, [guestId]);

  useEffect(() => { void refreshTrips(); }, [refreshTrips]);

  useEffect(() => {
    const prefs: Prefs = { origin: brief.origin, start: brief.start, days: brief.days, pax: brief.pax, budget: brief.budget };
    try { localStorage.setItem(STORE, JSON.stringify(prefs)); } catch { /* storage full or blocked */ }
  }, [brief.origin, brief.start, brief.days, brief.pax, brief.budget]);

  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [busy]);

  const toast = (m: string) => {
    setToastMsg(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2600);
  };

  async function run<T>(label: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setError(null);
    setBusy({ label, startedAt: Date.now() });
    try {
      return await fn(c.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
      return null;
    } finally {
      if (ctl.current === c) setBusy(null);
    }
  }

  async function recommend() {
    if (!brief.idea.trim() && brief.interests.length === 0) { setFormError("Describe an idea, pick a famous spot or choose an interest."); return; }
    setFormError(undefined);
    const r = await run("Finding destinations that fit", (s) => api.recommend(brief, s));
    if (!r) return;
    // New recommendations replace the old ones and clear the previous destination's plan
    // until the traveller picks one of the new destinations.
    setRecs(r.destinations);
    setPlanState(null);
    setModel(r.model);
    setTimeout(() => document.getElementById("recs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function plan(rec: Recommendation) {
    const r = await run(`Planning ${rec.city}: flights, hotel, car and ${brief.days} days`, (s) => api.plan(brief, rec, s));
    if (!r) return;
    setPlanState({ brief: { ...brief }, plan: r.plan, sel: { out: 0, ret: bestReturn(r.plan), hotel: 0, car: 0 }, carOn: r.plan.car_days > 0, food: "mid" });
    setModel(r.model);
    toast(`${rec.city} plan ready`);
    setTimeout(() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function saveTrip() {
    if (!planState) return;
    try {
      await api.trips.save(guestId, planState, price(planState).total);
      setSavedFor(planState);
      toast("Saved to My trips");
      void refreshTrips();
    } catch (e) {
      toast(e instanceof ApiError && e.status === 503 ? "Saving isn't set up yet (Supabase keys missing)" : `Couldn't save: ${(e as Error).message}`);
    }
  }

  async function openTrip(id: string) {
    setTripBusy(id);
    try {
      const { trip } = await api.trips.get(guestId, id);
      const st: PlanState = { brief: trip.criteria, plan: trip.segments.plan, sel: trip.segments.sel, carOn: trip.segments.carOn, food: trip.segments.food };
      setRecs(null);
      setPlanState(st);
      setSavedFor(st);
      setModel(undefined);
      setShowTrips(false);
      setTimeout(() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      toast(`Couldn't open the trip: ${(e as Error).message}`);
    } finally {
      setTripBusy(null);
    }
  }

  async function deleteTrip(id: string) {
    if (!window.confirm("Delete this saved trip?")) return;
    setTripBusy(id);
    try {
      await api.trips.remove(guestId, id);
      setTrips((t) => t.filter((x) => x.id !== id));
      toast("Trip deleted");
    } catch (e) {
      toast(`Couldn't delete: ${(e as Error).message}`);
    } finally {
      setTripBusy(null);
    }
  }

  const getContext = useCallback(() => copilotContext(brief, recs, planState), [brief, recs, planState]);

  const secs = busy ? Math.round((Date.now() - busy.startedAt) / 1000) : 0;

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand"><span className="logo">Σ</span>Sigma Travels · Trip Planner</div>
        <div className="top-actions">
          {tripsOn && <button className="btn" onClick={() => setShowTrips((v) => !v)} aria-expanded={showTrips}>My trips{trips.length ? ` (${trips.length})` : ""}</button>}
          <span className="demo">AI estimates · no real booking</span>
        </div>
      </div>

      {showTrips && tripsOn && <MyTrips trips={trips} busyId={tripBusy} onOpen={openTrip} onDelete={deleteTrip} onClose={() => setShowTrips(false)} />}

      <IdeaForm brief={brief} onChange={setBrief} onSubmit={recommend} busy={!!busy} error={formError} />

      {busy && (
        <div className="status" role="status">
          <div className="msg"><span className="spin" aria-hidden="true" /><span>{busy.label}… {secs}s</span></div>
          <button className="btn" onClick={() => { ctl.current?.abort(); setBusy(null); }}>Stop</button>
        </div>
      )}
      {error && !busy && (
        <div className="status err" role="alert">
          <div className="msg"><span>{error}</span></div>
          <button className="btn" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {recs && <div id="recs"><Recommendations recs={recs} planned={planState?.plan.destination.city} pax={brief.pax} busy={!!busy} onPlan={plan} /></div>}

      {planState && <PlanView
        key={`${planState.plan.destination.city}-${planState.brief.start}-${planState.plan.days.length}`}
        state={planState}
        example={false}
        model={model}
        onChange={setPlanState}
        onPdf={() => downloadTripPdf(planState)}
        onNewTrip={() => { window.scrollTo({ top: 0, behavior: "smooth" }); document.getElementById("idea")?.focus(); }}
        toast={toast}
        onSave={tripsOn ? saveTrip : undefined}
        saved={savedFor === planState}
      />}

      <CopilotDrawer guestId={guestId} getContext={getContext} hasPlan={!!planState} raised={!!planState} />

      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}
