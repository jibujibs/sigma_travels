import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ALL_NEEDS, isFullTrip, needsOf, type Intent, type Needs, type Recommendation, type TripBrief } from "../shared/types";
import { AccountMenu } from "./components/AccountMenu";
import { CopilotDrawer } from "./components/CopilotDrawer";
import { HomeAirport } from "./components/HomeAirport";
import { IdeaForm } from "./components/IdeaForm";
import { MyTrips } from "./components/MyTrips";
import { PlanView } from "./components/PlanView";
import { Recommendations } from "./components/Recommendations";
import { api, ApiError, type Profile, type TripSummary } from "./lib/api";
import { copilotContext } from "./lib/context";
import { getGuestId } from "./lib/guest";
import { addDays, iso, todayUTC } from "./lib/format";
import { downloadTripPdf } from "./lib/pdf";
import { bestReturn, needsList, planNeeds, price, tripLength, type PlanState } from "./lib/trip";

const STORE = "sigma-ai-planner-v1";

const defaultBrief = (): TripBrief => ({
  idea: "", origin: "", start: iso(addDays(todayUTC(), 30)), days: 7, pax: 2, budget: "Mid-range", interests: [], needs: { ...ALL_NEEDS },
});

const sameNeeds = (a: Needs, b: Needs) => a.flights === b.flights && a.hotel === b.hotel && a.car === b.car && a.itinerary === b.itinerary;
const needsText = (n: Needs) => needsList(n).join(" and ").toLowerCase();
type Place = Pick<Recommendation, "city" | "country" | "airport">;

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
      days: Number(p.days) >= 1 && Number(p.days) <= 10 ? Number(p.days) : brief.days,
      pax: Number(p.pax) >= 1 && Number(p.pax) <= 6 ? Number(p.pax) : brief.pax,
      budget: p.budget === "Budget" || p.budget === "Luxury" || p.budget === "Mid-range" ? p.budget : brief.budget,
    };
  } catch {
    return brief;
  }
}

type Busy = { label: string; startedAt: number } | null;

interface Props {
  /** The signed-in traveller (Google account) with their saved home airport. */
  user: Profile;
  onSaveHomeAirport: (airport: string) => Promise<void>;
  onSignOut: () => void;
  /** Section tabs shown in the header (booking desk / trip planner). */
  nav?: ReactNode;
  /** Brand shown top-left; defaults to the planner's own name. */
  brand?: ReactNode;
}

export default function App({ user, onSaveHomeAirport, onSignOut, nav, brand }: Props) {
  // "From" starts at the account's home airport; it can still be changed for a single search.
  const [brief, setBrief] = useState<TripBrief>(() => {
    const b = loadBrief();
    return user.homeAirport ? { ...b, origin: user.homeAirport } : b;
  });
  const [editAirport, setEditAirport] = useState(false);
  const [recs, setRecs] = useState<Recommendation[] | null>(null);
  const [planState, setPlanState] = useState<PlanState | null>(null);
  const [model, setModel] = useState<string | undefined>();
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string>();
  const [originError, setOriginError] = useState<string>();
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
  // True once the traveller ticks "I need" boxes by hand; a request that names no specific parts then keeps their ticks.
  const [needsTouched, setNeedsTouched] = useState(false);
  const [understood, setUnderstood] = useState<string>();

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

  /** Search: read the request, then go straight to the named place or suggest three. */
  async function search() {
    const noIdea = !brief.idea.trim() && brief.interests.length === 0;
    const noOrigin = brief.origin.trim().length < 2;
    setFormError(noIdea ? "Describe what you need, pick a famous spot or choose an interest." : undefined);
    setOriginError(noOrigin ? "Enter the city you're flying from." : undefined);
    if (noIdea || noOrigin) {
      if (!noIdea) document.getElementById("origin")?.focus();
      return;
    }
    setUnderstood(undefined);
    const formNeeds = needsTouched ? needsOf(brief) : { ...ALL_NEEDS };
    let b: TripBrief = { ...brief, needs: formNeeds };
    let place: Place | null = null;
    if (brief.idea.trim()) {
      // If reading the request fails, carry on as a normal search instead of showing an error.
      const failed: Intent = { destination: null, needs: null };
      const intent = await run("Reading your request", async (sig) => {
        try { return await api.intent(brief.idea, brief.origin, sig); }
        catch (e) { if ((e as Error).name === "AbortError") throw e; console.warn("Couldn't read the request:", (e as Error).message); return failed; }
      });
      if (!intent) return; // stopped
      if (intent.needs) {
        b = { ...b, needs: intent.needs };
        if (!isFullTrip(intent.needs)) setUnderstood(`Showing ${needsText(intent.needs)} only, as you asked. Tick more above and press Update results to add the rest.`);
      }
      place = intent.destination;
    }
    setBrief(b);
    setNeedsTouched(false);
    if (place) {
      setRecs(null);
      await plan(place, b);
    } else {
      await recommend(b);
    }
  }

  async function recommend(b: TripBrief = brief) {
    const r = await run("Finding destinations that fit", (s) => api.recommend(b, s));
    if (!r) return;
    // New recommendations replace the old ones and clear the previous destination's plan
    // until the traveller picks one of the new destinations.
    setRecs(r.destinations);
    setPlanState(null);
    setModel(r.model);
    setTimeout(() => document.getElementById("recs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function plan(place: Place, b: TripBrief = brief) {
    if (b.origin.trim().length < 2) {
      setOriginError("Enter the city you're flying from.");
      document.getElementById("origin")?.focus();
      return;
    }
    const needs = needsOf(b);
    const label = isFullTrip(needs) ? `Planning ${place.city}: flights, hotel, car and ${b.days} days` : `Finding ${needsText(needs)} for ${place.city}`;
    const r = await run(label, (s) => api.plan(b, place, s));
    if (!r) return;
    setPlanState({ brief: { ...b }, plan: r.plan, sel: { out: 0, ret: bestReturn(r.plan), hotel: 0, car: 0 }, carOn: r.plan.car_days > 0, food: "mid" });
    setModel(r.model);
    toast(`${place.city} ${isFullTrip(needs) ? "plan" : needsText(needs)} ready`);
    setTimeout(() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  /** The ticked parts changed while a plan is on screen: rebuild it for the same place. */
  function applyNeeds() {
    if (!planState) return;
    const d = planState.plan.destination;
    setUnderstood(undefined);
    setNeedsTouched(false);
    void plan({ city: d.city, country: d.country, airport: d.airport }, brief);
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
        {brand ?? <div className="brand"><span className="logo">Σ</span>Sigma Travels · Trip Planner</div>}
        {nav}
        <div className="top-actions">
          {tripsOn && <button className="btn" onClick={() => setShowTrips((v) => !v)} aria-expanded={showTrips}>My trips{trips.length ? ` (${trips.length})` : ""}</button>}
          <span className="demo">AI estimates · no real booking</span>
          <AccountMenu user={user} onChangeAirport={() => setEditAirport(true)} onSignOut={onSignOut} />
        </div>
      </div>

      {editAirport && (
        <HomeAirport
          name={user.name}
          initial={user.homeAirport}
          onCancel={() => setEditAirport(false)}
          onSave={async (airport) => {
            await onSaveHomeAirport(airport);
            setBrief((b) => ({ ...b, origin: airport }));
            setOriginError(undefined);
            setEditAirport(false);
            toast(`Home airport set to ${airport}`);
          }}
        />
      )}

      {showTrips && tripsOn && <MyTrips trips={trips} busyId={tripBusy} onOpen={openTrip} onDelete={deleteTrip} onClose={() => setShowTrips(false)} />}

      <IdeaForm
        brief={brief}
        onChange={(b) => {
          if (!sameNeeds(needsOf(b), needsOf(brief))) setNeedsTouched(true);
          if (originError && b.origin.trim().length >= 2) setOriginError(undefined);
          setBrief(b);
        }}
        onSubmit={search}
        busy={!!busy}
        error={formError}
        originError={originError}
        understood={understood}
        onApplyNeeds={planState && !sameNeeds(needsOf(brief), planNeeds(planState)) ? applyNeeds : undefined}
      />

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
        key={`${planState.plan.destination.city}-${planState.brief.start}-${tripLength(planState)}-${needsList(planNeeds(planState)).join("")}`}
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
