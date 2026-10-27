import { useEffect, useRef, useState, type FormEvent } from "react";
import { VOICE_MAX_SECONDS } from "../../shared/voice";
import { api } from "../lib/api";

type Phase = "idle" | "recording" | "recorded" | "sending" | "sent";

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** The best format this browser can record: Opus in WebM (Chrome, Edge, Firefox) or AAC in MP4 (Safari, iPhone). */
function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"]) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return "";
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => reject(new Error("Couldn't read the recording."));
    r.readAsDataURL(blob);
  });
}

/**
 * Customer tab: leave a voice message for Sunny (up to 3 minutes). The recording goes to the server,
 * which keeps it, turns it into text with Gemini and shows it in the Agent tab's "Voice requests".
 */
export function VoiceMessage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [secs, setSecs] = useState(0);
  const [clip, setClip] = useState<{ blob: Blob; url: string; mime: string; seconds: number } | null>(null);
  const [error, setError] = useState<string>();
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const timer = useRef<number>(undefined);

  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && pickMime() !== "";

  const stopTracks = () => { streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null; };
  useEffect(() => () => { window.clearInterval(timer.current); stopTracks(); }, []);
  useEffect(() => () => { if (clip) URL.revokeObjectURL(clip.url); }, [clip]);

  async function start() {
    setError(undefined);
    const mime = pickMime();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      const n = (e as Error).name;
      setError(n === "NotAllowedError" || n === "SecurityError"
        ? "Microphone access was blocked. Allow the microphone for this site (the 🔒 icon next to the address) and try again."
        : n === "NotFoundError" ? "No microphone was found on this device." : "Couldn't start the microphone. Try again.");
      return;
    }
    streamRef.current = stream;
    chunks.current = [];
    const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48_000 });
    rec.ondataavailable = (ev) => { if (ev.data.size) chunks.current.push(ev.data); };
    rec.onstop = () => {
      window.clearInterval(timer.current);
      stopTracks();
      const seconds = Math.max(1, Math.min(VOICE_MAX_SECONDS, Math.round((Date.now() - started.current) / 1000)));
      const type = rec.mimeType || mime;
      const blob = new Blob(chunks.current, { type });
      if (blob.size < 500) { setPhase("idle"); setError("Nothing was recorded. Check your microphone and try again."); return; }
      setClip({ blob, url: URL.createObjectURL(blob), mime: type, seconds });
      setPhase("recorded");
    };
    recRef.current = rec;
    started.current = Date.now();
    setSecs(0);
    rec.start(1000);
    setPhase("recording");
    timer.current = window.setInterval(() => {
      const s = (Date.now() - started.current) / 1000;
      setSecs(s);
      if (s >= VOICE_MAX_SECONDS && rec.state === "recording") rec.stop(); // 3 minutes: stop by itself
    }, 250);
  }

  const stop = () => { if (recRef.current?.state === "recording") recRef.current.stop(); };
  const again = () => { setClip(null); setPhase("idle"); setSecs(0); setError(undefined); };

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!clip) return;
    if (name.trim().length < 2) return setError("Enter your name.");
    const okEmail = /^\S+@\S+\.\S+$/.test(email.trim());
    if (email.trim() && !okEmail) return setError("Check the email address.");
    if (phone.replace(/\D/g, "").length < 6 && !okEmail) return setError("Enter a phone number or an email address so Sunny can contact you.");
    setError(undefined);
    setPhase("sending");
    try {
      await api.voice.send({ name: name.trim(), phone: phone.trim(), email: email.trim(), audio: await toBase64(clip.blob), mime: clip.mime, seconds: clip.seconds });
      setPhase("sent");
    } catch (err) {
      setError((err as Error).message);
      setPhase("recorded");
    }
  }

  if (phase === "sent") {
    return (
      <section className="desk-hero voice-card" aria-labelledby="vm-h">
        <p className="eyebrow">Voice message</p>
        <h2 id="vm-h">✓ Message sent to Sunny</h2>
        <p className="hint">Thank you, {name.trim().split(" ")[0]}. Sunny will listen to your message and contact you {phone ? `on ${phone}` : `at ${email}`} with flight options.</p>
        <div><button type="button" className="btn" onClick={() => { again(); setName(""); setPhone(""); setEmail(""); }}>Leave another message</button></div>
      </section>
    );
  }

  const busy = phase === "sending";
  return (
    <section className="desk-hero voice-card" aria-labelledby="vm-h">
      <div>
        <p className="eyebrow">Voice message</p>
        <h2 id="vm-h">Planning a new trip? Tell Sunny</h2>
        <p className="hint">Record a message of up to 3 minutes: where you want to go, when, how many people and anything else. Sunny will call you back with flight options.</p>
      </div>

      <form className="voice-form" onSubmit={send} noValidate>
        <div className="voice-fields">
          <div className="field"><label className="lbl" htmlFor="vm-name">Your name</label>
            <input id="vm-name" autoComplete="name" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setError(undefined); }} disabled={busy} /></div>
          <div className="field"><label className="lbl" htmlFor="vm-phone">Phone</label>
            <input id="vm-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 214 555 0100" value={phone} maxLength={30} onChange={(e) => { setPhone(e.target.value); setError(undefined); }} disabled={busy} /></div>
          <div className="field"><label className="lbl" htmlFor="vm-email">Email</label>
            <input id="vm-email" type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={email} maxLength={120} onChange={(e) => { setEmail(e.target.value); setError(undefined); }} disabled={busy} /></div>
        </div>

        <div className={`recorder ${phase}`}>
          {!supported ? (
            <p className="note">This browser can't record audio. Please use a recent Chrome, Edge, Firefox or Safari, or call the office.</p>
          ) : phase === "idle" ? (
            <button type="button" className="btn solid big mic-btn" onClick={start}><span aria-hidden="true">🎤</span> Record message</button>
          ) : phase === "recording" ? (
            <>
              <span className="rec-dot" aria-hidden="true" />
              <span className="rec-time mono" role="timer" aria-live="off">{clock(secs)} <span className="muted">/ {clock(VOICE_MAX_SECONDS)}</span></span>
              <div className="rec-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, (secs / VOICE_MAX_SECONDS) * 100)}%` }} /></div>
              <button type="button" className="btn solid stop-btn" onClick={stop}><span aria-hidden="true">■</span> Stop</button>
            </>
          ) : clip && (
            <>
              <audio className="rec-audio" controls src={clip.url} aria-label="Your recording" />
              <span className="hint mono">{clock(clip.seconds)}</span>
              <button type="button" className="btn" onClick={again} disabled={busy}>Record again</button>
            </>
          )}
        </div>
        <p className="sr-only" aria-live="polite">{phase === "recording" ? "Recording started" : phase === "recorded" ? "Recording stopped" : ""}</p>

        {error && <p className="err-text" role="alert">{error}</p>}
        {(phase === "recorded" || phase === "sending") && (
          <button className="btn solid big send-btn" type="submit" disabled={busy}>{busy ? "Sending…" : "Send to Sunny"}</button>
        )}
      </form>
    </section>
  );
}
