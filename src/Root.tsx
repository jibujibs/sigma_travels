import { useCallback, useEffect, useState } from "react";
import App from "./App";
import { LoadingScreen, NotApprovedScreen, NotConfiguredScreen, ProblemScreen, SignInScreen } from "./components/AuthScreens";
import { HomeAirport } from "./components/HomeAirport";
import { api, ApiError, type Profile } from "./lib/api";
import { authConfigured, initAuth, onAuthChange, signOut } from "./lib/auth";
import { getGuestId } from "./lib/guest";

type State =
  | { kind: "loading" }
  | { kind: "signedOut"; error?: string }
  | { kind: "notApproved"; message: string }
  | { kind: "problem"; message: string }
  | { kind: "ready"; user: Profile };

/**
 * Decides what to show before the trip planner: sign-in page, "not approved",
 * the first-time home airport question, or the app itself.
 */
export default function Root() {
  const [state, setState] = useState<State>({ kind: "loading" });

  const loadProfile = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const user = await api.profile.get(getGuestId());
      setState({ kind: "ready", user });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState({ kind: "signedOut" });
      else if (e instanceof ApiError && e.status === 403) setState({ kind: "notApproved", message: e.message });
      else setState({ kind: "problem", message: (e as Error).message });
    }
  }, []);

  useEffect(() => {
    if (!authConfigured) return;
    initAuth()
      .then((s) => (s ? loadProfile() : setState({ kind: "signedOut" })))
      .catch((e) => setState({ kind: "signedOut", error: (e as Error).message }));
    // Signing out anywhere (menu, expired token) returns to the sign-in page.
    return onAuthChange((s) => { if (!s) setState({ kind: "signedOut" }); });
  }, [loadProfile]);

  const out = () => { void signOut(); };

  if (!authConfigured) return <NotConfiguredScreen />;
  switch (state.kind) {
    case "loading": return <LoadingScreen />;
    case "signedOut": return <SignInScreen error={state.error} />;
    case "notApproved": return <NotApprovedScreen message={state.message} onSignOut={out} />;
    case "problem": return <ProblemScreen message={state.message} onRetry={loadProfile} onSignOut={out} />;
  }

  const { user } = state;
  const saveAirport = async (homeAirport: string) => {
    const r = await api.profile.setHomeAirport(homeAirport);
    setState({ kind: "ready", user: { ...user, homeAirport: r.homeAirport } });
  };
  if (!user.homeAirport) return <HomeAirport name={user.name} onSave={saveAirport} />;
  return <App user={user} onSaveHomeAirport={saveAirport} onSignOut={out} />;
}
