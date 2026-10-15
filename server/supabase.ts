import { HttpError } from "./http.js";

/**
 * Minimal Supabase client using its REST API (PostgREST) directly, so the app
 * needs no extra package. Server only: it uses the secret service-role key,
 * which bypasses Row Level Security and must never reach the browser.
 *
 * Tables used (created by the original Sigma Travels migrations):
 *   users          guest_id → id
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

/** Finds the guest by their browser guestId, or creates them. Returns users.id. */
export async function ensureUser(guestId: string): Promise<string> {
  const rows = await rest<{ id: string }[]>("finding or creating the guest", "users?on_conflict=guest_id&select=id", {
    method: "POST",
    body: [{ guest_id: guestId }],
    prefer: "resolution=merge-duplicates,return=representation",
  });
  if (!rows?.[0]?.id) throw new DatabaseError("finding or creating the guest", "No row returned.");
  return rows[0].id;
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

/* ---------- health ---------- */

/** Checks each table the app uses is reachable with the server key. Never returns the key. */
export async function checkTables(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of ["users", "itineraries", "chat_messages"]) {
    try {
      await rest<unknown>(`checking ${t}`, `${t}?select=id&limit=1`);
      out[t] = "ok";
    } catch (e) {
      out[t] = (e as Error).message.replace(/^Database error while checking \w+\. /, "");
    }
  }
  return out;
}
