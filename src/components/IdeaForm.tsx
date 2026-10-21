import { needsOf, type Budget, type Needs, type TripBrief } from "../../shared/types";
import { iso, todayUTC } from "../lib/format";
import { AIRPORTS } from "../lib/airports";
import { NEED_LABEL } from "../lib/trip";

const SPOTS = ["Eiffel Tower, Paris", "Taj Mahal, Agra", "Machu Picchu, Peru", "Santorini, Greece", "Kyoto temples", "Bali beaches", "Swiss Alps", "Dubai", "Maldives", "New York City", "Petra, Jordan", "Northern Lights, Norway"];
const INTERESTS = ["Beaches", "History", "Food", "Nature", "Mountains", "Nightlife", "Shopping", "Adventure", "Family", "Romance", "Culture"];
const BUDGETS: Budget[] = ["Budget", "Mid-range", "Luxury"];
const NEEDS = Object.keys(NEED_LABEL) as (keyof Needs)[];

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

  return (
    <form className="idea" autoComplete="off" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="idea-head">
        <h1>Where do you want to go?</h1>
        <p>Ask for flights, a hotel, a rental car or a full trip plan. Gemini gives you only what you ask for. No place in mind? Describe an idea and it suggests three.</p>
      </div>
      <div>
        <label className="lbl" htmlFor="idea">Where to? · destination or travel idea</label>
        <textarea id="idea" className={error ? "invalid" : ""} value={brief.idea} maxLength={500}
          placeholder="e.g. Flights to Dubai · Hotels in London · 5 days in Paris · snowy mountains in Europe"
          onChange={(e) => set("idea", e.target.value)} />
        {error && <p className="err-text">{error}</p>}
      </div>
      <div>
        <span className="lbl">Or start from a famous spot</span>
        <div className="chips">
          {SPOTS.map((s) => <button type="button" key={s} className="chip spot" onClick={() => set("idea", s)}>{s}</button>)}
        </div>
      </div>
      <div>
        <span className="lbl">Interests</span>
        <div className="chips">
          {INTERESTS.map((i) => <button type="button" key={i} className="chip" aria-pressed={brief.interests.includes(i)} onClick={() => toggle(i)}>{i}</button>)}
        </div>
      </div>
      <div>
        <span className="lbl" id="needs-lbl">I need · picked from your request, change if needed</span>
        <div className="chips" role="group" aria-labelledby="needs-lbl">
          {NEEDS.map((k) => <button type="button" key={k} className="chip need" aria-pressed={needs[k]} onClick={() => toggleNeed(k)}>{NEED_LABEL[k]}</button>)}
          {onApplyNeeds && <button type="button" className="btn solid" disabled={busy} onClick={onApplyNeeds}>Update results</button>}
        </div>
        {understood && <p className="hint" role="status">{understood}</p>}
      </div>
      <div className="form-row">
        <div className="field"><label className="lbl" htmlFor="origin">From · your city</label>
          <input id="origin" type="text" list="origin-airports" className={originError ? "invalid" : ""} aria-invalid={!!originError} aria-describedby={originError ? "origin-err" : undefined}
            placeholder="e.g. Trivandrum (TRV), San Francisco (SFO), Dubai (DXB)" value={brief.origin} maxLength={80} onChange={(e) => set("origin", e.target.value)} />
          <datalist id="origin-airports">{AIRPORTS.map((a) => <option key={a} value={a} />)}</datalist>
          {originError && <p className="err-text" id="origin-err">{originError}</p>}</div>
        <div className="field"><label className="lbl" htmlFor="start">Start date</label>
          <input id="start" type="date" min={iso(todayUTC())} value={brief.start} onChange={(e) => e.target.value && set("start", e.target.value)} /></div>
        <div className="field"><label className="lbl" htmlFor="days">Days</label>
          <select id="days" value={brief.days} onChange={(e) => set("days", +e.target.value)}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select></div>
        <div className="field"><label className="lbl" htmlFor="pax">Adults</label>
          <select id="pax" value={brief.pax} onChange={(e) => set("pax", +e.target.value)}>
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select></div>
        <div className="field"><span className="lbl">Budget</span>
          <div className="seg">
            {BUDGETS.map((b) => <button type="button" key={b} aria-pressed={brief.budget === b} onClick={() => set("budget", b)}>{b}</button>)}
          </div></div>
      </div>
      <div className="go">
        <button className="btn solid big" type="submit" disabled={busy}>Search</button>
        <span className="hint">Powered by Google Gemini. Prices are estimates, not live fares.</span>
      </div>
    </form>
  );
}
