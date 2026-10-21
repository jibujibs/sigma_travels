/**
 * Google sign-in through Supabase Auth, using its REST API directly (no extra package),
 * the same way the server talks to Gemini and the Supabase database.
 *
 * Flow (OAuth with PKCE):
 *  1. signInWithGoogle() makes a random secret (the "verifier"), keeps it in this tab and
 *     sends the browser to Supabase → Google. Only a hash of the secret travels.
 *  2. Google sends the traveller back here with ?code=…
 *  3. initAuth() swaps the code + secret for a session: an access token (about 1 hour)
 *     and a refresh token, both kept in this browser.
 *  4. getAccessToken() hands the token to every API call and quietly refreshes it.
 *
 * Only the public (publishable) key is used here. The secret service-role key never
 * reaches the browser.
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim().replace(/\/+$/, "") ?? "";
const PUBLISHABLE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)?.trim() ?? "";

export const authConfigured = Boolean(SUPABASE_URL && PUBLISHABLE_KEY);

export interface Session {
  access_token: string;
  refresh_token: string;
  /** Unix seconds. */
  expires_at: number;
  user: { id: string; email?: string };
}

export class AuthError extends Error {}

const SESSION_KEY = "sigma-auth-session";
const VERIFIER_KEY = "sigma-auth-verifier";

let session: Session | null = null;
const listeners = new Set<(s: Session | null) => void>();

export function onAuthChange(fn: (s: Session | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setSession(s: Session | null): void {
  session = s;
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* storage blocked: signed in for this visit only */ }
  listeners.forEach((fn) => fn(s));
}

function readStored(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null") as Session | null;
    return s?.access_token && s.refresh_token ? s : null;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function authFetch(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<Response> {
  return fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: init.method ?? "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      "content-type": "application/json",
      ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

interface TokenReply { access_token?: string; refresh_token?: string; expires_in?: number; expires_at?: number; user?: Session["user"]; error_description?: string; msg?: string }

function toSession(r: TokenReply): Session {
  if (!r.access_token || !r.refresh_token || !r.user) throw new AuthError(r.error_description || r.msg || "Sign-in failed. Try again.");
  const expires_at = r.expires_at ?? Math.floor(Date.now() / 1000) + (r.expires_in ?? 3600);
  return { access_token: r.access_token, refresh_token: r.refresh_token, expires_at, user: { id: r.user.id, email: r.user.email } };
}

/** Sends the browser to Google (through Supabase). The page comes back to this site afterwards. */
export async function signInWithGoogle(): Promise<void> {
  if (!authConfigured) throw new AuthError("Sign-in isn't set up. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  try { sessionStorage.setItem(VERIFIER_KEY, verifier); } catch { localStorage.setItem(VERIFIER_KEY, verifier); }
  const q = new URLSearchParams({
    provider: "google",
    redirect_to: `${window.location.origin}/`,
    code_challenge: challenge,
    code_challenge_method: "s256",
  });
  window.location.assign(`${SUPABASE_URL}/auth/v1/authorize?${q}`);
}

function takeVerifier(): string | null {
  let v: string | null = null;
  try { v = sessionStorage.getItem(VERIFIER_KEY); sessionStorage.removeItem(VERIFIER_KEY); } catch { /* ignore */ }
  if (!v) try { v = localStorage.getItem(VERIFIER_KEY); localStorage.removeItem(VERIFIER_KEY); } catch { /* ignore */ }
  return v;
}

let refreshing: Promise<Session | null> | null = null;

async function refresh(current: Session): Promise<Session | null> {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await authFetch("token?grant_type=refresh_token", { body: { refresh_token: current.refresh_token } });
        if (res.status >= 400 && res.status < 500) { setSession(null); return null; } // revoked or expired: sign in again
        if (!res.ok) return current; // Supabase hiccup: keep the old token for now
        const next = toSession((await res.json()) as TokenReply);
        setSession(next);
        return next;
      } catch {
        return current; // offline: try again on the next call
      } finally {
        refreshing = null;
      }
    })();
  }
  return refreshing;
}

/**
 * Call once when the app starts. Finishes a sign-in that just came back from Google,
 * or restores the session kept in this browser. Returns null when signed out.
 */
let starting: Promise<Session | null> | null = null;
export function initAuth(): Promise<Session | null> {
  // React's StrictMode runs start-up effects twice in development; do the work once.
  starting ??= start();
  return starting;
}

async function start(): Promise<Session | null> {
  if (!authConfigured) return null;
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.hash.replace(/^#/, ""));
  url.searchParams.forEach((v, k) => params.set(k, v));
  const clean = () => {
    ["code", "error", "error_code", "error_description", "state"].forEach((k) => url.searchParams.delete(k));
    url.hash = "";
    window.history.replaceState(null, "", url.pathname + url.search);
  };

  if (params.get("error")) {
    clean();
    throw new AuthError(params.get("error_description")?.replace(/\+/g, " ") || "Google sign-in was cancelled or failed.");
  }
  const code = params.get("code");
  if (code) {
    clean();
    const verifier = takeVerifier();
    if (!verifier) throw new AuthError("Sign-in was started in another tab. Please sign in again.");
    const res = await authFetch("token?grant_type=pkce", { body: { auth_code: code, code_verifier: verifier } });
    const s = toSession((await res.json().catch(() => ({}))) as TokenReply);
    setSession(s);
    return s;
  }

  const stored = readStored();
  if (!stored) return null;
  session = stored;
  return stored.expires_at - 60 < Date.now() / 1000 ? refresh(stored) : stored;
}

/** The current access token, refreshed when it is about to expire. Null when signed out. */
export async function getAccessToken(): Promise<string | null> {
  if (!session) return null;
  if (session.expires_at - 60 < Date.now() / 1000) return (await refresh(session))?.access_token ?? null;
  return session.access_token;
}

/** Signs out in this browser (and tells Supabase to end the session). */
export async function signOut(): Promise<void> {
  const token = session?.access_token;
  setSession(null);
  if (token) await authFetch("logout", { token }).catch(() => undefined);
}

/** Forget the session locally without calling Supabase (used when the server says it is no longer valid). */
export function dropSession(): void {
  setSession(null);
}
