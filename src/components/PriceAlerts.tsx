import { useState } from "react";
import type { PriceAlert } from "../../shared/priceAlert";
import { money } from "../../shared/currency";
import { api } from "../lib/api";

interface Props {
  alerts: PriceAlert[];
  onChange: (a: PriceAlert) => void;
  onClose: () => void;
  toast: (m: string) => void;
}

const STATUS: Record<PriceAlert["status"], string> = { active: "Active", notified: "Sent", expired: "Ended", stopped: "Stopped" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const nice = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
const short = (p: string) => /\(([A-Z]{3})\)/.exec(p)?.[1] ?? p;

/** "My price alerts": each alert's status, and Check now / Send test email / Stop. */
export function PriceAlerts({ alerts, onChange, onClose, toast }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  async function act(a: PriceAlert, action: "check" | "test" | "stop") {
    setBusy(`${a.id}:${action}`);
    try {
      if (action === "stop") { const r = await api.alerts.stop(a.id); onChange(r.alert); toast("Alert stopped"); return; }
      const r = action === "test" ? await api.alerts.test(a.id) : await api.alerts.check(a.id);
      onChange(r.alert);
      const now = r.price == null ? "no price" : money(r.price, a.currency);
      toast(r.reason && !r.emailed ? r.reason
        : action === "test" ? `Test email sent to ${a.email} (now ${now})`
        : r.within ? `Within budget (${now}): email sent to ${a.email}` : `Still above budget: ${now} per person`);
    } catch (e) { toast((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <section className="mytrips" aria-labelledby="h-alerts">
      <div className="sec-head">
        <h2 id="h-alerts">My price alerts</h2>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
      {alerts.length === 0 ? (
        <p className="fine" style={{ fontSize: 15 }}>No price alerts yet. Type a budget like <b>“under $1000”</b> in your request; if no flights fit, you can ask to be notified.</p>
      ) : (
        <div className="trip-list">
          {alerts.map((a) => (
            <article key={a.id} className="trip-row alert-row">
              <div className="code">{short(a.origin)}→{short(a.destination)}</div>
              <div className="trip-info">
                <b>{a.origin} → {a.destination}</b>
                <span className="fine">{nice(a.depart)} – {nice(a.returnDate)} · {a.adults} adult{a.adults > 1 ? "s" : ""} · to {a.email}</span>
                <span className="fine">Budget <b>{money(a.budget, a.currency)}</b> per person · {a.lastPrice != null ? `last ${money(a.lastPrice, a.currency)}` : a.startPrice != null ? `was ${money(a.startPrice, a.currency)}` : "not checked yet"}{a.lastChecked ? ` (${new Date(a.lastChecked).toLocaleDateString(undefined, { day: "numeric", month: "short" })})` : ""}</span>
              </div>
              <span className={`badge ${a.status === "active" ? "ok" : a.status === "notified" ? "warn" : ""}`}>{STATUS[a.status]}</span>
              <div className="actions">
                {a.status === "active" && <button className="btn" disabled={!!busy} onClick={() => void act(a, "check")}>{busy === `${a.id}:check` ? "Checking…" : "Check now"}</button>}
                <button className="btn" disabled={!!busy} onClick={() => void act(a, "test")}>{busy === `${a.id}:test` ? "Sending…" : "Send test email"}</button>
                {a.status === "active" && <button className="btn" disabled={!!busy} onClick={() => void act(a, "stop")}>Stop</button>}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="fine">Checked once a day until the travel date. Prices are AI estimates for this demo.</p>
    </section>
  );
}
