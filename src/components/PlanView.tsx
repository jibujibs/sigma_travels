import { useState } from "react";
import type { Flight } from "../../shared/types";
import { addDays, DOW, fmtDate, inr, iso, originCity, parseISO, todayUTC } from "../lib/format";
import { buildDays, homeCode, needsList, picks, planNeeds, price, tripLength, type FoodStyle, type PlanState, type Selection } from "../lib/trip";
import { buildTripPdf } from "../lib/pdf";
import { api } from "../lib/api";

interface Props {
  state: PlanState;
  example: boolean;
  model?: string;
  onChange: (s: PlanState) => void;
  onPdf: () => Promise<void>;
  onNewTrip: () => void;
  toast: (m: string) => void;
  /** Present when saving is available (Supabase configured). */
  onSave?: () => Promise<void>;
  saved?: boolean;
}

function FlightCard({ f }: { f: Flight }) {
  return (
    <>
      <span className="name">{f.airline}</span>
      <span className="times">{f.depart} → {f.arrive}{f.arrive_next_day ? " +1" : ""}</span>
      <span className="meta">{f.stops}{f.duration ? ` · ${f.duration}` : ""}</span>
      <span className="price">{inr(f.fare_inr)}</span>
    </>
  );
}

export function PlanView({ state, example, model, onChange, onPdf, onNewTrip, toast, onSave, saved }: Props) {
  const [day, setDay] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [mailExtra, setMailExtra] = useState("");
  const [mailNote, setMailNote] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const [mailError, setMailError] = useState<string>();
  const [mailSent, setMailSent] = useState<{ to: string[]; at: string } | null>(null);
  async function sendMail() {
    const extra = mailExtra.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    const bad = extra.find((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
    if (bad) return setMailError(`Check the email address: ${bad}`);
    if (extra.length > 5) return setMailError("Up to 5 extra addresses.");
    setMailBusy(true);
    setMailError(undefined);
    try {
      const { bytes, filename } = await buildTripPdf(state);
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      const dest = state.plan.destination.city;
      const r = await api.trips.email({
        subject: `Trip itinerary: ${originCity(state.brief.origin)} → ${dest} · ${fmtDate(start)} – ${fmtDate(end)} · Sigma Travels`,
        text: tripText(), filename, pdf: btoa(bin), extra, note: mailNote.trim(),
      });
      setMailSent({ to: r.sentTo, at: r.at });
      setMailOpen(false);
      setMailNote("");
      toast("Itinerary emailed");
    } catch (e) {
      setMailError((e as Error).message);
    } finally {
      setMailBusy(false);
    }
  }
  const [saving, setSaving] = useState(false);
  async function save() {
    if (!onSave) return;
    setSaving(true);
    try { await onSave(); } finally { setSaving(false); }
  }
  const { plan, brief, sel } = state;
  const n = planNeeds(state);
  const len = tripLength(state);
  const days = buildDays(state);
  const q = price(state);
  const d = days.length ? days[Math.min(day, days.length - 1)] : undefined;
  const start = parseISO(brief.start);
  const end = addDays(start, len - 1);
  const closures = days.flatMap((x, i) => x.stops.filter((s) => s.isClosed).map((s) => `${s.name} (Day ${i + 1}, ${DOW[x.date.getUTCDay()]})`));
  const pick = (k: keyof Selection, i: number) => onChange({ ...state, sel: { ...sel, [k]: i } });

  function fixDates() {
    for (let i = 1; i <= 14; i++) {
      for (const sg of [1, -1]) {
        const cand = addDays(start, i * sg);
        if (cand < todayUTC()) continue;
        const next = { ...state, brief: { ...brief, start: iso(cand) } };
        if (buildDays(next).every((x) => !x.warn)) { onChange(next); toast(`Start moved to ${fmtDate(cand)}. No closures now`); return; }
      }
    }
    toast("No closure-free start date within two weeks");
  }

  function tripText(): string {
    let s = `Sigma Travels · ${originCity(brief.origin)} → ${plan.destination.city}\n${fmtDate(start)} – ${fmtDate(end)} · ${brief.pax} adult(s)\n`;
    if (n.itinerary) {
      days.forEach((x, i) => { s += `\nDay ${i + 1} · ${fmtDate(x.date)} · ${x.title}\n`; x.stops.forEach((st) => { s += `  ${st.time}  ${st.name}${st.isClosed ? " (closed this day)" : ""}\n`; }); });
    } else {
      const { out, ret, hotel, car } = picks(state);
      if (n.flights && out && ret) {
        s += `\nOutbound · ${fmtDate(start)}: ${out.airline} ${out.route} ${out.depart} → ${out.arrive}${out.arrive_next_day ? " +1" : ""} · ${out.stops}`;
        s += `\nReturn · ${fmtDate(end)}: ${ret.airline} ${ret.route} ${ret.depart} → ${ret.arrive}${ret.arrive_next_day ? " +1" : ""} · ${ret.stops}\n`;
      }
      if (n.hotel && hotel) s += `\nHotel: ${hotel.name}${hotel.area ? ", " + hotel.area : ""} · ${inr(hotel.rate_inr)} / room / night\n`;
      if (n.car && state.carOn && car) s += `\nRental car: ${car.name}${car.company ? " · " + car.company : ""} · ${inr(car.daily_inr)} / day\n`;
    }
    s += "\nEstimate\n"; q.lines.forEach((l) => { s += `  ${l.label}: ${inr(l.value)}\n`; });
    s += `  Total: ${inr(q.total)} (${inr(q.perPerson)} per person)\nEstimates only, subject to availability.`;
    return s;
  }
  async function copyText() {
    const s = tripText();
    try { await navigator.clipboard.writeText(s); toast("Copied. Paste it into WhatsApp or email"); }
    catch { toast("Copy was blocked by the browser"); }
  }

  async function pdf() {
    setPdfBusy(true);
    try { await onPdf(); toast("PDF downloaded"); }
    catch (e) { console.error(e); toast("Couldn't create the PDF. Try again."); }
    finally { setPdfBusy(false); }
  }

  const pp = `${inr(q.perPerson)} per person · ${brief.pax} adult${brief.pax > 1 ? "s" : ""}`;

  return (
    <section id="plan" aria-label="Trip plan" style={{ display: "grid", gap: 24 }}>
      <div className="pass">
        <div className="pass-main">
          <div><span className="badge">{example ? "Example plan" : "Planned by Gemini · estimates"}</span>{model && !example && <span className="model"> &nbsp;{model}</span>}</div>
          <div className="route">
            <div><div className="iata">{homeCode(plan, brief.origin)}</div><div className="city">{originCity(brief.origin)}</div></div>
            <div className="plane" aria-hidden="true" />
            <div><div className="iata">{plan.destination.airport}</div><div className="city">{plan.destination.city}{plan.destination.country ? `, ${plan.destination.country}` : ""}</div></div>
          </div>
          {plan.destination.summary && <p className="summary">{plan.destination.summary}</p>}
          <div className="passmeta">
            <div><b>Depart</b>{fmtDate(start)}</div><div><b>Return</b>{fmtDate(end)}</div>
            <div><b>Travellers</b>{brief.pax} adult{brief.pax > 1 ? "s" : ""}</div><div><b>Style</b>{brief.budget}</div>
            <div><b>Showing</b>{needsList(n).join(" · ")}</div>
          </div>
        </div>
        <div className="stub">
          <div className="k">Estimated total · {len} day{len > 1 ? "s" : ""}{n.hotel || n.itinerary ? `, ${q.nights} night${q.nights > 1 ? "s" : ""}` : ""}</div>
          <div className="total mono">{inr(q.total)}</div>
          <div className="pp">{pp}</div>
        </div>
      </div>

      <div className="grid">
        <div className="col">
          {(n.itinerary || q.carTooSmall) && <div style={{ display: "grid", gap: 8 }}>
            {n.itinerary && (closures.length > 0 ? (
              <div className="alert warn"><div><b>{closures.length} closure{closures.length > 1 ? "s" : ""} on these dates.</b> {closures.join(", ")}.</div><button className="btn" onClick={fixDates}>Find a better start date</button></div>
            ) : (
              <div className="alert ok"><div><b>No known closures.</b> Every stop should be open on your dates.</div></div>
            ))}
            {q.carTooSmall && q.car && <div className="alert warn"><div><b>{q.car.name} seats {q.car.seats}.</b> Pick a bigger car for {brief.pax} adults.</div></div>}
          </div>}

          {n.flights && <section aria-labelledby="h-flights">
            <div className="sec-head"><h2 id="h-flights">Flights</h2><p>Per person, one way</p></div>
            <div className="sub">Day 1 · {plan.flights.outbound[0]?.route || "Outbound"}</div>
            <div className="opts">{plan.flights.outbound.map((f, i) => <button key={i} className="opt" aria-pressed={sel.out === i} onClick={() => pick("out", i)}><FlightCard f={f} /></button>)}</div>
            <div className="sub">Day {len} · {fmtDate(end)} · {plan.flights.return[0]?.route || "Return"}</div>
            <div className="opts">{plan.flights.return.map((f, i) => <button key={i} className="opt" aria-pressed={sel.ret === i} onClick={() => pick("ret", i)}><FlightCard f={f} /></button>)}</div>
          </section>}

          {n.hotel && <section aria-labelledby="h-hotel">
            <div className="sec-head"><h2 id="h-hotel">Hotel</h2><p>{q.nights} night{q.nights > 1 ? "s" : ""} · {q.rooms} room{q.rooms > 1 ? "s" : ""} for {brief.pax}{plan.hotel_tax_pct ? ` · ${plan.hotel_tax_pct}% tax added in quote` : ""}</p></div>
            <div className="opts">{plan.hotels.map((h, i) => (
              <button key={i} className="opt" aria-pressed={sel.hotel === i} onClick={() => pick("hotel", i)}>
                {h.tier && <span className="tag">{h.tier}</span>}
                <span className="name">{h.name}</span><span className="meta">{h.area}</span>
                <span className="price">{inr(h.rate_inr)} <span className="meta">/ room / night</span></span>
                {h.why && <span className="meta">{h.why}</span>}
              </button>))}
            </div>
          </section>}

          {n.car && <section aria-labelledby="h-car">
            <div className="sec-head"><h2 id="h-car">Rental car</h2><p>{plan.car_days ? (n.itinerary ? `Needed on ${plan.car_days} of ${len} days. ` : `Priced for ${plan.car_days} day${plan.car_days > 1 ? "s" : ""}. `) : "Not needed on this trip. "}{plan.car_note}</p></div>
            <div className="opts" style={{ opacity: state.carOn ? 1 : 0.45 }}>{plan.cars.map((c, i) => (
              <button key={i} className="opt" aria-pressed={sel.car === i} onClick={() => pick("car", i)}>
                <span className="tag">{c.mode}</span><span className="name">{c.name}</span>
                <span className="meta">{c.company}{c.company ? " · " : ""}up to {c.seats}</span>
                <span className="price">{inr(c.daily_inr)} <span className="meta">/ day</span></span>
                {c.includes && <span className="meta">{c.includes}</span>}
                {brief.pax > c.seats && <span className="tag warn">Too small for {brief.pax}</span>}
              </button>))}
            </div>
          </section>}

          {n.itinerary && <section aria-labelledby="h-extras">
            <div className="sec-head"><h2 id="h-extras">Trip options</h2></div>
            <div className="extras">
              {n.car && <div className="row"><span>Rental car</span>
                <div className="seg">
                  <button aria-pressed={state.carOn} onClick={() => onChange({ ...state, carOn: true })}>Include</button>
                  <button aria-pressed={!state.carOn} onClick={() => onChange({ ...state, carOn: false })}>Skip it</button>
                </div></div>}
              <div className="row"><span>Food style</span>
                <div className="seg">
                  {(["street", "mid", "fine"] as FoodStyle[]).map((f) => <button key={f} aria-pressed={state.food === f} onClick={() => onChange({ ...state, food: f })}>{f === "street" ? "Street & local" : f === "mid" ? "Mixed" : "Fine dining"}</button>)}
                </div></div>
            </div>
          </section>}

          {n.itinerary && d && <section aria-labelledby="h-plan">
            <div className="sec-head"><h2 id="h-plan">Day-by-day plan</h2><p>Updates with your flight, hotel and car</p></div>
            <div className="days" role="tablist">
              {days.map((x, i) => (
                <button key={i} role="tab" className={"day-tab" + (x.warn ? " has-warn" : "")} aria-selected={x === d} onClick={() => setDay(i)}>
                  Day {i + 1}<small>{fmtDate(x.date)}{x.warn ? " · ⚠" : ""}</small>
                </button>))}
            </div>
            <article className="day" role="tabpanel">
              <div className="day-title"><h3>Day {days.indexOf(d) + 1} · {d.title}</h3><span>{fmtDate(d.date)}</span></div>
              <ol className="stops">
                {d.stops.map((s, i) => (
                  <li key={i} className={`stop k-${s.kind}${s.isClosed ? " closed" : ""}`}>
                    <span className="t">{s.time}</span><span className="dot" aria-hidden="true" />
                    <div>
                      <div className="nm"><span className="label">{s.name}</span>
                        {s.kind !== "visit" && <span className="kind">{s.kind.toUpperCase()}</span>}
                        {s.isClosed && <span className="tag warn">Closed {DOW[d.date.getUTCDay()]}days</span>}</div>
                      {s.note && <div className="nt">{s.note}</div>}
                    </div>
                  </li>))}
              </ol>
            </article>
          </section>}

          {plan.tips.length > 0 && (
            <section aria-labelledby="h-tips">
              <div className="sec-head"><h2 id="h-tips">Good to know</h2></div>
              <ul className="tips">{plan.tips.map((t) => <li key={t}>{t}</li>)}</ul>
            </section>
          )}
        </div>

        <aside className="quote" id="quote" aria-labelledby="h-quote">
          <h2 id="h-quote">Your quote</h2>
          <dl className="lines">
            {q.lines.map((l) => <div className="line" key={l.label}><dt>{l.label}</dt><dd>{inr(l.value)}</dd><span className="why">{l.why}</span></div>)}
          </dl>
          <div className="grand"><span>Total</span><span className="v mono">{inr(q.total)}</span></div>
          <p className="fine">{pp}</p>
          <div className="actions">
            <button className="btn solid pdf" onClick={pdf} disabled={pdfBusy}>{pdfBusy ? "Creating PDF…" : "Save as PDF"}</button>
            {onSave && <button className="btn" onClick={save} disabled={saving || saved}>{saved ? "Saved ✓" : saving ? "Saving…" : "Save trip"}</button>}
            {!example && <button className="btn" onClick={() => setMailOpen((x) => !x)} aria-expanded={mailOpen}>✉ Email itinerary</button>}
            <button className="btn" onClick={copyText}>Copy text</button>
            <button className="btn" onClick={onNewTrip}>Plan another trip</button>
          </div>
          {mailOpen && (
            <form className="trip-mail" onSubmit={(e) => { e.preventDefault(); void sendMail(); }} noValidate aria-label="Email the itinerary">
              <p className="fine"><b>To:</b> the Sigma team group (NOTIFY_CC), with the itinerary PDF attached.</p>
              <div className="field"><label className="lbl" htmlFor="tm-extra">Also send to (optional, comma separated)</label>
                <input id="tm-extra" value={mailExtra} onChange={(e) => { setMailExtra(e.target.value); setMailError(undefined); }} placeholder="customer@example.com" disabled={mailBusy} /></div>
              <div className="field"><label className="lbl" htmlFor="tm-note">Note (optional)</label>
                <textarea id="tm-note" rows={2} maxLength={1000} value={mailNote} onChange={(e) => setMailNote(e.target.value)} disabled={mailBusy} /></div>
              {mailError && <p className="err-text" role="alert">{mailError}</p>}
              <div className="actions">
                <button className="btn solid" type="submit" disabled={mailBusy}>{mailBusy ? "Sending…" : "Send email"}</button>
                <button className="btn" type="button" onClick={() => setMailOpen(false)} disabled={mailBusy}>Cancel</button>
              </div>
            </form>
          )}
          {mailSent && !mailOpen && <p className="fine trip-mail-sent" role="status">✓ Emailed to {mailSent.to.join(", ")} · {new Date(mailSent.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p>}
          <p className="fine">{example ? "Example figures for a sample Kochi–Delhi trip." : "Prices are Gemini's estimates from general knowledge, not live fares. Check availability before booking."}</p>
        </aside>
      </div>

      <div className="mbar">
        <div><div className="fine">Estimated total</div><div className="v mono">{inr(q.total)}</div></div>
        <div className="actions">
          <button className="btn solid" onClick={pdf} disabled={pdfBusy}>PDF</button>
          <button className="btn" onClick={() => document.getElementById("quote")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Quote</button>
        </div>
      </div>
    </section>
  );
}
