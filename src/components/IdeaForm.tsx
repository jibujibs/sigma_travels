import { needsOf, type Budget, type Needs, type TripBrief } from "../../shared/types";
import { addDays, fmtDate, iso, parseISO, todayUTC } from "../lib/format";
import { AIRPORTS } from "../lib/airports";
import { NEED_LABEL } from "../lib/trip";

const SPOTS = ["Eiffel Tower, Paris", "Taj Mahal, Agra", "Machu Picchu, Peru", "Santorini, Greece", "Kyoto temples", "Bali beaches", "Swiss Alps", "Dubai", "Maldives", "New York City", "Petra, Jordan", "Northern Lights, Norway"];
const INTERESTS = ["Beaches", "History", "Food", "Nature", "Mountains", "Nightlife", "Shopping", "Adventure", "Family", "Romance", "Culture"];
const BUDGETS: Budget[] = ["Budget", "Mid-range", "Luxury"];
const NEEDS = Object.keys(NEED_LABEL) as (keyof Needs)[];
const NEED_ICON: Record<keyof Needs, string> = { flights: "✈", hotel: "🏨", car: "🚗", itinerary: "🗓" };
const NEED_HINT: Record<keyof Needs, string> = { flights: "from your city", hotel: "for every night", car: "pick-up at airport", itinerary: "what to see each day" };

interface Props {
  brief: TripBrief;
  onChange: (b: TripBrief) => void;
  onSubmit: () => void;
  busy: boolean;
  error?: string;
  /** Shown under "From · your city" when it is empty. */
  originError?: string;
  /** Shown when a plan is on screen and the ticked parts differ from it: rebuild for the same place. */
  onApplyNeeds?: () => void;
  /** One line explaining what was understood from the request, e.g. "Showing flights only, as you asked." */
  understood?: string;
}

export function IdeaForm({ brief, onChange, onSubmit, busy, error, originError, onApplyNeeds, understood }: Props) {
  const set = <K extends keyof TripBrief>(k: K, v: TripBrief[K]) => onChange({ ...brief, [k]: v });
  const toggle = (i: string) => set("interests", brief.interests.includes(i) ? brief.interests.filter((x) => x !== i) : [...brief.interests, i]);
  const needs = needsOf(brief);
  const toggleNeed = (k: keyof Needs) => {
    const next = { ...needs, [k]: !needs[k] };
    if (next.flights || next.hotel || next.car || next.itinerary) set("needs", next);
  };

  const steps = (k: "days" | "pax", min: number, max: number, label: string) => (
    <div className="qty">
      <button type="button" aria-label={`Fewer ${label}`} disabled={brief[k] <= min} onClick={() => set(k, Math.max(min, brief[k] - 1))}>−</button>
      <input id={k} type="number" inputMode="numeric" min={min} max={max} value={brief[k]}
        onChange={(e) => { const n = Math.round(+e.target.value); if (n >= min && n <= max) set(k, n); }} />
      <button type="button" aria-label={`More ${label}`} disabled={brief[k] >= max} onClick={() => set(k, Math.min(max, brief[k] + 1))}>+</button>
    </div>
  );
  const start = brief.start ? parseISO(brief.start) : undefined;
  const end = start ? addDays(start, Math.max(1, brief.days) - 1) : undefined;
  const place = brief.idea.trim();
  const picked = (Object.keys(NEED_LABEL) as (keyof Needs)[]).filter((k) => needs[k]).map((k) => NEED_LABEL[k]);
  const summary = [place.length > 40 ? place.slice(0, 40) + "…" : place || "Anywhere",
    start && end ? `${fmtDate(start)} – ${fmtDate(end)}` : "", `${brief.days} day${brief.days > 1 ? "s" : ""}`,
    `${brief.pax} adult${brief.pax > 1 ? "s" : ""}`, brief.budget].filter(Boolean).join(" · ");
  const detail = [picked.join(", ").replace(/, ([^,]*)$/, " and $1"), brief.interests.join(", ")].filter(Boolean).join(" · ");

  return (
    <form className="idea" autoComplete="off" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="idea-head">
        <h1>Where do you want to go?</h1>
        <p>Tell us a place or an idea. Gemini plans only what you ask for.</p>
      </div>

      <section className="istep" aria-labelledby="st1">
        <span className="inum" aria-hidden="true">1</span>
        <div className="ibody">
          <h3 id="st1"><label htmlFor="idea">Where to</label> <span>a place, or an idea like “quiet beach with good food”</span></h3>
          <div className={`where${error ? " invalid" : ""}`}>
            <span aria-hidden="true">📍</span>
            <textarea id="idea" rows={1} value={brief.idea} maxLength={500}
              placeholder="e.g. Flights to Dubai · Hotels in London · 5 days in Paris"
              onChange={(e) => set("idea", e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(); } }} />
            {brief.idea && <button type="button" className="clear" onClick={() => set("idea", "")}>✕ Clear</button>}
          </div>
          {error && <p className="err-text">{error}</p>}
          <span className="lbl sp">Or pick a famous spot</span>
          <div className="chips">
            {SPOTS.map((s) => <button type="button" key={s} className="chip spot" aria-pressed={brief.idea === s} onClick={() => set("idea", s)}>{s}</button>)}
          </div>
        </div>
      </section>

      <section className="istep" aria-labelledby="st2">
        <span className="inum" aria-hidden="true">2</span>
        <div className="ibody">
          <h3 id="st2">What you enjoy <span>optional · pick any</span></h3>
          <div className="chips">
            {INTERESTS.map((i) => <button type="button" key={i} className="chip pick" aria-pressed={brief.interests.includes(i)} onClick={() => toggle(i)}>{i}</button>)}
          </div>
        </div>
      </section>

      <section className="istep" aria-labelledby="st3">
        <span className="inum" aria-hidden="true">3</span>
        <div className="ibody">
          <h3 id="st3">What you need <span>picked from your request · tap to change</span></h3>
          <div className="needs" role="group" aria-labelledby="st3">
            {NEEDS.map((k) => (
              <button type="button" key={k} className="need-card" aria-pressed={needs[k]} onClick={() => toggleNeed(k)}>
                <b>{NEED_ICON[k]} {NEED_LABEL[k]}</b><small>{NEED_HINT[k]}</small>
              </button>
            ))}
          </div>
          {onApplyNeeds && <button type="button" className="btn solid apply" disabled={busy} onClick={onApplyNeeds}>Update results</button>}
          {understood && <p className="hint" role="status">{understood}</p>}
        </div>
      </section>

      <section className="istep" aria-labelledby="st4">
        <span className="inum" aria-hidden="true">4</span>
        <div className="ibody">
          <h3 id="st4">When &amp; who</h3>
          <div className="when-row">
            <div className="field"><label className="lbl" htmlFor="origin">From · your city</label>
              <div className="ibox"><span aria-hidden="true">🛫</span>
                <input id="origin" type="text" list="origin-airports" className={originError ? "invalid" : ""} aria-invalid={!!originError} aria-describedby={originError ? "origin-err" : undefined}
                  placeholder="e.g. Kochi (COK)" value={brief.origin} maxLength={80} onChange={(e) => set("origin", e.target.value)} /></div>
              <datalist id="origin-airports">{AIRPORTS.map((a) => <option key={a} value={a} />)}</datalist>
              {originError && <p className="err-text" id="origin-err">{originError}</p>}</div>
            <div className="field"><label className="lbl" htmlFor="start">Start date</label>
              <input id="start" type="date" min={iso(todayUTC())} value={brief.start} onChange={(e) => e.target.value && set("start", e.target.value)} />
              {end && <span className="hint small">Ends {fmtDate(end)}</span>}</div>
            <div className="field"><label className="lbl" htmlFor="days">Days</label>{steps("days", 1, 10, "days")}</div>
            <div className="field"><label className="lbl" htmlFor="pax">Adults</label>{steps("pax", 1, 6, "adults")}</div>
            <div className="field"><span className="lbl" id="budget-lbl">Budget</span>
              <div className="seg budget" role="group" aria-labelledby="budget-lbl">
                {BUDGETS.map((b) => <button type="button" key={b} aria-pressed={brief.budget === b} onClick={() => set("budget", b)}>{b}</button>)}
              </div></div>
          </div>
        </div>
      </section>

      <div className="go plan-go">
        <button className="btn solid big" type="submit" disabled={busy}>✦ Plan my trip</button>
        <div className="go-sum">
          <b>{summary}</b>
          <span>{detail ? `${detail} · ` : ""}Powered by Google Gemini; prices are estimates, not live fares.</span>
        </div>
      </div>
    </form>
  );
}
