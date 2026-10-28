import { waitUntil } from "@vercel/functions";
import { requireUser } from "../server/auth.js";
import { sendEmail } from "../server/email.js";
import { voiceEmail } from "../server/voiceEmail.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { originOf } from "../server/payments.js";
import { downloadAudio, insertVoice, isMissingColumn, listVoice, signedAudioUrl, updateVoice, uploadAudio, voiceById, type VoiceRow } from "../server/supabase.js";
import { flightsConfigured, returnFlights, searchFlights } from "../server/flights.js";
import { readTrip, transcribe } from "../server/voice.js";
import { autoSearchBlockers, queryFromTrip, type FlightQuery, type ShortlistItem, type VoiceFlights } from "../shared/flights.js";
import { normalizeTrip, withDateCheck, voicePatchSchema, voiceSubmitSchema, type VoiceRequest, type VoiceTrip } from "../shared/voice.js";

/**
 * Voice messages for Sunny.
 *   POST  /api/voice  { name, phone, email, audio, mime, seconds }  customer leaves a message (Customer tab)
 *   GET   /api/voice                                               Sunny's inbox (Agent tab)
 *   PATCH /api/voice  { id, status }                               Sunny updates the status
 *   PATCH /api/voice  { id, action: "save-trip", trip }            Sunny corrects the trip details
 *   PATCH /api/voice  { id, action: "read-trip" }                  Gemini reads the trip from the text again
 *   PATCH /api/voice  { id, action: "retry" }                      voice → text again from the saved recording
 *   PATCH /api/voice  { id, action: "flights-search", query }       real flights (Google Flights via SerpApi)
 *   PATCH /api/voice  { id, action: "flights-return", query, token } return flights for one outbound flight
 *   PATCH /api/voice  { id, action: "flights-save", shortlist }      Sunny's chosen options
 * The customer is told "sent" as soon as the recording is saved; voice → text → trip → email then runs
 * in the background (waitUntil), and the Agent tab shows "Turning the voice into text…" meanwhile.
 * Sign-in is required for now, like the rest of the site (demo); the Customer tab can be opened up later.
 * (api/diag.ts was folded into a rewrite to make room for this file: the Vercel Hobby plan allows 12 functions.)
 */

const extOf = (mime: string) => (/webm/.test(mime) ? "webm" : /ogg/.test(mime) ? "ogg" : /mp4|m4a|aac/.test(mime) ? "m4a" : /mpeg|mp3/.test(mime) ? "mp3" : /wav/.test(mime) ? "wav" : "audio");

const FLIGHTS_SQL = "Run this in the Supabase SQL Editor: alter table public.voice_requests add column if not exists flights jsonb;";
const today = () => new Date().toISOString().slice(0, 10);

/** Stored flights, or null (rows from before phase C, or before the flights column exists). */
const flightsOf = (r: VoiceRow): VoiceFlights | null => {
  const f = r.flights as VoiceFlights | null | undefined;
  return f && typeof f === "object" ? { search: f.search ?? null, shortlist: Array.isArray(f.shortlist) ? f.shortlist : [], ...(f.note ? { note: f.note } : {}) } : null;
};

/** Saves the flights; null when the flights column hasn't been added yet. */
async function saveFlights(id: string, flights: VoiceFlights): Promise<VoiceRow | null> {
  try {
    return await updateVoice(id, { flights });
  } catch (e) {
    if (!isMissingColumn(e, "flights")) throw e;
    console.warn("[voice] flights column missing; " + FLIGHTS_SQL);
    return null;
  }
}

const TRIP_SQL = "Run supabase/voice_requests.sql again in the Supabase SQL Editor (it adds the trip column).";

/** Rows saved before phase B, or before the trip column exists, have no trip: null. */
const tripOf = (r: VoiceRow): VoiceTrip | null => normalizeTrip(r.trip, Boolean((r.trip as { edited?: boolean } | null)?.edited));

/** Background work gets this long before the inbox stops showing "processing" and offers Try again. */
const PROCESSING_MS = 3 * 60_000;
const isProcessing = (r: VoiceRow) => !r.transcript_en && !r.error && Date.now() - Date.parse(r.created_at) < PROCESSING_MS;

async function toView(r: VoiceRow): Promise<VoiceRequest> {
  return {
    id: r.id,
    createdAt: r.created_at,
    name: r.name,
    phone: r.phone ?? "",
    email: r.email ?? "",
    seconds: r.seconds,
    audioUrl: await signedAudioUrl(r.audio_path),
    language: r.language ?? "",
    transcript: r.transcript ?? "",
    english: r.transcript_en ?? "",
    status: r.status,
    ...(r.error ? { error: r.error } : !r.transcript_en && !isProcessing(r) ? { error: "The voice wasn't turned into text. Press Try again." } : {}),
    processing: isProcessing(r),
    trip: withDateCheck(tripOf(r), r.created_at),
    tripSaved: "trip" in r,
    flights: flightsOf(r),
    flightsSaved: "flights" in r,
  };
}

/** Saves the trip; if the trip column hasn't been added yet, keeps everything else working. */
async function saveTrip(id: string, trip: VoiceTrip | null, extra: Partial<VoiceRow> = {}): Promise<VoiceRow | null> {
  try {
    return await updateVoice(id, { ...extra, trip });
  } catch (e) {
    if (!isMissingColumn(e, "trip")) throw e;
    console.warn("[voice] trip column missing; " + TRIP_SQL);
    return Object.keys(extra).length ? await updateVoice(id, extra) : null;
  }
}

/**
 * Voice → text → trip details (one Gemini call), then the notification email.
 * Never throws: a failure is saved on the row so the Agent tab can show it and offer Try again.
 */
async function processVoice(row: VoiceRow, audio: string, mime: string, origin: string, notify: boolean): Promise<VoiceRow> {
  let trip: VoiceTrip | null = null;
  try {
    const t = await transcribe(audio, mime, new Date(row.created_at));
    trip = withDateCheck(t.trip, row.created_at);
    const fields = { language: t.language, transcript: t.transcript, transcript_en: t.english, error: t.transcript ? null : "No speech could be heard in the recording." };
    row = (await saveTrip(row.id, trip, fields)) ?? { ...row, ...fields };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`[voice] transcription failed for ${row.id}: ${reason}`);
    const error = `Couldn't turn the voice into text: ${reason}`;
    row = (await updateVoice(row.id, { error }).catch(() => null)) ?? { ...row, error };
  }
  row = await autoFlights(row, trip);
  if (!notify) return row;

  // Tell Sunny by email. Best effort: the message is already in Sunny's inbox.
  const mail = await sendEmail(voiceEmail(row, trip, flightsOf(row), `${origin}/`, `${origin}/sigma-logo.png`));
  if (!mail.ok) console.warn(`[voice] email not sent: ${mail.reason}`);
  return row;
}

/**
 * After the voice is read: search real flights by itself, but only when the customer clearly said from, to
 * (a city with an airport) and an exact date. Never throws; a failure is noted for Sunny, who can search himself.
 */
const TRIP_KEYS = ["from", "to", "depart", "return", "adults", "children", "infants", "cabin"] as const;
const sameTrip = (a: FlightQuery, b: FlightQuery) => TRIP_KEYS.every((k) => a[k] === b[k]);

async function autoFlights(row: VoiceRow, trip: VoiceTrip | null): Promise<VoiceRow> {
  if (!flightsConfigured() || !trip || autoSearchBlockers(trip, today()).length) return row;
  const existing = flightsOf(row);
  const query = queryFromTrip(trip, today());
  // Already searched for these same details (e.g. Try again, or Read again found nothing new): don't spend another search.
  if (existing?.search && sameTrip(existing.search.query, query)) return row;
  let flights: VoiceFlights;
  try {
    flights = { search: await searchFlights(query, true), shortlist: existing?.shortlist ?? [] };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`[voice] automatic flight search failed for ${row.id}: ${reason}`);
    flights = { search: null, shortlist: existing?.shortlist ?? [], note: `The automatic flight search didn't work: ${reason}` };
  }
  return (await saveFlights(row.id, flights).catch(() => null)) ?? row;
}

export const POST = handle(async (request) => {
  const user = await requireUser(request);
  const body = await parseBody(request, voiceSubmitSchema);
  const mime = body.mime.split(";")[0].trim().toLowerCase();

  // Keep the recording first, so nothing is lost even if a later step fails.
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extOf(mime)}`;
  await uploadAudio(path, Buffer.from(body.audio, "base64"), mime);
  const row = await insertVoice({
    name: body.name, phone: body.phone || null, email: body.email || null,
    audio_path: path, audio_mime: mime, seconds: body.seconds, submitted_by: user.email,
  });

  // The customer doesn't wait for Gemini: the rest runs after this response.
  const work = processVoice(row, body.audio, body.mime, originOf(request), true).catch((e) => console.error("[voice] background step failed", e));
  waitUntil(work);
  return json({ id: row.id });
});

export const GET = handle(async (request) => {
  await requireUser(request);
  const rows = await listVoice();
  return json({ requests: await Promise.all(rows.map(toView)) });
});

export const PATCH = handle(async (request) => {
  await requireUser(request);
  const body = await parseBody(request, voicePatchSchema);
  let row: VoiceRow | null;

  if ("status" in body) {
    row = await updateVoice(body.id, { status: body.status });
  } else if (body.action === "save-trip") {
    const trip = normalizeTrip(body.trip, true);
    if (!(await voiceById(body.id))) throw new HttpError(404, "That voice message wasn't found.");
    row = await saveTrip(body.id, trip);
    if (!row) throw new HttpError(503, `Trip details can't be saved yet. ${TRIP_SQL}`);
    // Sunny filled in what was missing: search by itself once the details are complete.
    row = await autoFlights(row, trip);
  } else if (body.action === "retry") {
    const current = await voiceById(body.id);
    if (!current) throw new HttpError(404, "That voice message wasn't found.");
    const audio = (await downloadAudio(current.audio_path)).toString("base64");
    await updateVoice(current.id, { error: null });
    row = await processVoice({ ...current, error: null }, audio, current.audio_mime, originOf(request), false);
  } else if (body.action === "flights-search") {
    const current = await voiceById(body.id);
    if (!current) throw new HttpError(404, "That voice message wasn't found.");
    if (body.query.depart < today()) throw new HttpError(400, "The departure date has passed. Choose a future date.");
    const search = await searchFlights(body.query);
    const flights: VoiceFlights = { search, shortlist: flightsOf(current)?.shortlist ?? [] };
    row = await saveFlights(body.id, flights);
    // Column missing: still show the results, they just aren't kept.
    if (!row) return json({ request: { ...(await toView(current)), flights, flightsSaved: false } });
  } else if (body.action === "flights-return") {
    if (!(await voiceById(body.id))) throw new HttpError(404, "That voice message wasn't found.");
    return json({ returns: await returnFlights(body.query, body.token) });
  } else if (body.action === "flights-save") {
    const current = await voiceById(body.id);
    if (!current) throw new HttpError(404, "That voice message wasn't found.");
    const flights: VoiceFlights = { search: flightsOf(current)?.search ?? null, shortlist: body.shortlist as unknown as ShortlistItem[] };
    row = await saveFlights(body.id, flights);
    if (!row) throw new HttpError(503, `Sunny's options can't be saved yet. ${FLIGHTS_SQL}`);
  } else {
    const current = await voiceById(body.id);
    if (!current) throw new HttpError(404, "That voice message wasn't found.");
    if (!current.transcript_en) throw new HttpError(409, "This message has no text yet, so there's nothing to read the trip from.");
    const trip = withDateCheck(await readTrip(current.transcript_en, new Date(current.created_at)), current.created_at);
    row = await saveTrip(body.id, trip);
    if (!row) throw new HttpError(503, `Trip details can't be saved yet. ${TRIP_SQL}`);
    // Read again found complete details: search by itself, so Sunny doesn't have to press Search.
    row = await autoFlights(row, trip);
  }

  if (!row) throw new HttpError(404, "That voice message wasn't found.");
  return json({ request: await toView(row) });
});
