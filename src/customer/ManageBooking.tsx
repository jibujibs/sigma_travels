import { useRef, useState, type FormEvent, type Ref } from "react";
import type { ManageView } from "../../shared/booking";
import { api } from "../lib/api";
import { day, dayTime, displayName, money, PAX_TYPE, time } from "../lib/booking-format";

/** Sample bookings for the demo (match server/sabre-mock.ts). Each fills both the PNR and its booking email. */
const DEMO = [
  { pnr: "SGM7QX", email: "aiswaryabiju30@gmail.com" },
  { pnr: "TRV4LM", email: "anand.nair@example.com" },
  { pnr: "SFO2NY", email: "rahul.patel@example.com" },
  { pnr: "PAID01", email: "joseph.thomas@example.com" },
];

/**
 * Customer tab — "Manage my booking": the traveller enters their PNR and booking email, sees the booking and
 * its payment status, and pays if their agent has sent a payment link.
 */
export function ManageBooking() {
  const [pnr, setPnr] = useState("");
  const [email, setEmail] = useState("");
  const [view, setView] = useState<ManageView | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const resultRef = useRef<HTMLElement>(null);

  async function find(p: string, em: string, e?: FormEvent) {
    e?.preventDefault();
    const code = p.trim().toUpperCase();
    setPnr(code);
    setEmail(em);
    if (!/^[A-Z0-9]{6}$/.test(code)) { setError("Enter the 6-character booking reference (PNR), e.g. SGM7QX."); return; }
    if (!/^\S+@\S+\.\S+$/.test(em.trim())) { setError("Enter the email address used for the booking."); return; }
    setLoading(true);
    setError(undefined);
    try {
      setView(await api.booking.find(code, em.trim()));
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setView(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="desk mb-wrap">
      <section className="desk-hero mb-hero" aria-labelledby="mb-h">
        <div>
          <p className="eyebrow">Already booked?</p>
          <h1 id="mb-h">Find your booking</h1>
          <p className="hint">See your flights and payment status, and pay if anything is due.</p>
        </div>
        <form className="mb-form" onSubmit={(e) => find(pnr, email, e)} noValidate>
          <div className="field">
            <label className="lbl" htmlFor="mb-pnr">Booking reference (PNR)</label>
            <input id="mb-pnr" className="mono mb-pnr" value={pnr} maxLength={6} autoComplete="off" spellCheck={false} placeholder="e.g. SGM7QX"
              onChange={(e) => setPnr(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="mb-email">Email address</label>
            <input id="mb-email" type="email" inputMode="email" autoComplete="email" value={email} placeholder="you@example.com"
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn big mb-go" type="submit" disabled={loading}>{loading ? "Finding…" : "Find my booking"}</button>
          {error && <p className="err-text mb-full" role="alert">{error}</p>}
          <div className="mb-full mb-demo">
            <span className="lbl">Sample bookings for the demo</span>
            <div className="chips">{DEMO.map((d) => <button key={d.pnr} type="button" className="chip mono" onClick={() => find(d.pnr, d.email)}>{d.pnr}</button>)}</div>
          </div>
        </form>
      </section>

      {view && <BookingCard view={view} ref={resultRef} onReset={() => { setView(null); setPnr(""); setEmail(""); window.scrollTo({ top: 0, behavior: "smooth" }); }} />}
    </div>
  );
}

function BookingCard({ view, ref, onReset }: { view: ManageView; ref: Ref<HTMLElement>; onReset: () => void }) {
  const total = money(view.fare.total, view.fare.currency);
  return (
    <section className="pnr-card mb-card" aria-labelledby="mb-pnr-h" ref={ref}>
      <header className="pnr-head">
        <div>
          <p className="lbl">Your booking</p>
          <h2 id="mb-pnr-h" className="mono pnr-code">{view.pnr}</h2>
        </div>
        <div className="badges">
          {view.status === "due" ? <span className="badge warn">Payment due</span> : <span className="badge ok">Paid</span>}
        </div>
      </header>

      <h3>Passengers</h3>
      <ul className="pax-list">{view.passengers.map((p) => <li key={p.name}>{displayName(p.name)} <span className="muted">· {PAX_TYPE[p.type]}</span></li>)}</ul>

      <h3>Flights</h3>
      <ol className="segs">
        {view.segments.map((s) => (
          <li key={s.flight + s.depart} className="seg">
            <div className="seg-date">{day(s.depart)}</div>
            <div className="seg-route">
              <span><b className="mono">{time(s.depart)}</b> {s.fromCity} <span className="mono muted">{s.from}</span></span>
              <span className="seg-line" aria-hidden="true" />
              <span><b className="mono">{time(s.arrive)}</b> {s.toCity} <span className="mono muted">{s.to}</span>{s.arrive.slice(0, 10) !== s.depart.slice(0, 10) && <sup className="muted"> +1</sup>}</span>
            </div>
            <div className="seg-meta">{s.airline} <span className="mono">{s.flight}</span> · {s.cabin} · {s.baggage}</div>
          </li>
        ))}
      </ol>

      <h3>Fare</h3>
      <dl className="fare">
        <div><dt>Base fare</dt><dd className="mono">{money(view.fare.base, view.fare.currency)}</dd></div>
        <div><dt>Taxes and fees</dt><dd className="mono">{money(view.fare.taxes, view.fare.currency)}</dd></div>
        <div className="total"><dt>{view.status === "due" ? "Total to pay" : "Total"}</dt><dd className="mono">{total}</dd></div>
      </dl>

      <div className="mb-status">
        {view.status === "due" && view.payUrl && (
          <>
            <p className="hint">Your travel agent has sent a secure payment link. Please pay before {dayTime(view.ticketingDeadline)} so your tickets can be issued.</p>
            <a className="btn solid big wide" href={view.payUrl}>Pay {total}</a>
          </>
        )}
        {view.status === "due" && !view.payUrl && (
          <p className="note">Your travel agent hasn't sent a payment link yet. They will send one by email; you can also call the office using the details below.</p>
        )}
        {view.status === "paid" && view.payment && (
          <dl className="fare">
            <div><dt>Paid with</dt><dd>{view.payment.rail === "stripe" ? "Card (Stripe)" : "Card (Sabre demo)"}</dd></div>
            {view.payment.reference && <div><dt>Reference</dt><dd className="mono small">{view.payment.reference}</dd></div>}
            {view.payment.paidAt && <div><dt>Paid on</dt><dd>{new Date(view.payment.paidAt).toLocaleString()}</dd></div>}
          </dl>
        )}
        {view.status === "paid_in_sabre" && <p className="hint">This booking was paid at the agency.</p>}
        {view.tickets && view.tickets.length > 0 && (
          <div className="mb-tickets">
            <h3>Tickets issued</h3>
            <table className="pax tickets">
              <thead><tr><th>Passenger</th><th>Ticket number</th></tr></thead>
              <tbody>{view.tickets.map((t) => <tr key={t.number}><td>{displayName(t.passenger)}</td><td className="mono">{t.number}</td></tr>)}</tbody>
            </table>
          </div>
        )}
        {view.status !== "due" && !view.tickets?.length && <p className="hint">Thank you. Your travel agent will issue your tickets and email them to you.</p>}
      </div>

      <button type="button" className="btn wide" onClick={onReset}>Look up another booking</button>
    </section>
  );
}
