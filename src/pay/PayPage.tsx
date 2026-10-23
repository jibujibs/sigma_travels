import { useEffect, useState, type FormEvent } from "react";
import type { PayView } from "../../shared/booking";
import { api } from "../lib/api";
import { day, displayName, money, PAX_TYPE, time } from "../lib/booking-format";

/** Luhn check, so a mistyped card number is caught on the demo card page. */
function luhn(n: string): boolean {
  let sum = 0;
  for (let i = 0; i < n.length; i++) {
    let d = Number(n.at(-1 - i));
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return n.length >= 12 && sum % 10 === 0;
}

/**
 * The page a customer opens from the payment link: review the booking, then pay.
 * Stripe links go to Stripe's own Checkout page; card details never touch our site.
 */
export function PayPage({ token }: { token: string }) {
  const [view, setView] = useState<PayView | null>(null);
  const [error, setError] = useState<string>();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [payError, setPayError] = useState<string>();
  const [showCard, setShowCard] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const cancelled = params.get("cancelled") === "1";

  useEffect(() => {
    const sessionId = params.get("session_id");
    (async () => {
      try {
        const v = sessionId ? await api.pay.confirm(token, sessionId) : await api.pay.view(token);
        setView(v);
        if (sessionId) window.history.replaceState(null, "", window.location.pathname);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function pay() {
    if (!view) return;
    setPayError(undefined);
    if (!view.stripe) { setShowCard(true); return; }
    setBusy(true);
    try {
      const { url } = await api.pay.checkout(token);
      window.location.assign(url);
    } catch (e) {
      setPayError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="pay-wrap">
      <header className="pay-top">
        <div className="brand"><span className="logo">Σ</span>Sigma Travels</div>
        <span className="secure">🔒 Secure payment</span>
      </header>

      {error && <section className="pay-card"><h1>Link not available</h1><p className="err-text" role="alert">{error}</p></section>}
      {!error && !view && <section className="pay-card"><p className="hint" role="status">Loading your booking…</p></section>}

      {view && view.status === "paid" && (
        <section className="pay-card paid" aria-labelledby="ok-h">
          <div className="tick" aria-hidden="true">✓</div>
          <h1 id="ok-h">Payment received</h1>
          <p className="hint">Thank you. Your travel agent has been notified and will issue your tickets.</p>
          <dl className="fare">
            <div><dt>Booking</dt><dd className="mono">{view.pnr}</dd></div>
            <div><dt>Amount paid</dt><dd className="mono">{money(view.fare.total, view.fare.currency)}</dd></div>
            <div><dt>Reference</dt><dd className="mono small">{view.reference}</dd></div>
            {view.paidAt && <div><dt>Date</dt><dd>{new Date(view.paidAt).toLocaleString()}</dd></div>}
          </dl>
          <Itinerary view={view} compact />
        </section>
      )}

      {view && view.status === "expired" && (
        <section className="pay-card"><h1>This link has expired</h1><p className="hint">Ask your travel agent for a new payment link for booking <b className="mono">{view.pnr}</b>.</p></section>
      )}

      {view && view.status === "sent" && (
        <section className="pay-card" aria-labelledby="rev-h">
          <p className="lbl">Booking {view.pnr}</p>
          <h1 id="rev-h">Review your booking and pay</h1>
          {cancelled && <p className="note" role="status">Payment was cancelled. Nothing was charged. You can try again below.</p>}
          <Itinerary view={view} />
          <div className="pay-total"><span>Total to pay</span><b className="mono">{money(view.fare.total, view.fare.currency)}</b></div>

          {!showCard ? (
            <>
              <label className="agree"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /> I have checked the passenger names, flights and amount.</label>
              <button className="btn solid big wide" disabled={!agreed || busy} onClick={pay}>
                {busy ? "Opening secure payment…" : `Pay ${money(view.fare.total, view.fare.currency)}`}
              </button>
              {payError && <p className="err-text" role="alert">{payError}</p>}
              <p className="fine">{view.stripe ? "You'll pay on Stripe's secure page. Sigma Travels never sees your card details." : "Demo payment page. No money is taken."}</p>
            </>
          ) : (
            <DemoCard view={view} token={token} onPaid={setView} />
          )}
        </section>
      )}
    </div>
  );
}

function Itinerary({ view, compact }: { view: PayView; compact?: boolean }) {
  return (
    <div className="pay-itin">
      <h2>Passengers</h2>
      <ul className="pax-list">{view.passengers.map((p) => <li key={p.name}>{displayName(p.name)} <span className="muted">· {PAX_TYPE[p.type]}</span></li>)}</ul>
      <h2>Flights</h2>
      <ol className="segs">
        {view.segments.map((s) => (
          <li key={s.flight + s.depart} className="seg">
            <div className="seg-date">{day(s.depart)}</div>
            <div className="seg-route">
              <span><b className="mono">{time(s.depart)}</b> {s.fromCity} <span className="mono muted">{s.from}</span></span>
              <span className="seg-line" aria-hidden="true" />
              <span><b className="mono">{time(s.arrive)}</b> {s.toCity} <span className="mono muted">{s.to}</span>{s.arrive.slice(0, 10) !== s.depart.slice(0, 10) && <sup className="muted"> +1</sup>}</span>
            </div>
            {!compact && <div className="seg-meta">{s.airline} <span className="mono">{s.flight}</span> · {s.cabin} · {s.baggage}</div>}
          </li>
        ))}
      </ol>
      {!compact && (
        <dl className="fare">
          <div><dt>Base fare</dt><dd className="mono">{money(view.fare.base, view.fare.currency)}</dd></div>
          <div><dt>Taxes and fees</dt><dd className="mono">{money(view.fare.taxes, view.fare.currency)}</dd></div>
        </dl>
      )}
    </div>
  );
}

/** Card form for Sabre-rail links in the demo. Only the last 4 digits leave the browser. */
function DemoCard({ view, token, onPaid }: { view: PayView; token: string; onPaid: (v: PayView) => void }) {
  const [num, setNum] = useState("");
  const [exp, setExp] = useState("");
  const [cvc, setCvc] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const digits = num.replace(/\D/g, "");
    const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(exp);
    if (!luhn(digits)) return setErr("Check the card number. For the demo use 4242 4242 4242 4242.");
    if (!m || +m[1] < 1 || +m[1] > 12) return setErr("Enter the expiry as MM/YY.");
    if (!/^\d{3,4}$/.test(cvc)) return setErr("Enter the 3 or 4 digit security code.");
    if (name.trim().length < 2) return setErr("Enter the name on the card.");
    setErr(undefined);
    setBusy(true);
    try {
      onPaid(await api.pay.demoPay(token, digits.slice(-4)));
    } catch (e2) {
      setErr((e2 as Error).message);
      setBusy(false);
    }
  }

  return (
    <form className="card-form" onSubmit={submit} noValidate>
      <p className="lbl">{view.rail === "sabre" ? "Sabre payment · demo" : "Card payment · demo"}</p>
      <div className="field"><label className="lbl" htmlFor="cc-num">Card number</label>
        <input id="cc-num" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" value={num} maxLength={23}
          onChange={(e) => setNum(e.target.value.replace(/[^\d ]/g, ""))} /></div>
      <div className="card-row">
        <div className="field"><label className="lbl" htmlFor="cc-exp">Expiry</label>
          <input id="cc-exp" inputMode="numeric" autoComplete="cc-exp" placeholder="MM/YY" value={exp} maxLength={5} onChange={(e) => setExp(e.target.value)} /></div>
        <div className="field"><label className="lbl" htmlFor="cc-cvc">CVC</label>
          <input id="cc-cvc" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={cvc} maxLength={4} onChange={(e) => setCvc(e.target.value.replace(/\D/g, ""))} /></div>
      </div>
      <div className="field"><label className="lbl" htmlFor="cc-name">Name on card</label>
        <input id="cc-name" autoComplete="cc-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      {err && <p className="err-text" role="alert">{err}</p>}
      <button className="btn solid big wide" type="submit" disabled={busy}>{busy ? "Processing…" : `Pay ${money(view.fare.total, view.fare.currency)}`}</button>
      <p className="fine">Demo only: no money is taken and the card number is not stored.</p>
    </form>
  );
}
