import { useEffect, useState, type ReactNode } from "react";
import App from "./App";
import { PnrDesk } from "./agent/PnrDesk";
import { ManageBooking } from "./customer/ManageBooking";
import { AccountMenu } from "./components/AccountMenu";
import { Brand } from "./components/Brand";
import { ContactFooter } from "./components/ContactFooter";
import { HomeAirport } from "./components/HomeAirport";
import type { Profile } from "./lib/api";

type View = "agent" | "customer" | "planner";
const PATHS: Record<View, string> = { agent: "/", customer: "/customer", planner: "/planner" };
const viewOf = (path: string): View => (path.startsWith("/planner") ? "planner" : path.startsWith("/customer") ? "customer" : "agent");

const icon = (d: ReactNode) => (
  <svg className="tab-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS: Record<View, ReactNode> = {
  agent: icon(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></>),
  customer: icon(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></>),
  planner: icon(<><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>),
};
const LABELS: Record<View, string> = { agent: "AGENT", customer: "CUSTOMER", planner: "AI Trip Planner" };
const SECTIONS: Record<View, string> = { agent: "Agent Desk", customer: "Customer", planner: "AI Trip Planner" };

interface Props {
  user: Profile;
  onSaveHomeAirport: (airport: string) => Promise<void>;
  onSignOut: () => void;
}

/** Signed-in area: three tabs — the agent's booking & payment desk (first page), the customer's
 * "Manage my booking", and the AI trip planner. */
export function Workspace({ user, onSaveHomeAirport, onSignOut }: Props) {
  const [view, setView] = useState<View>(() => viewOf(window.location.pathname));
  const [editAirport, setEditAirport] = useState(false);

  useEffect(() => {
    const back = () => setView(viewOf(window.location.pathname));
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, []);

  const go = (v: View) => {
    if (v === view) return;
    window.history.pushState(null, "", PATHS[v]);
    setView(v);
    window.scrollTo({ top: 0 });
  };

  const nav = (
    <nav className="tabs" aria-label="Sections">
      {(Object.keys(PATHS) as View[]).map((v) => (
        <a key={v} href={PATHS[v]} className={v === "planner" ? "" : "caps"} aria-current={view === v ? "page" : undefined}
          onClick={(e) => { e.preventDefault(); go(v); }}>
          {ICONS[v]}<span>{LABELS[v]}</span>
        </a>
      ))}
    </nav>
  );

  if (view === "planner") {
    return (
      <>
        <App user={user} onSaveHomeAirport={onSaveHomeAirport} onSignOut={onSignOut} nav={nav} brand={<Brand section={SECTIONS.planner} />} />
        <div className="wrap foot-wrap"><ContactFooter /></div>
      </>
    );
  }

  return (
    <div className="wrap">
      <div className="top">
        <Brand section={SECTIONS[view]} />
        {nav}
        <div className="top-actions">
          <AccountMenu user={user} onChangeAirport={() => setEditAirport(true)} onSignOut={onSignOut} />
        </div>
      </div>
      {editAirport && (
        <HomeAirport name={user.name} initial={user.homeAirport} onCancel={() => setEditAirport(false)}
          onSave={async (a) => { await onSaveHomeAirport(a); setEditAirport(false); }} />
      )}
      {view === "agent" ? <PnrDesk agentName={user.name} /> : <ManageBooking />}
      <ContactFooter />
    </div>
  );
}
