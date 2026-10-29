import { useState } from "react";
import type { ShortlistItem } from "../../shared/flights";
import type { VoiceRequest } from "../../shared/voice";
import { api } from "../lib/api";
import { CONTACT_EMAIL, DEFAULT_CC } from "../../shared/contact";
import { buildItineraryPdf, toBase64 } from "./itineraryPdf";

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * "Email PDF to customer": the same itinerary PDF as Download PDF, emailed through Gmail from the server,
 * with Sunny's options listed in the email and an optional note. CC for seniors. Shows when it was sent.
 */
export function EmailPdf({ v, shortlist, onChange }: { v: VoiceRequest; shortlist: ShortlistItem[]; onChange: (r: VoiceRequest) => void }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(v.email);
  const [cc, setCc] = useState(DEFAULT_CC.join(", "));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const sent = v.flights?.emailed ?? [];
  const last = sent[sent.length - 1];
  const id = (k: string) => `ep-${v.id}-${k}`;

  async function send() {
    const ccList = cc.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    if (!isEmail(to)) return setError("Enter the customer's email address.");
    const bad = ccList.find((c) => !isEmail(c));
    if (bad) return setError(`Check the CC address: ${bad}`);
    if (ccList.length > 5) return setError("Up to 5 CC addresses.");
    setBusy(true);
    setError(undefined);
    try {
      const { bytes } = await buildItineraryPdf({ name: v.name, phone: v.phone, email: v.email }, shortlist);
      const r = await api.voice.emailPdf(v.id, { to: to.trim(), cc: ccList, note: note.trim(), pdf: toBase64(bytes) });
      onChange(r.request);
      setOpen(false);
      setNote("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!open && <button className="btn solid" onClick={() => { setOpen(true); setError(undefined); }}>✉ Email PDF to customer</button>}
      {last && !open && <p className="hint small ep-sent" role="status">✓ Emailed to {last.to}{last.cc.length ? ` (CC ${last.cc.join(", ")})` : ""} · {when(last.at)}{sent.length > 1 ? ` · sent ${sent.length} times` : ""}</p>}
      {open && (
        <div className="ep-box" role="group" aria-label="Email the PDF to the customer">
          <div className="ep-fields">
            <div className="field"><label className="lbl" htmlFor={id("to")}>To (customer)</label>
              <input id={id("to")} type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" disabled={busy} /></div>
            <div className="field"><label className="lbl" htmlFor={id("cc")}>CC (optional, comma separated)</label>
              <input id={id("cc")} value={cc} onChange={(e) => setCc(e.target.value)} placeholder="senior@jibstech.com" disabled={busy} /></div>
          </div>
          <div className="field"><label className="lbl" htmlFor={id("note")}>Note from Sunny (optional)</label>
            <textarea id={id("note")} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Option 2 is the best value for your dates." disabled={busy} /></div>
          <p className="hint small">The email lists the {shortlist.length} option{shortlist.length > 1 ? "s" : ""} in Sunny's options and attaches the PDF. Replies go to {CONTACT_EMAIL}.</p>
          {error && <p className="err-text" role="alert">{error}</p>}
          <div className="vt-head-actions">
            <button className="btn solid" disabled={busy} onClick={() => void send()}>{busy ? "Sending…" : "Send email"}</button>
            <button className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
