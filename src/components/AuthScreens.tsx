import { useState, type ReactNode } from "react";
import { signInWithGoogle } from "../lib/auth";

/** Full-page card used by every screen shown before the app itself. */
function Gate({ children }: { children: ReactNode }) {
  return (
    <main className="gate">
      <div className="gate-card">
        <div className="brand"><span className="logo">Σ</span>Sigma Travels · Trip Planner</div>
        {children}
      </div>
    </main>
  );
}

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

export function SignInScreen({ error }: { error?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(error);
  async function go() {
    setBusy(true);
    setErr(undefined);
    try {
      await signInWithGoogle(); // leaves the page
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <Gate>
      <h1>Sign in to plan your trip</h1>
      <p className="hint">Sigma Travels is open to approved accounts only. Sign in with your Google account to continue.</p>
      <button className="btn google" onClick={go} disabled={busy}>
        <GoogleMark /> {busy ? "Opening Google…" : "Sign in with Google"}
      </button>
      {err && <p className="err-text" role="alert">{err}</p>}
      <p className="fine">We only see your name, email and profile photo. Your Google password stays with Google.</p>
    </Gate>
  );
}

export function NotApprovedScreen({ message, onSignOut }: { message: string; onSignOut: () => void }) {
  return (
    <Gate>
      <h1>Access not approved yet</h1>
      <p className="hint">{message}</p>
      <button className="btn" onClick={onSignOut}>Sign out and use another account</button>
    </Gate>
  );
}

export function LoadingScreen({ label = "Checking your sign-in…" }: { label?: string }) {
  return (
    <Gate>
      <p className="hint" role="status">{label}</p>
    </Gate>
  );
}

export function ProblemScreen({ message, onRetry, onSignOut }: { message: string; onRetry: () => void; onSignOut: () => void }) {
  return (
    <Gate>
      <h1>Something went wrong</h1>
      <p className="err-text" role="alert">{message}</p>
      <div className="gate-actions">
        <button className="btn solid" onClick={onRetry}>Try again</button>
        <button className="btn" onClick={onSignOut}>Sign out</button>
      </div>
    </Gate>
  );
}

export function NotConfiguredScreen() {
  return (
    <Gate>
      <h1>Sign-in isn't set up</h1>
      <p className="hint">
        Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code> (local) or to the
        Vercel environment variables, then restart <code>npm run dev</code> or redeploy.
      </p>
    </Gate>
  );
}
