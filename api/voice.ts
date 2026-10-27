import { requireUser } from "../server/auth.js";
import { sendEmail } from "../server/email.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { originOf } from "../server/payments.js";
import { insertVoice, listVoice, signedAudioUrl, updateVoice, uploadAudio, type VoiceRow } from "../server/supabase.js";
import { transcribe } from "../server/voice.js";
import { voiceStatusSchema, voiceSubmitSchema, type VoiceRequest } from "../shared/voice.js";

/**
 * Voice messages for Sunny.
 *   POST  /api/voice  { name, phone, email, audio, mime, seconds }  customer leaves a message (Customer tab)
 *   GET   /api/voice                                               Sunny's inbox (Agent tab)
 *   PATCH /api/voice  { id, status }                               Sunny updates the status
 * Sign-in is required for now, like the rest of the site (demo); the Customer tab can be opened up later.
 * (api/diag.ts was folded into a rewrite to make room for this file: the Vercel Hobby plan allows 12 functions.)
 */

const extOf = (mime: string) => (/webm/.test(mime) ? "webm" : /ogg/.test(mime) ? "ogg" : /mp4|m4a|aac/.test(mime) ? "m4a" : /mpeg|mp3/.test(mime) ? "mp3" : /wav/.test(mime) ? "wav" : "audio");

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
  };
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

  // 2. Voice → text (Gemini). A failure is saved on the row; Sunny can still listen to the audio.
  try {
    const t = await transcribe(body.audio, body.mime);
    row = (await updateVoice(row.id, { language: t.language, transcript: t.transcript, transcript_en: t.english, error: t.transcript ? null : "No speech could be heard in the recording." })) ?? row;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`[voice] transcription failed for ${row.id}: ${reason}`);
    row = (await updateVoice(row.id, { error: `Couldn't turn the voice into text: ${reason}` }).catch(() => null)) ?? row;
  }

  // 3. Tell us by email. Best effort: the message is already in Sunny's inbox.
  const mins = `${Math.floor(body.seconds / 60)}:${String(body.seconds % 60).padStart(2, "0")}`;
  const mail = await sendEmail(
    `New voice message from ${body.name}`,
    [
      `${body.name} left a ${mins} voice message on Sigma Travels.`,
      [body.phone && `Phone: ${body.phone}`, body.email && `Email: ${body.email}`].filter(Boolean).join("\n"),
      row.transcript_en ? `What they said${row.language && row.language !== "English" ? ` (translated from ${row.language})` : ""}:\n"${row.transcript_en}"` : row.error ?? "The message couldn't be turned into text; listen to it on the Agent Desk.",
    ],
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
  const { id, status } = await parseBody(request, voiceStatusSchema);
  const row = await updateVoice(id, { status });
  if (!row) throw new HttpError(404, "That voice message wasn't found.");
  return json({ request: await toView(row) });
});
