import type { Budget, TripBrief } from "../../shared/types";
import { iso, todayUTC } from "../lib/format";

const SPOTS = ["Eiffel Tower, Paris", "Taj Mahal, Agra", "Machu Picchu, Peru", "Santorini, Greece", "Kyoto temples", "Bali beaches", "Swiss Alps", "Dubai", "Maldives", "New York City", "Petra, Jordan", "Northern Lights, Norway"];
const INTERESTS = ["Beaches", "History", "Food", "Nature", "Mountains", "Nightlife", "Shopping", "Adventure", "Family", "Romance", "Culture"];
const BUDGETS: Budget[] = ["Budget", "Mid-range", "Luxury"];

interface Props {
  brief: TripBrief;
  onChange: (b: TripBrief) => void;
  onSubmit: () => void;
  busy: boolean;
  error?: string;
}

export function IdeaForm({ brief, onChange, onSubmit, busy, error }: Props) {
  const set = <K extends keyof TripBrief>(k: K, v: TripBrief[K]) => onChange({ ...brief, [k]: v });
  const toggle = (i: string) => set("interests", brief.interests.includes(i) ? brief.interests.filter((x) => x !== i) : [...brief.interests, i]);

  return (
    <form className="idea" autoComplete="off" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="idea-head">
        <h1>Where do you want to go?</h1>
        <p>Describe a trip idea or name a place. Gemini suggests three destinations, then builds the full plan with flights, a hotel and a rental car.</p>
      </div>
      <div>
        <label className="lbl" htmlFor="idea">Your travel idea</label>
        <textarea id="idea" className={error ? "invalid" : ""} value={brief.idea} maxLength={500}
          placeholder="e.g. Snowy mountains and cosy villages in Europe, or simply: Eiffel Tower"
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
      <div className="form-row">
        <div className="field"><label className="lbl" htmlFor="origin">Flying from</label>
          <input id="origin" type="text" value={brief.origin} onChange={(e) => set("origin", e.target.value)} /></div>
        <div className="field"><label className="lbl" htmlFor="start">Start date</label>
          <input id="start" type="date" min={iso(todayUTC())} value={brief.start} onChange={(e) => e.target.value && set("start", e.target.value)} /></div>
        <div className="field"><label className="lbl" htmlFor="days">Days</label>
          <select id="days" value={brief.days} onChange={(e) => set("days", +e.target.value)}>
            {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
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
        <button className="btn solid big" type="submit" disabled={busy}>Recommend destinations</button>
        <span className="hint">Powered by Google Gemini. Prices are estimates, not live fares.</span>
      </div>
    </form>
  );
}
