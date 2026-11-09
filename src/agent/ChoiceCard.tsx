import { useState } from "react";
import { isInternational, maskPassport, monthsBetween, sabreName, type CustomerChoice } from "../../shared/choose";
import { currencyOf, dayShift, hm, type FlightOption } from "../../shared/flights";
import { money } from "../../shared/currency";

/**
 * Agent tab: the option the customer confirmed on their choose page and the travellers' passport
 * details, ready to book in Sabre. Passport numbers stay hidden until Sunny presses Show.
 */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const d = (iso: string) => (iso ? `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}` : "");
const clock = (s: string) => (/\s(\d{1,2}:\d{2})/.exec(s)?.[1] ?? "").padStart(5, "0");
const line = (o: FlightOption) => {
  const a = o.legs[0], z = o.legs[o.legs.length - 1], plus = dayShift(a.dep, z.arr);
  return `${o.legs.map((l) => l.flightNo).join(" / ")} · ${d(a.dep.slice(0, 10))} ${clock(a.dep)} ${a.from} → ${clock(z.arr)}${plus > 0 ? ` +${plus}` : ""} ${z.to} · ${o.layovers.length ? `${o.layovers.length} stop` : "nonstop"} · ${hm(o.minutes)}`;
};

/** Plain text Sunny can paste next to Sabre while booking. */
export function sabreText(c: CustomerChoice): string {
  const it = c.item;
  return [
    `Option ${c.option}: ${it.out.airline}`,
    `Out: ${line(it.out)}`,
    it.back ? `Return: ${line(it.back)}` : it.query.return ? `Return: ${d(it.query.return)} (choose in Sabre)` : "",
    "",
    ...c.passengers.map((p, i) => [
      `${i + 1}. ${sabreName(p)} · ${p.type.toUpperCase()} · DOB ${p.dob} · ${p.gender}`,
      p.passportNo ? `   Passport ${p.passportNo} · ${p.passportCountry} · expires ${p.passportExpiry} · nationality ${p.nationality}` : `   Nationality ${p.nationality}`,
      [p.ffn && `FF ${p.ffn}`, p.meal && `Meal ${p.meal}`, p.assistance && `Assist: ${p.assistance}`].filter(Boolean).join(" · ") ? `   ${[p.ffn && `FF ${p.ffn}`, p.meal && `Meal ${p.meal}`, p.assistance && `Assist: ${p.assistance}`].filter(Boolean).join(" · ")}` : "",
    ].filter(Boolean).join("\n")),
    "",
    `Contact: ${c.contact.email} · ${c.contact.phone}`,
    c.notes ? `Note: ${c.notes}` : "",
  ].filter((x, i, a) => x !== "" || (a[i - 1] !== "" && i > 0)).join("\n").trim();
}

export function ChoiceCard({ c }: { c: CustomerChoice }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState(false);
  const it = c.item, intl = isInternational(it), last = it.query.return || it.query.depart;

  async function copy() {
    try { await navigator.clipboard.writeText(sabreText(c)); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* clipboard blocked */ }
  }

  return (
    <section className="ci-box" aria-labelledby={`ci-h-${c.confirmedAt}`}>
      <div className="ci-head">
        <h3 id={`ci-h-${c.confirmedAt}`}>✅ Customer chose option {c.option}</h3>
        <span className="fine">Confirmed {new Date(c.confirmedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{c.edits ? ` · changed ${c.edits}×` : ""}</span>
      </div>
      <div className="ci-flight">
        <b>{it.out.airline}</b> <span className="mono">{money(it.price, currencyOf(it))}</span>
        <span className="mono small">{line(it.out)}</span>
        {it.back ? <span className="mono small">Return: {line(it.back)}</span> : it.query.return ? <span className="small">Return {d(it.query.return)}: choose the flight in Sabre</span> : null}
      </div>
      <div className="ci-table-wrap">
        <table className="ci-table">
          <thead><tr><th>Name (for Sabre)</th><th>Type</th><th>Date of birth</th><th>Sex</th><th>Nationality</th>{intl && <><th>Passport</th><th>Expires</th><th>Issued by</th></>}</tr></thead>
          <tbody>
            {c.passengers.map((p, i) => {
              const short = intl && p.passportExpiry && monthsBetween(last, p.passportExpiry) < 6;
              return (
                <tr key={i}>
                  <td className="mono">{sabreName(p)}</td><td>{p.type}</td><td>{d(p.dob)}</td><td>{p.gender}</td><td>{p.nationality}</td>
                  {intl && <><td className="mono">{show ? p.passportNo : maskPassport(p.passportNo)}</td><td className={short ? "ci-warn" : ""}>{d(p.passportExpiry)}{short ? " ⚠" : ""}</td><td>{p.passportCountry}</td></>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {c.passengers.some((p) => p.ffn || p.meal || p.assistance) && (
        <ul className="ci-extras">{c.passengers.map((p, i) => (p.ffn || p.meal || p.assistance) && <li key={i}><b>{p.given}</b>: {[p.ffn && `FF ${p.ffn}`, p.meal, p.assistance].filter(Boolean).join(" · ")}</li>)}</ul>
      )}
      <p className="small">Contact: {c.contact.email} · {c.contact.phone}{c.notes && <><br />Note: {c.notes}</>}</p>
      <div className="ci-actions">
        {intl && <button className="btn" onClick={() => setShow((s) => !s)}>{show ? "Hide passport numbers" : "Show passport numbers"}</button>}
        <button className="btn solid" onClick={() => void copy()}>{copied ? "Copied ✓" : "Copy for Sabre"}</button>
      </div>
      <p className="fine">Book this in Sabre (hold, don't pay), then put the PNR in Sabre payments to send the payment link.</p>
    </section>
  );
}
