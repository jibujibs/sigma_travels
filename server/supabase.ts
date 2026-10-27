import type { AuthUser } from "./auth.js";
import { HttpError } from "./http.js";

/**
 * Minimal Supabase client using its REST API (PostgREST) directly, so the app
 * needs no extra package. Server only: it uses the secret service-role key,
 * which bypasses Row Level Security and must never reach the browser.
 *
 * Tables used (created by the original Sigma Travels migrations):
 *   users          guest_id or auth_user_id → id, plus email and home_airport
 *   allowed_emails who may sign in (the guest list)
 *   itineraries    saved trips (criteria = brief, segments = plan + choices)
 *   chat_messages  Sigma Copilot history
 */

export interface SupabaseConfig { url: string; key: string }

export function supabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
  return url && key ? { url, key } : null;
}

export const isSupabaseConfigured = () => supabaseConfig() !== null;

export class DatabaseError extends HttpError {
  constructor(action: string, detail: string) {
    super(503, `Database error while ${action}. ${detail}`.trim());
  }
}

function headers(cfg: SupabaseConfig, prefer?: string): Record<string, string> {
  const h: Record<string, string> = { apikey: cfg.key, "content-type": "application/json", accept: "application/json" };
  // Legacy service_role keys are JWTs and go in Authorization too; new sb_secret_ keys go in apikey only.
  if (!cfg.key.startsWith("sb_")) h.authorization = `Bearer ${cfg.key}`;
  if (prefer) h.prefer = prefer;
  return h;
}

async function rest<T>(action: string, path: string, init: { method?: string; body?: unknown; prefer?: string } = {}): Promise<T> {
  const cfg = supabaseConfig();
  if (!cfg) throw new HttpError(503, "Saving needs Supabase. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local or Vercel.");
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/rest/v1/${path}`, {
      method: init.method ?? "GET",
      headers: headers(cfg, init.prefer),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new DatabaseError(action, "Couldn't reach Supabase (is the project paused?).");
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = text.slice(0, 200);
    try { msg = (JSON.parse(text) as { message?: string }).message ?? msg; } catch { /* not JSON */ }
    console.error(`[supabase] ${action}: ${res.status} ${msg}`);
    throw new DatabaseError(action, `(${res.status}) ${msg}`);
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

const enc = encodeURIComponent;

/* ---------- users ---------- */

/* ---------- signed-in users (Google via Supabase Auth) ---------- */

/** Is this email on the allowed_emails list? Emails are stored in lower case. */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const rows = await rest<{ email: string }[]>("checking the allowed list", `allowed_emails?select=email&email=eq.${enc(email.toLowerCase())}&limit=1`);
  return rows.length > 0;
}

export interface UserRow { id: string; home_airport: string | null }

const userIds = new Map<string, UserRow>();

/**
 * Finds the users row for a signed-in Google account, or creates it.
 * On the very first sign-in, the row this browser used as a guest (if any) is
 * linked to the account instead, so trips and chats saved before keep showing.
 */
export async function ensureAuthUser(user: AuthUser, guestId?: string): Promise<UserRow> {
  const cached = userIds.get(user.id);
  if (cached) return cached;
  const action = "finding your account";
  const pick = "select=id,home_airport";
  let rows = await rest<UserRow[]>(action, `users?${pick}&auth_user_id=eq.${enc(user.id)}&limit=1`);
  if (!rows.length && guestId) {
    rows = await rest<UserRow[]>(action, `users?${pick}&guest_id=eq.${enc(guestId)}&auth_user_id=is.null`, {
      method: "PATCH",
      body: { auth_user_id: user.id, email: user.email },
      prefer: "return=representation",
    });
  }
  if (!rows.length) {
    rows = await rest<UserRow[]>(action, `users?on_conflict=auth_user_id&${pick}`, {
      method: "POST",
      body: [{ auth_user_id: user.id, email: user.email }],
      prefer: "resolution=merge-duplicates,return=representation",
    });
  }
  const row = rows[0];
  if (!row?.id) throw new DatabaseError(action, "No row returned.");
  if (userIds.size > 500) userIds.clear();
  userIds.set(user.id, row);
  return row;
}

export async function setHomeAirport(user: AuthUser, homeAirport: string): Promise<UserRow> {
  const row = await ensureAuthUser(user);
  const rows = await rest<UserRow[]>("saving your home airport", `users?id=eq.${enc(row.id)}&select=id,home_airport`, {
    method: "PATCH",
    body: { home_airport: homeAirport },
    prefer: "return=representation",
  });
  const updated = rows[0] ?? { ...row, home_airport: homeAirport };
  userIds.set(user.id, updated);
  return updated;
}

/* ---------- payment links (booking & payment flow) ---------- */

export interface PaymentLinkRow {
  id: string;
  token: string;
  pnr: string;
  rail: "stripe" | "sabre";
  status: "sent" | "paid" | "expired";
  amount: number;
  currency: string;
  customer_email: string;
  agent_email: string;
  stripe_session_id: string | null;
  reference: string | null;
  paid_at: string | null;
  expires_at: string;
  created_at: string;
  // Sabre step (columns added later; absent until the SQL in README is run)
  sabre_status?: "recorded" | "failed" | null;
  sabre_remark?: string | null;
  sabre_recorded_at?: string | null;
  sabre_error?: string | null;
  ticket_numbers?: { passenger: string; number: string }[] | null;
  ticketed_at?: string | null;
}

// "*" so the app keeps working before the Sabre columns are added.
const LINK_COLS = "*";

export async function latestPaymentLink(pnr: string): Promise<PaymentLinkRow | null> {
  const rows = await rest<PaymentLinkRow[]>("loading the payment link", `payment_links?select=${LINK_COLS}&pnr=eq.${enc(pnr)}&order=created_at.desc&limit=1`);
  return rows[0] ?? null;
}

export async function paymentLinkByToken(token: string): Promise<PaymentLinkRow | null> {
  const rows = await rest<PaymentLinkRow[]>("loading the payment link", `payment_links?select=${LINK_COLS}&token=eq.${enc(token)}&limit=1`);
  return rows[0] ?? null;
}

/** Creates a new link; any earlier unpaid link for the same PNR stops working, so a booking can't be paid twice. */
export async function createPaymentLink(row: Omit<PaymentLinkRow, "id" | "status" | "stripe_session_id" | "reference" | "paid_at" | "created_at">): Promise<PaymentLinkRow> {
  await rest<void>("closing the old link", `payment_links?pnr=eq.${enc(row.pnr)}&status=eq.sent`, { method: "PATCH", body: { status: "expired" }, prefer: "return=minimal" });
  const rows = await rest<PaymentLinkRow[]>("creating the payment link", `payment_links?select=${LINK_COLS}`, { method: "POST", body: [row], prefer: "return=representation" });
  return rows[0];
}

export async function updatePaymentLink(token: string, patch: Partial<PaymentLinkRow>, onlyIfStatus?: PaymentLinkRow["status"]): Promise<PaymentLinkRow | null> {
  const filter = `token=eq.${enc(token)}${onlyIfStatus ? `&status=eq.${onlyIfStatus}` : ""}`;
  const rows = await rest<PaymentLinkRow[]>("updating the payment link", `payment_links?${filter}&select=${LINK_COLS}`, { method: "PATCH", body: patch, prefer: "return=representation" });
  return rows[0] ?? null;
}

/* ---------- trips (itineraries table) ---------- */

export interface TripRow {
  id: string;
  created_at: string;
  total: number;
  currency: string;
  criteria: unknown;
  segments?: unknown;
  destination?: unknown;
}

export async function saveTrip(userId: string, criteria: unknown, segments: unknown, total: number): Promise<{ id: string; created_at: string }> {
  const rows = await rest<{ id: string; created_at: string }[]>("saving the trip", "itineraries?select=id,created_at", {
    method: "POST",
    body: [{ user_id: userId, criteria, segments, total: Math.max(0, Math.round(total)), currency: "INR" }],
    prefer: "return=representation",
  });
  return rows[0];
}

export function listTrips(userId: string, limit = 20): Promise<TripRow[]> {
  return rest<TripRow[]>(
    "loading your trips",
    `itineraries?select=id,created_at,total,currency,criteria,destination:segments->plan->destination&user_id=eq.${enc(userId)}&order=created_at.desc&limit=${limit}`,
  );
}

export async function getTrip(userId: string, id: string): Promise<TripRow | null> {
  const rows = await rest<TripRow[]>("opening the trip", `itineraries?select=id,created_at,total,currency,criteria,segments&id=eq.${enc(id)}&user_id=eq.${enc(userId)}&limit=1`);
  return rows[0] ?? null;
}

export async function deleteTrip(userId: string, id: string): Promise<void> {
  await rest<void>("deleting the trip", `itineraries?id=eq.${enc(id)}&user_id=eq.${enc(userId)}`, { method: "DELETE" });
}

/* ---------- chat_messages ---------- */

export interface ChatRow { id: string; role: "user" | "assistant"; content: string; created_at: string }

export async function addChatMessages(userId: string, threadId: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<void> {
  if (!messages.length) return;
  await rest<void>("saving the chat", "chat_messages", {
    method: "POST",
    body: messages.map((m) => ({ user_id: userId, thread_id: threadId, role: m.role, content: m.content })),
    prefer: "return=minimal",
  });
}

export function getChatHistory(userId: string, threadId: string, limit = 60): Promise<ChatRow[]> {
  return rest<ChatRow[]>(
    "loading the chat",
    `chat_messages?select=id,role,content,created_at&user_id=eq.${enc(userId)}&thread_id=eq.${enc(threadId)}&role=in.(user,assistant)&order=created_at.asc&limit=${limit}`,
  );
}

/* ---------- voice requests (customer voice messages for Sunny) ---------- */

export const VOICE_BUCKET = "voice-messages";

export interface VoiceRow {
  id: string;
  created_at: string;
  name: string;
  phone: string | null;
  email: string | null;
  audio_path: string;
  audio_mime: string;
  seconds: number;
  language: string | null;
  transcript: string | null;
  transcript_en: string | null;
  status: "new" | "contacted" | "ticketed" | "closed";
  error: string | null;
  submitted_by: string | null;
}

export async function insertVoice(row: Pick<VoiceRow, "name" | "phone" | "email" | "audio_path" | "audio_mime" | "seconds" | "submitted_by">): Promise<VoiceRow> {
  const rows = await rest<VoiceRow[]>("saving the voice message", "voice_requests?select=*", { method: "POST", body: [row], prefer: "return=representation" });
  return rows[0];
}

export async function updateVoice(id: string, patch: Partial<VoiceRow>): Promise<VoiceRow | null> {
  const rows = await rest<VoiceRow[]>("updating the voice message", `voice_requests?id=eq.${enc(id)}&select=*`, { method: "PATCH", body: patch, prefer: "return=representation" });
  return rows[0] ?? null;
}

export function listVoice(limit = 50): Promise<VoiceRow[]> {
  return rest<VoiceRow[]>("loading voice messages", `voice_requests?select=*&order=created_at.desc&limit=${limit}`);
}

/** Uploads a recording to the private storage bucket (server key only; browsers can't read the bucket). */
export async function uploadAudio(path: string, bytes: Buffer, mime: string): Promise<void> {
  const cfg = supabaseConfig();
  if (!cfg) throw new HttpError(503, "Voice messages need Supabase. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/storage/v1/object/${VOICE_BUCKET}/${path}`, {
      method: "POST",
      headers: { ...headers(cfg), "content-type": mime, "x-upsert": "false" },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new DatabaseError("saving the recording", "Couldn't reach Supabase Storage.");
  }
  if (!res.ok) {
    const text = (await res.text().catch(() => "")).slice(0, 200);
    console.error(`[supabase] upload ${path}: ${res.status} ${text}`);
    throw new DatabaseError("saving the recording", /bucket/i.test(text) ? `The "${VOICE_BUCKET}" storage bucket is missing (see README).` : `(${res.status}) ${text}`);
  }
}

/** A short-lived link Sunny's browser can play. Null if signing fails (the inbox still shows the text). */
export async function signedAudioUrl(path: string, seconds = 3600): Promise<string | null> {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  try {
    const res = await fetch(`${cfg.url}/storage/v1/object/sign/${VOICE_BUCKET}/${path}`, {
      method: "POST",
      headers: headers(cfg),
      body: JSON.stringify({ expiresIn: seconds }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const { signedURL } = (await res.json()) as { signedURL?: string };
    return signedURL ? `${cfg.url}/storage/v1${signedURL.startsWith("/") ? "" : "/"}${signedURL}` : null;
  } catch {
    return null;
  }
}

/* ---------- health ---------- */

/** Checks each table the app uses is reachable with the server key. Never returns the key. */
export async function checkTables(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of ["users", "itineraries", "chat_messages", "allowed_emails", "payment_links", "voice_requests"]) {
    try {
      await rest<unknown>(`checking ${t}`, `${t}?select=${t === "allowed_emails" ? "email" : "id"}&limit=1`);
      out[t] = "ok";
    } catch (e) {
      out[t] = (e as Error).message.replace(/^Database error while checking \w+\. /, "");
    }
  }
  return out;
}
