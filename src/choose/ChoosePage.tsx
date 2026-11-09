import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ageOn, monthsBetween, paxTypes, TITLE_LABEL, TITLES, isInternational, type ChooseView, type PaxType } from "../../shared/choose";
import { currencyOf, dayShift, hm, travellers, type FlightOption, type ShortlistItem } from "../../shared/flights";
import { money } from "../../shared/currency";
import { api } from "../lib/api";
import { Brand } from "../components/Brand";
import { ContactFooter } from "../components/ContactFooter";

/**
 * The customer's page from the "Choose this option" buttons in the flight-options email: choose one of
 * Sunny's options and enter each traveller's details as in the passport. Public (the link is the key).
 */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayOf = (iso: string) => { const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const clock = (s: string) => (/\s(\d{1,2}:\d{2})/.exec(s)?.[1] ?? "").padStart(5, "0");
const today = () => new Date().toISOString().slice(0, 10);
const COUNTRIES = ["India", "United States", "United Kingdom", "Canada", "Australia", "United Arab Emirates", "Qatar", "Saudi Arabia", "Oman", "Kuwait", "Bahrain", "Singapore", "Malaysia", "Germany", "Ireland", "New Zealand", "Sri Lanka", "Nepal", "Bangladesh", "Philippines"];
const PAX_LABEL: Record<PaxType, string> = { adult: "Adult", child: "Child (2–11)", infant: "Infant (under 2)" };

function Leg({ o, label }: { o: FlightOption; label: string }) {
  const a = o.legs[0], z = o.legs[o.legs.length - 1], plus = dayShift(a.dep, z.arr);
  const stops = o.layovers.length ? `${o.layovers.length} stop · ${o.layovers.map((l) => l.airport).join(", ")}` : "Nonstop";
  return (
    <div className="ch-leg">
      <span className="ch-leg-l">{label} · {dayOf(a.dep.slice(0, 10))}</span>
      <span className="ch-leg-t mono">{clock(a.dep)} {a.from} → {clock(z.arr)}{plus > 0 && <sup>+{plus}</sup>} {z.to}</span>
      <span className="ch-leg-s">{o.legs.map((l) => l.flightNo).join(" / ")} · {stops} · {hm(o.minutes)}</span>
    </div>
  );
}

interface Pax { type: PaxType; title: string; given: string; surname: string; dob: string; gender: string; nationality: string; passportNo: string; passportExpiry: string; passportCountry: string; ffn: string; meal: string; assistance: string; more: boolean }
const blank = (type: PaxType): Pax => ({ type, title: type === "adult" ? "" : "", given: "", surname: "", dob: "", gender: "", nationality: "India", passportNo: "", passportExpiry: "", passportCountry: "India", ffn: "", meal: "", assistance: "", more: false });
const titlesFor = (t: PaxType) => (t === "adult" ? TITLES.filter((x) => x !== "MSTR") : (["MSTR", "MISS"] as const));

export function ChoosePage({ token }: { token: string }) {
  const [view, setView] = useState<ChooseView | null>(null);
  const [error, setError] = useState<string>();
  const [option, setOption] = useState(0);
  const [pax, setPax] = useState<Pax[]>([]);
  const [email, setEmail] = useState(""), [phone, setPhone] = useState(""), [notes, setNotes] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [done, setDone] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const v = await api.choose.view(token);
        setView(v);
        const o = Number(new URLSearchParams(window.location.search).get("o"));
        setOption(o >= 1 && o <= v.options.length ? o : v.chosen?.option ?? (v.options.length === 1 ? 1 : 0));
        setPax(paxTypes(v.pax).map(blank));
        setEmail(v.contact.email); setPhone(v.contact.phone);
      } catch (e) { setError((e as Error).message); }
    })();
  }, [token]);

  const item: ShortlistItem | null = view && option ? view.options[option - 1] : null;
  const intl = item ? isInternational(item) : Boolean(view?.international);
  const last = item ? item.query.return || item.query.depart : "";
  const set = (i: number, patch: Partial<Pax>) => { setPax((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p))); setFormError(undefined); };
  const warnings = useMemo(() => pax.map((p) => {
    if (!item) return "";
    if (p.dob) {
      const age = ageOn(p.dob, item.query.depart);
      if (p.type === "adult" && age < 12) return "Under 12 on the travel date: travels as a child. Ask Sunny to change the travellers.";
      if (p.type === "child" && (age < 2 || age > 11)) return "A child is 2 to 11 years old on the travel date.";
      if (p.type === "infant" && age >= 2) return "An infant is under 2 on the travel date.";
    }
    if (intl && p.passportExpiry && p.passportExpiry <= last) return "This passport expires before the trip ends.";
    if (intl && p.passportExpiry && monthsBetween(last, p.passportExpiry) < 6) return "This passport has less than 6 months left after the trip. Many countries refuse entry; check before booking.";
    return "";
  }), [pax, item, intl, last]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!view || !item) return setFormError("Choose one of the flight options first.");
    setBusy(true); setFormError(undefined);
    try {
      const r = await api.choose.submit(token, {
        option, agree: agree as true, notes,
        contact: { email, phone },
        passengers: pax.map((p) => ({
          type: p.type, title: p.title as (typeof TITLES)[number], given: p.given, surname: p.surname, dob: p.dob, gender: p.gender as "M" | "F",
          nationality: p.nationality, passportNo: intl ? p.passportNo : "", passportExpiry: intl ? p.passportExpiry : "", passportCountry: intl ? p.passportCountry : "",
          ffn: p.ffn, meal: p.meal, assistance: p.assistance,
        })),
      });
      setDone(r.confirmedAt);
      window.scrollTo(0, 0);
    } catch (err) { setFormError((err as Error).message); }
    finally { setBusy(false); }
  }

  const showForm = view && !view.locked && !done && (!view.chosen || editing);

  return (
    <div className="pay-wrap ch-wrap">
      <header className="pay-top"><Brand /><span className="secure">🔒 Secure page</span></header>

      {error && <section className="pay-card"><h1>Link not available</h1><p className="err-text" role="alert">{error}</p><p className="hint">Call Sunny on 214 221 3300.</p></section>}
      {!error && !view && <section className="pay-card"><p className="hint" role="status">Loading your flight options…</p></section>}

      {view && done && item && (
        <section className="pay-card paid" aria-labelledby="ch-ok">
          <div className="tick" aria-hidden="true">✓</div>
          <h1 id="ch-ok">Thank you, {view.firstName}</h1>
          <p className="hint">We've got your choice: <b>option {option}, {item.out.airline}</b>. Sunny will book it and email you a secure payment link. A copy of your choice is on its way to {email}.</p>
          <p className="fine">The final fare can change slightly until the tickets are issued. Sunny will confirm it.</p>
        </section>
      )}

      {view && !done && view.chosen && !editing && (
        <section className="pay-card" aria-labelledby="ch-had">
          <p className="lbl">Already confirmed</p>
          <h1 id="ch-had">You chose option {view.chosen.option}</h1>
          <p className="hint">Confirmed {new Date(view.chosen.confirmedAt).toLocaleString()} for {view.chosen.names.join(", ")}.</p>
          {view.locked
            ? <p className="note">Sunny is ticketing this booking, so it can't be changed here. Call 214 221 3300 for any change.</p>
            : <div><button className="btn" onClick={() => setEditing(true)}>Change my choice or details</button></div>}
        </section>
      )}

      {showForm && (
        <form className="ch-form" onSubmit={submit} noValidate>
          <section className="pay-card" aria-labelledby="ch-h">
            <p className="lbl">Hi {view.firstName} · {view.route} · {travellers(view.pax)}</p>
            <h1 id="ch-h">Choose your flight</h1>
            <div className="ch-options" role="radiogroup" aria-label="Flight options">
              {view.options.map((o, i) => (
                <label key={o.id} className={`ch-opt${option === i + 1 ? " on" : ""}`}>
                  <input type="radio" name="opt" checked={option === i + 1} onChange={() => { setOption(i + 1); setFormError(undefined); }} />
                  <span className="ch-opt-head"><span className="ch-opt-n">Option {i + 1}</span><b>{o.out.airline}</b><span className="ch-price mono">{money(o.price, currencyOf(o))}</span></span>
                  <Leg o={o.out} label="Out" />
                  {o.back ? <Leg o={o.back} label="Return" /> : o.query.return ? <span className="ch-leg-s">Return {dayOf(o.query.return)} · flight chosen when booking</span> : null}
                </label>
              ))}
            </div>
            <p className="fine">Prices are the total for all travellers, from Google Flights when Sunny sent them, and can change until the tickets are issued.</p>
          </section>

          <section className="pay-card" aria-labelledby="ch-t">
            <h2 id="ch-t">Travellers</h2>
            <p className="note">Write each name <b>exactly as in the passport</b>. A wrong letter can stop boarding, and airlines charge to change names.</p>
            {pax.map((p, i) => (
              <fieldset key={i} className="ch-pax">
                <legend>Traveller {i + 1} · {PAX_LABEL[p.type]}</legend>
                <div className="ch-grid">
                  <div className="field"><label className="lbl" htmlFor={`t-${i}`}>Title</label>
                    <select id={`t-${i}`} value={p.title} onChange={(e) => set(i, { title: e.target.value })} required><option value="">Choose</option>{titlesFor(p.type).map((t) => <option key={t} value={t}>{TITLE_LABEL[t]}</option>)}</select></div>
                  <div className="field"><label className="lbl" htmlFor={`g-${i}`}>Given name(s)</label><input id={`g-${i}`} className="caps" autoComplete="off" value={p.given} onChange={(e) => set(i, { given: e.target.value })} placeholder="As in passport" maxLength={40} /></div>
                  <div className="field"><label className="lbl" htmlFor={`s-${i}`}>Surname</label><input id={`s-${i}`} className="caps" autoComplete="off" value={p.surname} onChange={(e) => set(i, { surname: e.target.value })} placeholder="As in passport" maxLength={40} /></div>
                  <div className="field"><label className="lbl" htmlFor={`d-${i}`}>Date of birth</label><input id={`d-${i}`} type="date" max={today()} value={p.dob} onChange={(e) => set(i, { dob: e.target.value })} /></div>
                  <div className="field"><label className="lbl" htmlFor={`x-${i}`}>Gender</label>
                    <select id={`x-${i}`} value={p.gender} onChange={(e) => set(i, { gender: e.target.value })}><option value="">Choose</option><option value="M">Male</option><option value="F">Female</option></select></div>
                  <div className="field"><label className="lbl" htmlFor={`n-${i}`}>Nationality</label><input id={`n-${i}`} list="ch-countries" value={p.nationality} onChange={(e) => set(i, { nationality: e.target.value })} maxLength={40} /></div>
                  {intl && <>
                    <div className="field"><label className="lbl" htmlFor={`p-${i}`}>Passport number</label><input id={`p-${i}`} className="caps mono" autoComplete="off" value={p.passportNo} onChange={(e) => set(i, { passportNo: e.target.value })} maxLength={20} /></div>
                    <div className="field"><label className="lbl" htmlFor={`e-${i}`}>Passport expiry</label><input id={`e-${i}`} type="date" min={today()} value={p.passportExpiry} onChange={(e) => set(i, { passportExpiry: e.target.value })} /></div>
                    <div className="field"><label className="lbl" htmlFor={`c-${i}`}>Issued by (country)</label><input id={`c-${i}`} list="ch-countries" value={p.passportCountry} onChange={(e) => set(i, { passportCountry: e.target.value })} maxLength={40} /></div>
                  </>}
                </div>
                {warnings[i] && <p className="ch-warn" role="status">⚠ {warnings[i]}</p>}
                <button type="button" className="ch-more" onClick={() => set(i, { more: !p.more })} aria-expanded={p.more}>{p.more ? "−" : "+"} Frequent flyer, meal, assistance (optional)</button>
                {p.more && <div className="ch-grid">
                  <div className="field"><label className="lbl" htmlFor={`f-${i}`}>Frequent flyer number</label><input id={`f-${i}`} value={p.ffn} onChange={(e) => set(i, { ffn: e.target.value })} maxLength={30} /></div>
                  <div className="field"><label className="lbl" htmlFor={`m-${i}`}>Meal</label><select id={`m-${i}`} value={p.meal} onChange={(e) => set(i, { meal: e.target.value })}><option value="">No preference</option><option>Vegetarian (Hindu)</option><option>Vegetarian (Jain)</option><option>Halal</option><option>Child meal</option><option>Diabetic</option></select></div>
                  <div className="field"><label className="lbl" htmlFor={`a-${i}`}>Special assistance</label><input id={`a-${i}`} value={p.assistance} onChange={(e) => set(i, { assistance: e.target.value })} placeholder="e.g. wheelchair to the gate" maxLength={120} /></div>
                </div>}
              </fieldset>
            ))}
            <datalist id="ch-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
          </section>

          <section className="pay-card" aria-labelledby="ch-c">
            <h2 id="ch-c">Contact</h2>
            <div className="ch-grid">
              <div className="field"><label className="lbl" htmlFor="ch-email">Email</label><input id="ch-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} /></div>
              <div className="field"><label className="lbl" htmlFor="ch-phone">Phone</label><input id="ch-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} /></div>
            </div>
            <div className="field"><label className="lbl" htmlFor="ch-notes">Anything else for Sunny? (optional)</label><textarea id="ch-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></div>
            <label className="agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> The names and passport details are exactly as in the passports, and I want Sunny to book this option.</label>
            {formError && <p className="err-text" role="alert">{formError}</p>}
            <button className="btn solid ch-submit" type="submit" disabled={busy || !option || !agree}>{busy ? "Sending…" : option ? `Confirm option ${option}` : "Choose an option above"}</button>
            <p className="fine">Your details go only to Sigma Travels to book this trip. Nothing is charged now: Sunny will send a secure payment link.</p>
          </section>
        </form>
      )}
      <ContactFooter />
    </div>
  );
}
