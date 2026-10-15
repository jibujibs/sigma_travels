import { useState } from "react";
import type { Flight } from "../../shared/types";
import { addDays, DOW, fmtDate, inr, iso, originCity, parseISO, todayUTC } from "../lib/format";
import { buildDays, homeCode, price, type FoodStyle, type PlanState, type Selection } from "../lib/trip";

interface Props {
  state: PlanState;
  example: boolean;
  model?: string;
  onChange: (s: PlanState) => void;
  onPdf: () => Promise<void>;
  onNewTrip: () => void;
  toast: (m: string) => void;
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

export function PlanView({ state, example, model, onChange, onPdf, onNewTrip, toast }: Props) {
  const [day, setDay] = useState(0);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { plan, brief, sel } = state;
  const days = buildDays(state);
  const q = price(state);
  const d = days[Math.min(day, days.length - 1)];
  const start = parseISO(brief.start);
  const end = addDays(start, plan.days.length - 1);
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

  async function copyText() {
    let s = `Sigma Travels · ${originCity(brief.origin)} → ${plan.destination.city}\n${fmtDate(start)} – ${fmtDate(end)} · ${brief.pax} adult(s)\n`;
    days.forEach((x, i) => { s += `\nDay ${i + 1} · ${fmtDate(x.date)} · ${x.title}\n`; x.stops.forEach((st) => { s += `  ${st.time}  ${st.name}${st.isClosed ? " (closed this day)" : ""}\n`; }); });
    s += "\nEstimate\n"; q.lines.forEach((l) => { s += `  ${l.label}: ${inr(l.value)}\n`; });
    s += `  Total: ${inr(q.total)} (${inr(q.perPerson)} per person)\nEstimates only, subject to availability.`;
    try { await navigator.clipboard.writeText(s); toast("Itinerary copied. Paste it into WhatsApp or email"); }
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
          </div>
        </div>
        <div className="stub">
          <div className="k">Estimated total · {plan.days.length} days, {q.nights} nights</div>
          <div className="total mono">{inr(q.total)}</div>
          <div className="pp">{pp}</div>
        </div>
      </div>

      <div className="grid">
        <div className="col">
          <div style={{ display: "grid", gap: 8 }}>
            {closures.length > 0 ? (
              <div className="alert warn"><div><b>{closures.length} closure{closures.length > 1 ? "s" : ""} on these dates.</b> {closures.join(", ")}.</div><button className="btn" onClick={fixDates}>Find a better start date</button></div>
            ) : (
              <div className="alert ok"><div><b>No known closures.</b> Every stop should be open on your dates.</div></div>
            )}
            {q.carTooSmall && q.car && <div className="alert warn"><div><b>{q.car.name} seats {q.car.seats}.</b> Pick a bigger car for {brief.pax} adults.</div></div>}
          </div>

          <section aria-labelledby="h-flights">
            <div className="sec-head"><h2 id="h-flights">Flights</h2><p>Per person, one way</p></div>
            <div className="sub">Day 1 · {plan.flights.outbound[0]?.route || "Outbound"}</div>
            <div className="opts">{plan.flights.outbound.map((f, i) => <button key={i} className="opt" aria-pressed={sel.out === i} onClick={() => pick("out", i)}><FlightCard f={f} /></button>)}</div>
            <div className="sub">Day {plan.days.length} · {plan.flights.return[0]?.route || "Return"}</div>
            <div className="opts">{plan.flights.return.map((f, i) => <button key={i} className="opt" aria-pressed={sel.ret === i} onClick={() => pick("ret", i)}><FlightCard f={f} /></button>)}</div>
          </section>

          <section aria-labelledby="h-hotel">
            <div className="sec-head"><h2 id="h-hotel">Hotel</h2><p>{q.nights} nights · {q.rooms} room{q.rooms > 1 ? "s" : ""} for {brief.pax}{plan.hotel_tax_pct ? ` · ${plan.hotel_tax_pct}% tax added in quote` : ""}</p></div>
            <div className="opts">{plan.hotels.map((h, i) => (
              <button key={i} className="opt" aria-pressed={sel.hotel === i} onClick={() => pick("hotel", i)}>
                {h.tier && <span className="tag">{h.tier}</span>}
                <span className="name">{h.name}</span><span className="meta">{h.area}</span>
                <span className="price">{inr(h.rate_inr)} <span className="meta">/ room / night</span></span>
                {h.why && <span className="meta">{h.why}</span>}
              </button>))}
            </div>
          </section>

          <section aria-labelledby="h-car">
            <div className="sec-head"><h2 id="h-car">Rental car</h2><p>{plan.car_days ? `Needed on ${plan.car_days} of ${plan.days.length} days. ` : "Not needed on this trip. "}{plan.car_note}</p></div>
            <div className="opts" style={{ opacity: state.carOn ? 1 : 0.45 }}>{plan.cars.map((c, i) => (
              <button key={i} className="opt" aria-pressed={sel.car === i} onClick={() => pick("car", i)}>
                <span className="tag">{c.mode}</span><span className="name">{c.name}</span>
                <span className="meta">{c.company}{c.company ? " · " : ""}up to {c.seats}</span>
                <span className="price">{inr(c.daily_inr)} <span className="meta">/ day</span></span>
                {c.includes && <span className="meta">{c.includes}</span>}
                {brief.pax > c.seats && <span className="tag warn">Too small for {brief.pax}</span>}
              </button>))}
            </div>
          </section>

          <section aria-labelledby="h-extras">
            <div className="sec-head"><h2 id="h-extras">Trip options</h2></div>
            <div className="extras">
              <div className="row"><span>Rental car</span>
                <div className="seg">
                  <button aria-pressed={state.carOn} onClick={() => onChange({ ...state, carOn: true })}>Include</button>
                  <button aria-pressed={!state.carOn} onClick={() => onChange({ ...state, carOn: false })}>Skip it</button>
                </div></div>
              <div className="row"><span>Food style</span>
                <div className="seg">
                  {(["street", "mid", "fine"] as FoodStyle[]).map((f) => <button key={f} aria-pressed={state.food === f} onClick={() => onChange({ ...state, food: f })}>{f === "street" ? "Street & local" : f === "mid" ? "Mixed" : "Fine dining"}</button>)}
                </div></div>
            </div>
          </section>

          <section aria-labelledby="h-plan">
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
          </section>

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
            <button className="btn" onClick={copyText}>Copy text</button>
            <button className="btn" onClick={onNewTrip}>Plan another trip</button>
          </div>
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
