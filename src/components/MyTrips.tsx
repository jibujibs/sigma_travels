import type { TripSummary } from "../lib/api";
import { addDays, fmtDate, inr, parseISO } from "../lib/format";

interface Props {
  trips: TripSummary[];
  busyId: string | null;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function MyTrips({ trips, busyId, onOpen, onDelete, onClose }: Props) {
  return (
    <section className="mytrips" aria-labelledby="h-mytrips">
      <div className="sec-head">
        <h2 id="h-mytrips">My trips</h2>
        <button className="btn" onClick={onClose}>Close</button>
      </div>
      {trips.length === 0 ? (
        <p className="fine" style={{ fontSize: 15 }}>No saved trips yet. Build a plan and press <b>Save trip</b> in the quote.</p>
      ) : (
        <div className="trip-list">
          {trips.map((t) => {
            const start = parseISO(t.criteria.start);
            const d = t.destination ?? {};
            return (
              <article key={t.id} className="trip-row">
                <div className="code">{d.airport || "✈"}</div>
                <div className="trip-info">
                  <strong>{d.city || "Trip"}{d.country ? `, ${d.country}` : ""}</strong>
                  <span className="fine">
                    {fmtDate(start)} – {fmtDate(addDays(start, t.criteria.days - 1))} · {t.criteria.pax} adult{t.criteria.pax > 1 ? "s" : ""} · from {t.criteria.origin}
                  </span>
                </div>
                <div className="trip-total mono">{inr(t.total)}</div>
                <div className="actions">
                  <button className="btn solid" disabled={busyId === t.id} onClick={() => onOpen(t.id)}>Open</button>
                  <button className="btn" disabled={busyId === t.id} onClick={() => onDelete(t.id)}>Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
