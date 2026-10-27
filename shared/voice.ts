import { z } from "zod";

/** Longest voice message a customer can record. */
export const VOICE_MAX_SECONDS = 180;
/** Base64 size cap (a 3-minute Opus/AAC recording is about 1–2 MB; Vercel accepts request bodies up to 4.5 MB). */
export const VOICE_MAX_BASE64 = 4_000_000;

export type VoiceStatus = "new" | "contacted" | "ticketed" | "closed";
export const VOICE_STATUSES: VoiceStatus[] = ["new", "contacted", "ticketed", "closed"];

/** Customer → server: the recording and how to reach them. */
export const voiceSubmitSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80),
  phone: z.string().trim().max(30).default(""),
  email: z.string().trim().max(120).default(""),
  /** Base64 audio, no "data:" prefix. */
  audio: z.string().min(100, "The recording is empty. Record your message again.").max(VOICE_MAX_BASE64, "The recording is too large. Keep it under 3 minutes."),
  mime: z.string().regex(/^audio\/[a-z0-9.+-]+(;.*)?$/i, "Unsupported audio format"),
  seconds: z.number().int().min(1).max(VOICE_MAX_SECONDS + 5),
}).refine((v) => v.phone.length >= 6 || /^\S+@\S+\.\S+$/.test(v.email), {
  message: "Enter a phone number or an email address so Sunny can contact you.",
  path: ["phone"],
}).refine((v) => !v.email || /^\S+@\S+\.\S+$/.test(v.email), { message: "Check the email address.", path: ["email"] });

export const voiceStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "contacted", "ticketed", "closed"]),
});

/** One voice request as Sunny sees it in the Agent inbox. */
export interface VoiceRequest {
  id: string;
  createdAt: string;
  name: string;
  phone: string;
  email: string;
  seconds: number;
  /** Short-lived link to play the recording (null if storage is unavailable). */
  audioUrl: string | null;
  /** Language the customer spoke, e.g. "Malayalam". */
  language: string;
  /** What the customer said, in their own language. */
  transcript: string;
  /** English version (same as transcript when they spoke English). */
  english: string;
  status: VoiceStatus;
  /** Set when transcription failed; the recording is still saved. */
  error?: string;
}
