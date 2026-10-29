import { useEffect, useState, type FormEvent } from "react";
import { CABINS, missingFor, placeLabel, type TripPlace, type VoiceRequest, type VoiceTrip } from "../../shared/voice";
import { api } from "../lib/api";
import { AIRPORTS } from "../lib/airports";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-15" → "Sun 15 Nov 2026" (calendar date, no time-zone shift). */
const longDay = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MON[m - 1]} ${y}`;
};

/** "Kochi (COK)" → { city: "Kochi", airport: "COK" }; "Kochi" → { city: "Kochi", airport: "" }. */
function parsePlace(text: string): TripPlace | null {
  const t = text.trim();
  if (!t) return null;
  const m = /^(.*?)\s*\(([A-Za-z]{3})\)\s*$/.exec(t);
  return m ? { city: m[1].trim() || m[2].toUpperCase(), airport: m[2].toUpperCase() } : { city: t, airport: "" };
}

const EMPTY: VoiceTrip = { from: null, to: null, depart: "", return: "", oneWay: false, adults: 0, children: 0, infants: 0, cabin: "", airline: "", budget: "", notes: "", missing: [] };

interface Props {
  v: VoiceRequest;
  onChange: (r: VoiceRequest) => void;
  onOpenPlanner: (trip: VoiceTrip) => void;
}

/**
 * Trip details read from the voice message (phase B): shown under the text, editable by Sunny.
 * The flight search (phase C) will use these details.
 */
export function VoiceTripBox({ v, onChange, onOpenPlanner }: Props) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"read" | "save">();
  const [error, setError] = useState<string>();
  const t = v.trip;
  // Once flight results are shown, the trip is no longer edited here: Sunny changes the search in the Flights box.
  const hasResults = Boolean(v.flights?.search);
  // Flights arrived (searched by itself or by Sunny) while the edit form was open: close it.
  useEffect(() => { if (hasResults) setEditing(false); }, [hasResults]);

  async function readAgain() {
    setBusy("read");
    setError(undefined);
    try { onChange((await api.voice.readTrip(v.id)).request); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(undefined); }
  }

  if (editing) {
    return <TripForm v={v} initial={t ?? EMPTY} busy={busy === "save"} error={error}
      onCancel={() => { setEditing(false); setError(undefined); }}
      onSave={async (trip) => {
        setBusy("save");
        setError(undefined);
        try { onChange((await api.voice.saveTrip(v.id, trip)).request); setEditing(false); }
        catch (e) { setError((e as Error).message); }
        finally { setBusy(undefined); }
      }} />;
  }

  return (
    <section className="vt-box" aria-label={`Trip details from ${v.name}'s message`}>
      <div className="vt-head">
        <h3>✈ Trip details{t?.edited && <span className="vt-tag">Edited</span>}</h3>
        <div className="vt-head-actions">
          {v.english && <button className="btn small-btn" onClick={() => void readAgain()} disabled={!!busy}>{busy === "read" ? "Reading…" : t ? "Read again" : "Read trip details"}</button>}
          {!hasResults && <button className="btn small-btn" onClick={() => setEditing(true)} disabled={!!busy}>✏ Edit</button>}
        </div>
      </div>

      {!v.tripSaved && <p className="note small">Trip details can't be saved yet: run <code>supabase/voice_requests.sql</code> in the Supabase SQL Editor.</p>}

      {t ? (
        <>
          <div className="vt-route">
            <span className="vt-place">{t.from ? placeLabel(t.from) : <em className="vt-ask">From?</em>}</span>
            <span className="vt-arrow" aria-hidden="true">→</span>
            <span className="vt-place">{t.to ? placeLabel(t.to) : <em className="vt-ask">To?</em>}</span>
          </div>
          <dl className="vt-grid">
            <div><dt>Depart</dt><dd>{t.depart ? longDay(t.depart) : <em className="vt-ask">not said</em>}</dd></div>
            <div><dt>Return</dt><dd>{t.return ? longDay(t.return) : t.oneWay ? "One way" : <em className="vt-ask">not said</em>}</dd></div>
            <div><dt>Travellers</dt><dd>{t.adults + t.children + t.infants === 0 ? <em className="vt-ask">not said</em>
              : [t.adults && `${t.adults} adult${t.adults > 1 ? "s" : ""}`, t.children && `${t.children} child${t.children > 1 ? "ren" : ""}`, t.infants && `${t.infants} infant${t.infants > 1 ? "s" : ""}`].filter(Boolean).join(", ")}</dd></div>
            <div><dt>Class</dt><dd>{t.cabin || "Any"}</dd></div>
            <div><dt>Airline</dt><dd>{t.airline || "Any"}</dd></div>
            <div><dt>Budget</dt><dd>{t.budget || "—"}</dd></div>
          </dl>
          {t.notes && <p className="vt-notes"><b>Notes:</b> {t.notes}</p>}
          <div className="vt-foot">
            {t.missing.length > 0
              ? <p className="vt-missing" role="note">⚠ Still to ask: {t.missing.join(", ")}</p>
              : <p className="vt-complete">✓ Everything needed for a flight search</p>}
            <button className="btn solid small-btn" onClick={() => onOpenPlanner(t)} disabled={!t.to}>✈ Open in AI Trip Planner</button>
          </div>
        </>
      ) : (
        <p className="hint small">{v.english ? (hasResults ? "No trip details were found in this message. Change the search in Flights below." : "No trip details were found in this message. Press Edit to add them after talking to the customer.") : "Trip details appear once the message has text."}</p>
      )}
      {error && <p className="err-text" role="alert">{error}</p>}
    </section>
  );
}

function TripForm({ v, initial, busy, error, onCancel, onSave }: {
  v: VoiceRequest; initial: VoiceTrip; busy: boolean; error?: string; onCancel: () => void; onSave: (t: VoiceTrip) => void;
}) {
  const [from, setFrom] = useState(placeLabel(initial.from));
  const [to, setTo] = useState(placeLabel(initial.to));
  const [depart, setDepart] = useState(initial.depart);
  const [ret, setRet] = useState(initial.return);
  const [oneWay, setOneWay] = useState(initial.oneWay);
  const [adults, setAdults] = useState(initial.adults);
  const [children, setChildren] = useState(initial.children);
  const [infants, setInfants] = useState(initial.infants);
  const [cabin, setCabin] = useState(initial.cabin);
  const [airline, setAirline] = useState(initial.airline);
  const [budget, setBudget] = useState(initial.budget);
  const [notes, setNotes] = useState(initial.notes);
  const [formError, setFormError] = useState<string>();
  const id = (k: string) => `vt-${v.id}-${k}`;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (ret && depart && ret < depart) return setFormError("The return date is before the departure date.");
    setFormError(undefined);
    const fields = { from: parsePlace(from), to: parsePlace(to), depart, return: oneWay ? "" : ret, oneWay, adults, children, infants };
    onSave({ ...fields, cabin, airline: airline.trim(), budget: budget.trim(), notes: notes.trim(), missing: missingFor(fields) });
  }

  const num = (k: string, label: string, value: number, set: (n: number) => void) => (
    <div className="field"><label className="lbl" htmlFor={id(k)}>{label}</label>
      <select id={id(k)} value={value} onChange={(e) => set(+e.target.value)}>{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
  );

  return (
    <form className="vt-box vt-form" onSubmit={submit} noValidate aria-label={`Edit trip details for ${v.name}`}>
      <h3>✏ Edit trip details</h3>
      <datalist id={id("airports")}>{AIRPORTS.map((a) => <option key={a} value={a} />)}</datalist>
      <div className="vt-fields">
        <div className="field"><label className="lbl" htmlFor={id("from")}>From</label>
          <input id={id("from")} list={id("airports")} value={from} maxLength={70} placeholder="e.g. Kochi (COK)" onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label className="lbl" htmlFor={id("to")}>To</label>
          <input id={id("to")} list={id("airports")} value={to} maxLength={70} placeholder="e.g. Dubai (DXB)" onChange={(e) => setTo(e.target.value)} /></div>
        <div className="field"><label className="lbl" htmlFor={id("depart")}>Depart</label>
          <input id={id("depart")} type="date" value={depart} onChange={(e) => setDepart(e.target.value)} /></div>
        <div className="field"><label className="lbl" htmlFor={id("return")}>Return</label>
          <input id={id("return")} type="date" value={oneWay ? "" : ret} min={depart || undefined} disabled={oneWay} onChange={(e) => setRet(e.target.value)} /></div>
        <label className="vt-check"><input type="checkbox" checked={oneWay} onChange={(e) => setOneWay(e.target.checked)} /> One way</label>
        {num("adults", "Adults", adults, setAdults)}
        {num("children", "Children", children, setChildren)}
        {num("infants", "Infants", infants, setInfants)}
        <div className="field"><label className="lbl" htmlFor={id("cabin")}>Class</label>
          <select id={id("cabin")} value={cabin} onChange={(e) => setCabin(e.target.value)}>
            <option value="">Any</option>{CABINS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select></div>
        <div className="field"><label className="lbl" htmlFor={id("airline")}>Airline</label>
          <input id={id("airline")} value={airline} maxLength={40} placeholder="Any" onChange={(e) => setAirline(e.target.value)} /></div>
        <div className="field"><label className="lbl" htmlFor={id("budget")}>Budget</label>
          <input id={id("budget")} value={budget} maxLength={80} placeholder="e.g. under ₹50,000 per person" onChange={(e) => setBudget(e.target.value)} /></div>
        <div className="field vt-wide"><label className="lbl" htmlFor={id("notes")}>Notes</label>
          <input id={id("notes")} value={notes} maxLength={400} placeholder="Hotel, flexible dates, visa…" onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      {(formError || error) && <p className="err-text" role="alert">{formError || error}</p>}
      <div className="vt-head-actions">
        <button type="submit" className="btn solid" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}
