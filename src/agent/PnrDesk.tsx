import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PaymentLink, PayRail, PnrResponse } from "../../shared/booking";
import { api } from "../lib/api";
import { day, dayTime, daysUntil, displayName, money, PAX_TYPE, STATUS_WORD, time } from "../lib/booking-format";

const SAMPLES = ["SGM7QX", "TRV4LM", "SFO2NY", "PAID01"];

const CHECKLIST = [
  "Passenger names match the passports (spelling, order, title)",
  "Flights, dates and times confirmed with the traveller",
  "Fare and total amount agreed with the traveller",
  "Change and refund rules explained to the traveller",
  "Ticketing deadline leaves enough time to pay",
  "Customer email and phone number are correct",
];

const STEPS = ["Find PNR", "Verify itinerary", "Checklist", "Payment link", "Customer pays"];

interface Props {
  agentName: string;
}

/**
 * Agent flow for collecting payment on a Sabre booking:
 * PNR → retrieve → verify itinerary → checklist → choose Stripe or Sabre → payment link → customer pays.
 */
export function PnrDesk({ agentName }: Props) {
  const [pnr, setPnr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [data, setData] = useState<PnrResponse | null>(null);
  const [verified, setVerified] = useState(false);
  const [checks, setChecks] = useState<boolean[]>(CHECKLIST.map(() => false));
  const [rail, setRail] = useState<PayRail>("stripe");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [linkError, setLinkError] = useState<string>();
  const [copied, setCopied] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);

  const payment = data?.payment ?? null;
  const allChecked = checks.every(Boolean);
  const paid = !!data && (data.booking.paidInSabre || payment?.status === "paid");
  const activeLink = payment && payment.status === "sent" ? payment : null;
  const step = !data ? 0 : paid ? 5 : activeLink ? 4 : !verified ? 1 : !allChecked ? 2 : 3;

  async function search(code: string, e?: FormEvent) {
    e?.preventDefault();
    const v = code.trim().toUpperCase();
    setPnr(v);
    if (!/^[A-Z0-9]{6}$/.test(v)) { setError("Enter the 6-character PNR (record locator), e.g. SGM7QX."); return; }
    setLoading(true);
    setError(undefined);
    setLinkError(undefined);
    try {
      const r = await api.pnr.get(v);
      setData(r);
      setVerified(false);
      setChecks(CHECKLIST.map(() => false));
      setRail(r.stripeReady ? "stripe" : "sabre");
      setEmail(r.booking.contact.email);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err) {
      setData(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function createLink() {
    if (!data) return;
    setCreating(true);
    setLinkError(undefined);
    try {
      const r = await api.pnr.createLink(data.booking.pnr, rail, email);
      setData({ ...data, payment: r.payment });
    } catch (err) {
      setLinkError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  // While the customer has the link, check every few seconds whether they have paid.
  const waitingFor = activeLink ? data?.booking.pnr : undefined;
  useEffect(() => {
    if (!waitingFor) return;
    const id = window.setInterval(async () => {
      try {
        const r = await api.pnr.get(waitingFor);
        setData((d) => (d && d.booking.pnr === waitingFor ? { ...d, payment: r.payment } : d));
      } catch { /* keep the last known state */ }
    }, 4000);
    return () => window.clearInterval(id);
  }, [waitingFor]);

  async function copy(url: string) {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard blocked: the link is visible to select */ }
  }

  const b = data?.booking;
  const lead = b ? displayName(b.passengers[0].name).replace(/\s*\(.*\)$/, "").split(" ")[0] : "";

  return (
    <div className="desk">
      <section className="desk-hero" aria-labelledby="desk-h">
        <div>
          <p className="eyebrow">Agent desk · Sabre bookings</p>
          <h1 id="desk-h">Collect payment for a Sabre booking</h1>
          <p className="hint">Enter the PNR you created in Sabre. Check the itinerary with the traveller, then send them a secure payment link. You never handle their card.</p>
        </div>
        <ol className="stepper" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className={i < step ? "done" : i === step ? "now" : ""} aria-current={i === step ? "step" : undefined}>
              <span className="dot">{i < step ? "✓" : i + 1}</span>{s}
            </li>
          ))}
        </ol>
        <form className="pnr-form" onSubmit={(e) => search(pnr, e)}>
          <label className="lbl" htmlFor="pnr">PNR · record locator</label>
          <div className="pnr-row">
            <input id="pnr" className={`mono${error ? " invalid" : ""}`} value={pnr} maxLength={6} autoComplete="off" spellCheck={false}
              placeholder="e.g. SGM7QX" aria-invalid={!!error} aria-describedby={error ? "pnr-err" : "pnr-hint"}
              onChange={(e) => setPnr(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} />
            <button className="btn solid big" type="submit" disabled={loading}>{loading ? "Searching…" : "Search"}</button>
          </div>
          {error && <p className="err-text" id="pnr-err" role="alert">{error}</p>}
          <p className="hint" id="pnr-hint">Sample PNRs for the demo:{" "}
            {SAMPLES.map((s) => <button key={s} type="button" className="chip mono" onClick={() => search(s)}>{s}</button>)}
          </p>
        </form>
      </section>

      {b && data && (
        <div className="desk-grid" ref={resultRef}>
          {/* ---------- booking ---------- */}
          <section className="pnr-card" aria-labelledby="pnr-h">
            <header className="pnr-head">
              <div>
                <p className="lbl">Record locator</p>
                <h2 id="pnr-h" className="mono pnr-code">{b.pnr}</h2>
                <p className="hint">Created {dayTime(b.createdAt)} · {data.source === "sample" ? "Sample booking (Sabre access pending)" : "Live from Sabre"}</p>
              </div>
              <div className="badges">
                {paid ? <span className="badge ok">Paid</span> : <span className="badge warn">Payment due</span>}
                <span className={`badge ${daysUntil(b.ticketingDeadline) <= 2 ? "warn" : ""}`}>Ticket by {dayTime(b.ticketingDeadline)}</span>
              </div>
            </header>

            <h3>Passengers</h3>
            <div className="table-wrap"><table className="pax">
              <thead><tr><th>Name (as in Sabre)</th><th>Type</th><th>Passport</th></tr></thead>
              <tbody>{b.passengers.map((p) => (
                <tr key={p.name}><td className="mono">{p.name}</td><td>{PAX_TYPE[p.type]}</td><td className="mono">{p.passport ? `•••• ${p.passport}` : "—"}</td></tr>
              ))}</tbody>
            </table></div>

            <h3>Itinerary</h3>
            <ol className="segs">
              {b.segments.map((s) => (
                <li key={s.flight + s.depart} className="seg">
                  <div className="seg-date">{day(s.depart)}</div>
                  <div className="seg-route">
                    <span><b className="mono">{time(s.depart)}</b> {s.fromCity} <span className="mono muted">{s.from}</span></span>
                    <span className="seg-line" aria-hidden="true" />
                    <span><b className="mono">{time(s.arrive)}</b> {s.toCity} <span className="mono muted">{s.to}</span>{s.arrive.slice(0, 10) !== s.depart.slice(0, 10) && <sup className="muted"> +1</sup>}</span>
                  </div>
                  <div className="seg-meta">{s.airline} <span className="mono">{s.flight}</span> · {s.cabin} · {s.baggage} · <span className={s.status === "HK" ? "ok-text" : "warn-text"}>{STATUS_WORD[s.status] ?? s.status}</span></div>
                </li>
              ))}
            </ol>

            <h3>Fare</h3>
            <dl className="fare">
              <div><dt>Base fare ({b.passengers.length} passenger{b.passengers.length > 1 ? "s" : ""})</dt><dd className="mono">{money(b.fare.base, b.fare.currency)}</dd></div>
              <div><dt>Taxes and fees</dt><dd className="mono">{money(b.fare.taxes, b.fare.currency)}</dd></div>
              <div className="total"><dt>Total to collect</dt><dd className="mono">{money(b.fare.total, b.fare.currency)}</dd></div>
            </dl>
            <p className="hint"><b>Fare rules:</b> {b.fareRules}</p>
            <p className="hint"><b>Contact:</b> {b.contact.email} · {b.contact.phone}</p>

            {!paid && !activeLink && (
              <div className="verify">
                <button className={`btn ${verified ? "" : "solid"}`} onClick={() => setVerified((v) => !v)} aria-pressed={verified}>
                  {verified ? "✓ Itinerary verified with the traveller" : "I've verified this itinerary with the traveller"}
                </button>
              </div>
            )}
          </section>

          {/* ---------- actions ---------- */}
          <aside className="desk-side">
            {data.booking.paidInSabre ? (
              <section className="side-card ok-card">
                <h2>Already paid in Sabre</h2>
                <p className="hint">This PNR already has a form of payment. No payment link is needed; it can go straight to ticketing.</p>
              </section>
            ) : payment?.status === "paid" ? (
              <PaidCard payment={payment} />
            ) : activeLink ? (
              <LinkCard payment={activeLink} agentName={agentName} lead={lead} copied={copied} onCopy={copy}
                onNew={() => setData({ ...data, payment: { ...activeLink, status: "expired" } })} />
            ) : (
              <>
                <section className={`side-card${verified ? "" : " locked"}`} aria-labelledby="chk-h">
                  <h2 id="chk-h">Checklist</h2>
                  {!verified && <p className="hint">Verify the itinerary first.</p>}
                  <ul className="checklist">
                    {CHECKLIST.map((c, i) => (
                      <li key={c}>
                        <label><input type="checkbox" disabled={!verified} checked={checks[i]}
                          onChange={(e) => setChecks((x) => x.map((v, j) => (j === i ? e.target.checked : v)))} /> {c}</label>
                      </li>
                    ))}
                  </ul>
                  <p className="hint">{checks.filter(Boolean).length} of {CHECKLIST.length} done</p>
                </section>

                <section className={`side-card${verified && allChecked ? "" : " locked"}`} aria-labelledby="pay-h">
                  <h2 id="pay-h">Payment link</h2>
                  <div className="rails" role="radiogroup" aria-label="Payment option">
                    <button type="button" role="radio" aria-checked={rail === "stripe"} className="rail" disabled={!verified || !allChecked} onClick={() => setRail("stripe")}>
                      <b>Stripe</b><span>Card payment on Stripe's secure page. Lower fees.{data.stripeReady ? "" : " Stripe key not set: demo card page."}</span>
                    </button>
                    <button type="button" role="radio" aria-checked={rail === "sabre"} className="rail" disabled={!verified || !allChecked} onClick={() => setRail("sabre")}>
                      <b>Sabre</b><span>Sabre payment. Simulated until Sabre API access is set up.</span>
                    </button>
                  </div>
                  <div className="field">
                    <label className="lbl" htmlFor="cust-email">Send to (customer email)</label>
                    <input id="cust-email" type="email" value={email} disabled={!verified || !allChecked} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <p className="amount-line">Amount <b className="mono">{money(b.fare.total, b.fare.currency)}</b></p>
                  <button className="btn solid big wide" disabled={!verified || !allChecked || creating || !/^\S+@\S+\.\S+$/.test(email)} onClick={createLink}>
                    {creating ? "Creating link…" : "Generate payment link"}
                  </button>
                  {linkError && <p className="err-text" role="alert">{linkError}</p>}
                </section>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function LinkCard({ payment, agentName, lead, copied, onCopy, onNew }: {
  payment: PaymentLink; agentName: string; lead: string; copied: boolean; onCopy: (url: string) => void; onNew: () => void;
}) {
  return (
    <section className="side-card" aria-labelledby="link-h">
      <h2 id="link-h">Payment link sent</h2>
      <p className="waiting" role="status"><span className="pulse" aria-hidden="true" /> Waiting for the customer to pay…</p>
      <div className="link-box">
        <input readOnly value={payment.url} aria-label="Payment link" onFocus={(e) => e.target.select()} className="mono" />
        <button className="btn" onClick={() => onCopy(payment.url)}>{copied ? "Copied" : "Copy"}</button>
      </div>
      <a className="btn solid wide" href={payment.url} target="_blank" rel="noopener">Open as customer</a>
      <div className="email-preview" aria-label="Email preview">
        <p className="lbl">Email preview</p>
        <p><b>To:</b> {payment.customerEmail}<br /><b>Cc:</b> you<br /><b>Subject:</b> Payment for your flight booking {payment.pnr}</p>
        <p>Dear {lead || "traveller"},</p>
        <p>Please review your itinerary and pay {money(payment.amount, payment.currency)} for booking {payment.pnr} using this secure link:</p>
        <p className="mono small">{payment.url}</p>
        <p>Your card details are entered on a secure payment page; we never see them.</p>
        <p>Regards,<br />{agentName}, Sigma Travels</p>
      </div>
      <button className="btn wide" onClick={onNew}>Make a new link</button>
    </section>
  );
}

function PaidCard({ payment }: { payment: PaymentLink }) {
  return (
    <section className="side-card ok-card" aria-labelledby="paid-h" role="status">
      <h2 id="paid-h">✓ Payment received</h2>
      <dl className="fare">
        <div><dt>Amount</dt><dd className="mono">{money(payment.amount, payment.currency)}</dd></div>
        <div><dt>Paid with</dt><dd>{payment.rail === "stripe" ? "Stripe" : "Sabre (demo)"}</dd></div>
        <div><dt>Reference</dt><dd className="mono small">{payment.reference}</dd></div>
        {payment.paidAt && <div><dt>Time</dt><dd>{new Date(payment.paidAt).toLocaleString()}</dd></div>}
      </dl>
      <p className="hint">Next: write the payment remark to the PNR and issue the ticket in Sabre. This step is automated once Sabre API access is set up.</p>
      <button className="btn wide" disabled title="Available once Sabre API access is set up">Issue ticket in Sabre</button>
    </section>
  );
}
