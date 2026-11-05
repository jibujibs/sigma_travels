import { useState } from "react";
import type { BudgetCap, PriceAlert } from "../../shared/priceAlert";
import { cheapestPerPerson } from "../../shared/priceAlert";
import { money } from "../../shared/currency";
import { planCur } from "../lib/format";
import type { PlanState } from "../lib/trip";
import { api } from "../lib/api";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-12-05" → "5 Dec 2026" */
const longDate = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

interface Props {
  state: PlanState;
  cap: BudgetCap;
  /** The signed-in account's email, filled in for the alert. */
  email: string;
  onAlert: (a: PriceAlert) => void;
}

/**
 * The budget the traveller typed ("under $1000"), checked against the plan's cheapest flights per person
 * (way out + way back). Within it: a green line. Above it: offer a price alert by email.
 */
export function BudgetCheck({ state, cap, email, onAlert }: Props) {
  const { plan, brief } = state;
  const cur = planCur(plan);
  const cheapest = cheapestPerPerson(plan);
  const [to, setTo] = useState(email);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<PriceAlert | null>(null);
  const [no, setNo] = useState(false);
  const budget = money(cap.amount, cap.currency);

  // A $ budget on a trip priced in ₹ (or the other way): not converted, so nothing is compared.
  if (cap.currency !== cur) {
    return <div className="alert warn budget-box"><div><b>Your budget is {budget} per person.</b> Prices here are in {cur} (the currency of {brief.origin}), so they aren't compared with it. Sunny can help with a budget in {cap.currency}.</div></div>;
  }
  if (cheapest == null) return null;
  if (cheapest <= cap.amount) {
    return <div className="alert ok budget-box"><div><b>✓ Within your budget of {budget}.</b> Flights from {money(cheapest, cur)} per person, return.</div></div>;
  }

  async function create() {
    if (!/^\S+@\S+\.\S+$/.test(to.trim())) return setError("Check the email address.");
    setBusy(true); setError(undefined);
    try {
      const d = plan.destination;
      const { alert } = await api.alerts.create({
        email: to.trim(), origin: brief.origin, destination: { city: d.city, country: d.country, airport: d.airport },
        depart: brief.start, days: brief.days, adults: brief.pax, budget: cap.amount, currency: cap.currency, price: cheapest,
      });
      setDone(alert); onAlert(alert);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  if (done) {
    return <div className="alert ok budget-box"><div><b>🔔 Price alert on.</b> We'll email {done.email} if {done.origin.replace(/\s*\(.*\)/, "")} → {done.destination.replace(/\s*\(.*\)/, "")} drops below {budget} per person. We check once a day until {longDate(done.depart)}.</div></div>;
  }
  if (no) return <div className="alert warn budget-box"><div><b>No flights within {budget} per person.</b> Cheapest now: {money(cheapest, cur)}.</div></div>;
  return (
    <div className="price-alert" role="region" aria-labelledby="pa-h">
      <p className="eyebrow">Price alert</p>
      <h3 id="pa-h">Sorry, we couldn't find any flights within your budget of {budget}.</h3>
      <p className="hint">The cheapest now is <b>{money(cheapest, cur)}</b> per person, return. Would you like us to notify you when the ticket price drops below {budget}?</p>
      <div className="field pa-email">
        <label className="lbl" htmlFor="pa-email">Email</label>
        <input id="pa-email" type="email" inputMode="email" value={to} maxLength={120} onChange={(e) => { setTo(e.target.value); setError(undefined); }} disabled={busy} />
      </div>
      {error && <p className="err-text" role="alert">{error}</p>}
      <div className="pa-actions">
        <button className="btn solid" onClick={() => void create()} disabled={busy}>{busy ? "Saving…" : "🔔 Yes, notify me"}</button>
        <button className="btn" onClick={() => setNo(true)} disabled={busy}>No, thanks</button>
      </div>
      <p className="fine">Prices are the AI Trip Planner's estimates. Sunny confirms the real fare before booking.</p>
    </div>
  );
}
