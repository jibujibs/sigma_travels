import { useEffect, useState } from "react";
import App from "./App";
import { PnrDesk } from "./agent/PnrDesk";
import { AccountMenu } from "./components/AccountMenu";
import { HomeAirport } from "./components/HomeAirport";
import type { Profile } from "./lib/api";

type View = "desk" | "planner";
const viewOf = (path: string): View => (path.startsWith("/planner") ? "planner" : "desk");

interface Props {
  user: Profile;
  onSaveHomeAirport: (airport: string) => Promise<void>;
  onSignOut: () => void;
}

/** Signed-in area: the booking & payment desk (first page) and the AI trip planner, one tab each. */
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
    window.history.pushState(null, "", v === "planner" ? "/planner" : "/");
    setView(v);
    window.scrollTo({ top: 0 });
  };

  const nav = (
    <nav className="tabs" aria-label="Sections">
      <a href="/" aria-current={view === "desk" ? "page" : undefined} onClick={(e) => { e.preventDefault(); go("desk"); }}>Booking &amp; payment</a>
      <a href="/planner" aria-current={view === "planner" ? "page" : undefined} onClick={(e) => { e.preventDefault(); go("planner"); }}>AI trip planner</a>
    </nav>
  );

  if (view === "planner") return <App user={user} onSaveHomeAirport={onSaveHomeAirport} onSignOut={onSignOut} nav={nav} />;

  return (
    <div className="wrap">
      <div className="top">
        <div className="brand"><span className="logo">Σ</span>Sigma Travels · Agent Desk</div>
        {nav}
        <div className="top-actions">
          <AccountMenu user={user} onChangeAirport={() => setEditAirport(true)} onSignOut={onSignOut} />
        </div>
      </div>
      {editAirport && (
        <HomeAirport name={user.name} initial={user.homeAirport} onCancel={() => setEditAirport(false)}
          onSave={async (a) => { await onSaveHomeAirport(a); setEditAirport(false); }} />
      )}
      <PnrDesk agentName={user.name} />
    </div>
  );
}
