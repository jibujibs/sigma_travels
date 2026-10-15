import { useEffect, useRef, useState } from "react";
import { EXAMPLE_BRIEF, EXAMPLE_PLAN } from "../shared/example";
import type { Recommendation, TripBrief } from "../shared/types";
import { IdeaForm } from "./components/IdeaForm";
import { PlanView } from "./components/PlanView";
import { Recommendations } from "./components/Recommendations";
import { api } from "./lib/api";
import { addDays, iso, todayUTC } from "./lib/format";
import { downloadTripPdf } from "./lib/pdf";
import type { PlanState } from "./lib/trip";

const STORE = "sigma-ai-planner-v1";

interface Saved { brief: TripBrief; recs: Recommendation[] | null; planState: PlanState; example: boolean; model?: string }

function load(): Saved {
  const fallback: Saved = {
    brief: { ...EXAMPLE_BRIEF, start: EXAMPLE_BRIEF.start < iso(todayUTC()) ? iso(addDays(todayUTC(), 30)) : EXAMPLE_BRIEF.start },
    recs: null,
    planState: { brief: EXAMPLE_BRIEF, plan: EXAMPLE_PLAN, sel: { out: 1, ret: 1, hotel: 0, car: 0 }, carOn: true, food: "mid" },
    example: true,
  };
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null") as Saved | null;
    return v?.planState?.plan && v.brief ? v : fallback;
  } catch {
    return fallback;
  }
}

type Busy = { label: string; startedAt: number } | null;

export default function App() {
  const initial = useRef(load()).current;
  const [brief, setBrief] = useState<TripBrief>(initial.brief);
  const [recs, setRecs] = useState<Recommendation[] | null>(initial.recs);
  const [planState, setPlanState] = useState<PlanState>(initial.planState);
  const [example, setExample] = useState(initial.example);
  const [model, setModel] = useState<string | undefined>(initial.model);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string>();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const ctl = useRef<AbortController | null>(null);
  const toastTimer = useRef<number>(undefined);

  useEffect(() => {
    try { localStorage.setItem(STORE, JSON.stringify({ brief, recs, planState, example, model })); } catch { /* storage full or blocked */ }
  }, [brief, recs, planState, example, model]);

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
    setRecs(r.destinations);
    setModel(r.model);
    setTimeout(() => document.getElementById("recs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function plan(rec: Recommendation) {
    const r = await run(`Planning ${rec.city}: flights, hotel, car and ${brief.days} days`, (s) => api.plan(brief, rec, s));
    if (!r) return;
    setPlanState({ brief: { ...brief }, plan: r.plan, sel: { out: 0, ret: 0, hotel: 0, car: 0 }, carOn: r.plan.car_days > 0, food: "mid" });
    setExample(false);
    setModel(r.model);
    toast(`${rec.city} plan ready`);
    setTimeout(() => document.getElementById("plan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  const secs = busy ? Math.round((Date.now() - busy.startedAt) / 1000) : 0;

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand"><span className="logo">Σ</span>Sigma Travels · Trip Planner</div>
        <span className="demo">AI estimates · no real booking</span>
      </div>

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

      {recs && <div id="recs"><Recommendations recs={recs} pax={brief.pax} busy={!!busy} onPlan={plan} /></div>}

      <PlanView
        state={planState}
        example={example}
        model={model}
        onChange={setPlanState}
        onPdf={() => downloadTripPdf(planState)}
        onNewTrip={() => { window.scrollTo({ top: 0, behavior: "smooth" }); document.getElementById("idea")?.focus(); }}
        toast={toast}
      />

      {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
    </div>
  );
}
