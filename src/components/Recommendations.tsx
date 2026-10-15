import type { Recommendation } from "../../shared/types";
import { inr } from "../lib/format";

interface Props {
  recs: Recommendation[];
  pax: number;
  busy: boolean;
  onPlan: (r: Recommendation) => void;
}

export function Recommendations({ recs, pax, busy, onPlan }: Props) {
  return (
    <section aria-labelledby="h-recs">
      <div className="sec-head"><h2 id="h-recs">Recommended for you</h2><p>Pick one to build the full plan</p></div>
      <div className="recs">
        {recs.map((r, i) => (
          <article key={r.city + i} className={"rec" + (i === 0 ? " first" : "")}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
              <div className="code">{r.airport}</div>
              {i === 0 && <span className="badge">Top match</span>}
            </div>
            <h3>{r.city}{r.country ? `, ${r.country}` : ""}</h3>
            {r.tagline && <div className="tl">{r.tagline}</div>}
            {r.why && <p style={{ margin: 0 }}>{r.why}</p>}
            {r.highlights.length > 0 && <ul>{r.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
            <div className="facts">
              {r.flight_time && <div><span>Flight</span><span>{r.flight_time}</span></div>}
              {r.weather && <div><span>Weather</span><span>{r.weather}</span></div>}
              {r.visa && <div><span>Visa</span><span>{r.visa}</span></div>}
              {r.est_total_inr > 0 && <div><span>Est. total</span><span className="est">{inr(r.est_total_inr)} for {pax}</span></div>}
            </div>
            <button className="btn solid" disabled={busy} onClick={() => onPlan(r)}>Plan this trip</button>
          </article>
        ))}
      </div>
    </section>
  );
}
