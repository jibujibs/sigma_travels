import { useState, type FormEvent } from "react";
import { AIRPORTS } from "../lib/airports";
import { Brand } from "./Brand";

interface Props {
  name: string;
  initial?: string;
  /** Saves the airport to the account. Throws with a readable message if it fails. */
  onSave: (airport: string) => Promise<void>;
  /** Shown when changing it later from the account menu; absent on the first sign-in. */
  onCancel?: () => void;
}

/** "Where do you usually fly from?" Asked once after the first sign-in, and from the account menu. */
export function HomeAirport({ name, initial = "", onSave, onCancel }: Props) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (v.length < 2) { setError("Choose or type the city you usually fly from."); return; }
    setBusy(true);
    setError(undefined);
    try {
      await onSave(v);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const first = !onCancel;
  return (
    <div className={first ? "gate" : "modal-back"} role={first ? undefined : "dialog"} aria-modal={first ? undefined : true} aria-labelledby="home-h">
      <form className="gate-card" onSubmit={submit}>
        {first && <Brand section="Trip Planner" />}
        <h1 id="home-h">{first ? `Welcome, ${name.split(" ")[0]}` : "Change home airport"}</h1>
        <p className="hint">
          {first ? "Where do you usually fly from? We'll fill it in for every search. You can still change it for a single trip." : "This becomes the starting point for your searches."}
        </p>
        <div className="field">
          <label className="lbl" htmlFor="home-airport">Home airport</label>
          <input id="home-airport" type="text" list="airport-list" autoFocus value={value} maxLength={80}
            className={error ? "invalid" : ""} aria-invalid={!!error} aria-describedby={error ? "home-err" : undefined}
            placeholder="Start typing, e.g. San Francisco or Kochi" onChange={(e) => setValue(e.target.value)} />
          <datalist id="airport-list">{AIRPORTS.map((a) => <option key={a} value={a} />)}</datalist>
          {error && <p className="err-text" id="home-err" role="alert">{error}</p>}
        </div>
        <div className="gate-actions">
          <button className="btn solid" type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
          {onCancel && <button className="btn" type="button" onClick={onCancel} disabled={busy}>Cancel</button>}
        </div>
      </form>
    </div>
  );
}
