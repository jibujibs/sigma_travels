import { HttpError } from "./http.js";
import { isEmailAllowed, supabaseConfig } from "./supabase.js";

/**
 * The "guard at the door" for every API route that costs money or touches saved data.
 *
 * The browser signs in with Google through Supabase Auth and sends the access token
 * (a short-lived JWT) as "Authorization: Bearer …". Here we ask Supabase Auth who the
 * token belongs to, then check that the email is on the allowed_emails list.
 * Requests without a valid, approved token never reach Gemini or the database.
 */

export interface AuthUser {
  /** Supabase Auth user id (auth.users.id). */
  id: string;
  email: string;
  name: string;
  avatar: string;
}

// Cache answers briefly so a burst of requests (search → intent → plan) checks Supabase once.
// Kept in memory per server instance; tokens expire after an hour anyway.
const CACHE_MS = 60_000;
const verified = new Map<string, { user: AuthUser; at: number }>();
const allowed = new Map<string, { ok: boolean; at: number }>();

function remember<V extends { at: number }>(map: Map<string, V>, key: string, value: V): void {
  if (map.size > 500) map.clear();
  map.set(key, value);
}

function bearer(request: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  return m ? m[1] : null;
}

interface SupabaseUser {
  id?: string;
  email?: string;
  user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string };
}

async function lookUp(token: string): Promise<AuthUser> {
  const cfg = supabaseConfig();
  if (!cfg) throw new HttpError(503, "Sign-in needs Supabase. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.");
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/auth/v1/user`, {
      headers: { apikey: cfg.key, authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(503, "Couldn't reach Supabase to check your sign-in. Try again.");
  }
  if (res.status === 401 || res.status === 403) throw new HttpError(401, "Your sign-in has expired. Please sign in again.");
  if (!res.ok) throw new HttpError(503, `Couldn't check your sign-in (${res.status}). Try again.`);
  const u = (await res.json()) as SupabaseUser;
  const email = (u.email ?? "").trim().toLowerCase();
  if (!u.id || !email) throw new HttpError(403, "This Google account has no email address, so it can't be approved.");
  const meta = u.user_metadata ?? {};
  return { id: u.id, email, name: meta.full_name || meta.name || email.split("@")[0], avatar: meta.avatar_url || meta.picture || "" };
}

/** Returns the signed-in, approved user, or throws 401 (not signed in) / 403 (not approved). */
export async function requireUser(request: Request): Promise<AuthUser> {
  const token = bearer(request);
  if (!token) throw new HttpError(401, "Please sign in with Google to use Sigma Travels.");

  const now = Date.now();
  let user = verified.get(token);
  if (!user || now - user.at > CACHE_MS) {
    user = { user: await lookUp(token), at: now };
    remember(verified, token, user);
  }

  const email = user.user.email;
  let ok = allowed.get(email);
  if (!ok || now - ok.at > CACHE_MS) {
    ok = { ok: await isEmailAllowed(email), at: now };
    remember(allowed, email, ok);
  }
  if (!ok.ok) throw new HttpError(403, `${email} isn't approved for Sigma Travels yet. Ask the team to add it.`);
  return user.user;
}
