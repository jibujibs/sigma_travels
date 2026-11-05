import { useEffect, useRef, useState } from "react";
import { CONTACT_EMAIL } from "../../shared/contact";

/**
 * Header "Corporates" menu (Customer and AI Trip Planner pages). For now each option only says
 * "coming soon" with Sunny's phone and email; the full corporate / group booking comes later.
 */
const OPTIONS = [
  { id: "corporate", icon: "🏢", title: "Corporate Travel", sub: "Book & manage your business travel" },
  { id: "alumni", icon: "🎓", title: "Alumni Trips", sub: "Group trips for alumni meets and reunions" },
  { id: "events", icon: "🎤", title: "Events & Conventions", sub: "Conferences, conventions and group events" },
] as const;
type Option = (typeof OPTIONS)[number];

export function Corporates() {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<Option | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  // Opens to the right when the button sits near the left edge (Planner header), else to the left.
  const [left, setLeft] = useState(false);
  const toggle = () => {
    const r = box.current?.getBoundingClientRect();
    setLeft(!!r && r.right < 340);
    setOpen((v) => !v); setPick(null);
  };
  const mail = (o: Option) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${o.title} enquiry`)}`;

  return (
    <div className="corp" ref={box}>
      <button className="btn corp-btn" onClick={toggle} aria-expanded={open} aria-haspopup="true">
        🏢 Corporates <span className="corp-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={`corp-menu${left ? " corp-left" : ""}`} role="menu">
          {pick ? (
            <div className="corp-soon">
              <b>{pick.icon} {pick.title}</b>
              <p><span className="badge warn">Coming soon</span></p>
              <p>For group or corporate bookings, talk to Sunny.</p>
              <div className="corp-actions">
                <a className="btn solid" href="tel:+12142213300">📞 214 221 3300</a>
                <a className="btn" href={mail(pick)}>✉ Email</a>
              </div>
              <button className="corp-back" onClick={() => setPick(null)}>← Back</button>
            </div>
          ) : OPTIONS.map((o) => (
            <button key={o.id} role="menuitem" className="corp-item" onClick={() => setPick(o)}>
              <span className="corp-ico" aria-hidden="true">{o.icon}</span>
              <span><b>{o.title}</b><small>{o.sub}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
