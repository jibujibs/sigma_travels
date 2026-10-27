import { requireUser } from "../server/auth.js";
import { sendEmail } from "../server/email.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { originOf } from "../server/payments.js";
import { insertVoice, isMissingColumn, listVoice, signedAudioUrl, updateVoice, uploadAudio, voiceById, type VoiceRow } from "../server/supabase.js";
import { readTrip, transcribe } from "../server/voice.js";
import { normalizeTrip, tripLine, voicePatchSchema, voiceSubmitSchema, type VoiceRequest, type VoiceTrip } from "../shared/voice.js";

/**
 * Voice messages for Sunny.
 *   POST  /api/voice  { name, phone, email, audio, mime, seconds }  customer leaves a message (Customer tab)
 *   GET   /api/voice                                               Sunny's inbox (Agent tab)
 *   PATCH /api/voice  { id, status }                               Sunny updates the status
 *   PATCH /api/voice  { id, action: "save-trip", trip }            Sunny corrects the trip details
 *   PATCH /api/voice  { id, action: "read-trip" }                  Gemini reads the trip from the text again
 * Sign-in is required for now, like the rest of the site (demo); the Customer tab can be opened up later.
 * (api/diag.ts was folded into a rewrite to make room for this file: the Vercel Hobby plan allows 12 functions.)
 */

const extOf = (mime: string) => (/webm/.test(mime) ? "webm" : /ogg/.test(mime) ? "ogg" : /mp4|m4a|aac/.test(mime) ? "m4a" : /mpeg|mp3/.test(mime) ? "mp3" : /wav/.test(mime) ? "wav" : "audio");

const TRIP_SQL = "Run supabase/voice_requests.sql again in the Supabase SQL Editor (it adds the trip column).";

/** Rows saved before phase B, or before the trip column exists, have no trip: null. */
const tripOf = (r: VoiceRow): VoiceTrip | null => normalizeTrip(r.trip, Boolean((r.trip as { edited?: boolean } | null)?.edited));

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
    ...(r.error ? { error: r.error } : {}),
    trip: tripOf(r),
    tripSaved: "trip" in r,
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

export const POST = handle(async (request) => {
  const user = await requireUser(request);
  const body = await parseBody(request, voiceSubmitSchema);
  const mime = body.mime.split(";")[0].trim().toLowerCase();

  // 1. Keep the recording first, so nothing is lost even if a later step fails.
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${extOf(mime)}`;
  await uploadAudio(path, Buffer.from(body.audio, "base64"), mime);
  let row = await insertVoice({
    name: body.name, phone: body.phone || null, email: body.email || null,
    audio_path: path, audio_mime: mime, seconds: body.seconds, submitted_by: user.email,
  });

  // 2. Voice → text → trip details, in one Gemini call. A failure is saved on the row; Sunny can still listen.
  let trip: VoiceTrip | null = null;
  try {
    const t = await transcribe(body.audio, body.mime, new Date(row.created_at));
    trip = t.trip;
    const fields = { language: t.language, transcript: t.transcript, transcript_en: t.english, error: t.transcript ? null : "No speech could be heard in the recording." };
    row = (await saveTrip(row.id, trip, fields)) ?? row;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`[voice] transcription failed for ${row.id}: ${reason}`);
    row = (await updateVoice(row.id, { error: `Couldn't turn the voice into text: ${reason}` }).catch(() => null)) ?? row;
  }

  // 3. Tell us by email. Best effort: the message is already in Sunny's inbox.
  const mins = `${Math.floor(body.seconds / 60)}:${String(body.seconds % 60).padStart(2, "0")}`;
  const mail = await sendEmail(
    `New voice message from ${body.name}${trip?.to ? `: ${tripLine(trip).split(" · ").slice(0, 2).join(", ")}` : ""}`,
    [
      `${body.name} left a ${mins} voice message on Sigma Travels.`,
      [body.phone && `Phone: ${body.phone}`, body.email && `Email: ${body.email}`].filter(Boolean).join("\n"),
      row.transcript_en ? `What they said${row.language && row.language !== "English" ? ` (translated from ${row.language})` : ""}:\n"${row.transcript_en}"` : row.error ?? "The message couldn't be turned into text; listen to it on the Agent Desk.",
      trip ? `Trip: ${tripLine(trip)}${trip.budget ? `\nBudget: ${trip.budget}` : ""}${trip.notes ? `\nNotes: ${trip.notes}` : ""}\nStill to ask: ${trip.missing.join(", ") || "nothing"}` : "",
    ].filter(Boolean),
    `${originOf(request)}/`,
  );
  if (!mail.ok) console.warn(`[voice] email not sent: ${mail.reason}`);

  return json({ id: row.id, emailed: mail.ok });
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
  } else {
    const current = await voiceById(body.id);
    if (!current) throw new HttpError(404, "That voice message wasn't found.");
    if (!current.transcript_en) throw new HttpError(409, "This message has no text yet, so there's nothing to read the trip from.");
    const trip = await readTrip(current.transcript_en, new Date(current.created_at));
    row = await saveTrip(body.id, trip);
    if (!row) throw new HttpError(503, `Trip details can't be saved yet. ${TRIP_SQL}`);
  }

  if (!row) throw new HttpError(404, "That voice message wasn't found.");
  return json({ request: await toView(row) });
});
