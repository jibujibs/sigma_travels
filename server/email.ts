/**
 * Emails: Gmail SMTP when GMAIL_USER + GMAIL_APP_PASSWORD are set (can send to anyone, with attachments),
 * otherwise Resend (RESEND_API_KEY; until a domain is verified it can only reach the Resend account's own address).
 * Sunny's notifications go to NOTIFY_EMAIL (To) and NOTIFY_CC (CC), both comma-separated.
 * All of these are server secrets: Vercel and .env.local only, never VITE_.
 */
import nodemailer from "nodemailer";
import { DEFAULT_CC } from "../shared/contact.js";

export interface Attachment { filename: string; content: Buffer; contentType: string }
export interface Mail {
  subject: string;
  html: string;
  text: string;
  /** Default: NOTIFY_EMAIL. */
  to?: string[];
  /** Default (only when `to` is not given): NOTIFY_CC. */
  cc?: string[];
  replyTo?: string;
  attachments?: Attachment[];
}
export type SendResult = { ok: true; via: "gmail" | "resend" } | { ok: false; reason: string };

const list = (v: string | undefined) => (v ?? "").split(",").map((e) => e.trim()).filter(Boolean);
const gmailUser = () => process.env.GMAIL_USER?.trim() ?? "";
const gmailPass = () => (process.env.GMAIL_APP_PASSWORD ?? "").replace(/\s+/g, ""); // Google shows it in groups of 4

/** True when emails can reach any address (needed to email a customer). */
export const canEmailAnyone = (): boolean => Boolean(gmailUser() && gmailPass());

/** Sends one email. Never throws: returns the reason instead, so a mail problem never loses a customer's message. */
export async function sendEmail(mail: Mail): Promise<SendResult> {
  const to = mail.to ?? list(process.env.NOTIFY_EMAIL);
  // Sunny's notifications: NOTIFY_CC if set (empty = nobody), else the team list in shared/contact.ts.
  const cc = mail.cc ?? (mail.to ? [] : process.env.NOTIFY_CC !== undefined ? list(process.env.NOTIFY_CC) : [...DEFAULT_CC]);
  if (!to.length) return { ok: false, reason: "No recipient (NOTIFY_EMAIL isn't set)." };
  return canEmailAnyone() ? viaGmail(mail, to, cc) : viaResend(mail, to, cc);
}

async function viaGmail(mail: Mail, to: string[], cc: string[]): Promise<SendResult> {
  const user = gmailUser();
  try {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user, pass: gmailPass() },
      connectionTimeout: 10_000, socketTimeout: 20_000,
    });
    await transport.sendMail({
      // Gmail sends as the account itself; the name shown is Sigma Travels.
      from: { name: process.env.EMAIL_FROM_NAME?.trim() || "Sigma Travels", address: user },
      to, cc: cc.length ? cc : undefined, replyTo: mail.replyTo,
      subject: mail.subject, html: mail.html, text: mail.text,
      attachments: mail.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })),
    });
    return { ok: true, via: "gmail" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[email] Gmail: ${msg.replace(gmailPass(), "***")}`);
    return { ok: false, reason: /auth|credentials|535|534/i.test(msg)
      ? "Gmail didn't accept the login. Check GMAIL_USER and GMAIL_APP_PASSWORD (an App Password, not the normal password)."
      : "Couldn't send through Gmail. Try again in a minute." };
  }
}

async function viaResend(mail: Mail, to: string[], cc: string[]): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return { ok: false, reason: "Email isn't set up (add GMAIL_USER and GMAIL_APP_PASSWORD, or RESEND_API_KEY)." };
  const from = process.env.EMAIL_FROM?.trim() || "Sigma Travels <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from, to, ...(cc.length ? { cc } : {}), ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        subject: mail.subject, html: mail.html, text: mail.text,
        ...(mail.attachments?.length ? { attachments: mail.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true, via: "resend" };
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    console.warn(`[email] Resend ${res.status}: ${body.message ?? ""}`);
    // Resend's test sender only reaches the account owner: rather than losing the email, send it without CC.
    if (cc.length && res.status >= 400 && res.status < 500) {
      console.warn("[email] Resend refused the CC addresses; sending to NOTIFY_EMAIL only. Set up Gmail to CC the team.");
      return viaResend(mail, to, []);
    }
    return { ok: false, reason: `Resend ${res.status}: ${body.message ?? "error"}` };
  } catch {
    return { ok: false, reason: "Couldn't reach Resend." };
  }
}
