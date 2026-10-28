import { useCallback, useEffect, useState } from "react";
import { VOICE_STATUSES, type VoiceRequest, type VoiceStatus, type VoiceTrip } from "../../shared/voice";
import { api } from "../lib/api";
import { VoiceFlights } from "./VoiceFlights";
import { VoiceTripBox } from "./VoiceTripBox";

const STATUS_LABEL: Record<VoiceStatus, string> = { new: "New", contacted: "Contacted", ticketed: "Ticketed", closed: "Closed" };
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const tel = (p: string) => `tel:${p.replace(/[^\d+]/g, "")}`;

/**
 * Agent tab: voice messages customers left for Sunny, newest first.
 * Listen, read what they said (with an English version), call or email them back, and track the status.
 */
export function VoiceInbox({ onOpenPlanner }: { onOpenPlanner: (trip: VoiceTrip, from: string) => void }) {
  const [items, setItems] = useState<VoiceRequest[] | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string>();

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const r = await api.voice.list();
      setItems(r.requests);
      setError(undefined);
    } catch (e) {
      if (!quiet) setError((e as Error).message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  // Load now, then look for new messages every 30 seconds, or every 4 seconds while a voice is being turned into text.
  const busyText = items?.some((x) => x.processing) ?? false;
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = window.setInterval(() => void load(true), busyText ? 4_000 : 30_000);
    return () => window.clearInterval(id);
  }, [load, busyText]);

  async function retry(id: string) {
    setSaving(id);
    setItems((xs) => xs?.map((x) => (x.id === id ? { ...x, processing: true, error: undefined } : x)) ?? null);
    try {
      const { request } = await api.voice.retry(id);
      setItems((xs) => xs?.map((x) => (x.id === id ? request : x)) ?? null);
    } catch (e) {
      setError((e as Error).message);
      void load(true);
    } finally {
      setSaving(undefined);
    }
  }

  async function setStatus(id: string, status: VoiceStatus) {
    setSaving(id);
    try {
      const { request } = await api.voice.setStatus(id, status);
      setItems((xs) => xs?.map((x) => (x.id === id ? request : x)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(undefined);
    }
  }

  // Only the newest request is shown: earlier ones (their text, trip and flights) stay hidden until Sunny asks.
  // A new request from a customer replaces the one on screen and folds the earlier list away again.
  const [showEarlier, setShowEarlier] = useState(false);
  const newestId = items?.[0]?.id;
  useEffect(() => { setShowEarlier(false); }, [newestId]);
  const shown = items ? (showEarlier ? items : items.slice(0, 1)) : null;
  const earlier = items ? items.length - 1 : 0;
  const fresh = shown?.filter((x) => x.status === "new").length ?? 0;

  return (
    <section className="desk-hero voice-inbox" aria-labelledby="vi-h">
      <div className="vi-head">
        <div>
          <p className="eyebrow">Voice requests</p>
          <h2 id="vi-h">Voice messages from customers {fresh > 0 && <span className="badge warn">{fresh} new</span>}</h2>
          <p className="hint">Messages left on the Customer tab. Listen, read what they said, then call or email them back.</p>
        </div>
        <button className="btn" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button>
      </div>

      {error && <p className="err-text" role="alert">{error}</p>}
      {items && items.length === 0 && <p className="note">No voice messages yet. They'll appear here as soon as a customer sends one.</p>}

      <div className="vi-list">
        {shown?.map((v) => (
          <article key={v.id} className={`vi-item${v.status === "new" ? " is-new" : ""}`} aria-label={`Voice message from ${v.name}`}>
            <header className="vi-top">
              <div>
                <strong className="vi-name">{v.name}</strong>
                <span className="hint"> · {when(v.createdAt)} · {clock(v.seconds)}{v.language ? ` · ${v.language}` : ""}</span>
              </div>
              <label className="vi-status">
                <span className="sr-only">Status</span>
                <select value={v.status} disabled={saving === v.id} onChange={(e) => void setStatus(v.id, e.target.value as VoiceStatus)}>
                  {VOICE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </label>
            </header>

            {v.audioUrl ? <audio className="rec-audio" controls preload="none" src={v.audioUrl} aria-label={`Recording from ${v.name}`} />
              : <p className="hint small">The recording can't be played right now.</p>}

            {v.processing ? (
              <p className="vi-processing" role="status"><span className="spin" aria-hidden="true" /> Turning the voice into text… You can listen to it already.</p>
            ) : v.english ? (
              // The customer's own words first (blue label), then the English translation highlighted in yellow.
              // Both always visible; an English message is shown once, with nothing to translate.
              v.transcript && v.transcript !== v.english ? (
                <div className="vi-text">
                  <section className="vi-orig" aria-label="Original message">
                    <p className="vi-label orig">Original · {v.language || "as spoken"}</p>
                    <p lang="und">{v.transcript}</p>
                  </section>
                  <section className="vi-trans" aria-label="English translation">
                    <p className="vi-label">English translation</p>
                    <p>{v.english}</p>
                  </section>
                </div>
              ) : (
                <div className="vi-text">
                  {/* Spoken in English: no translation needed, shown once in the same yellow box as a translation. */}
                  <section className="vi-trans" aria-label="Message">
                    <p className="vi-label">Message · {v.language || "English"}</p>
                    <p>{v.english}</p>
                  </section>
                </div>
              )
            ) : (
              <div className="vi-failed">
                <p className="warn-text small">{v.error ?? "No text yet."}{v.audioUrl ? " Listen to the recording above." : ""}</p>
                <button className="btn small-btn" onClick={() => void retry(v.id)} disabled={saving === v.id}>{saving === v.id ? "Trying again…" : "Try again"}</button>
              </div>
            )}

            {!v.processing && <VoiceTripBox v={v} onOpenPlanner={(trip) => onOpenPlanner(trip, v.name)}
              onChange={(r) => setItems((xs) => xs?.map((x) => (x.id === r.id ? r : x)) ?? null)} />}

            {!v.processing && v.english && <VoiceFlights key={`${v.id}:${JSON.stringify(v.trip)}`} v={v}
              onChange={(r) => setItems((xs) => xs?.map((x) => (x.id === r.id ? r : x)) ?? null)} />}

            <div className="vi-actions">
              {v.phone && <a className="btn solid" href={tel(v.phone)}>📞 Call {v.phone}</a>}
              {v.email && <a className="btn" href={`mailto:${v.email}?subject=${encodeURIComponent("Your trip with Sigma Travels")}`}>✉ Email</a>}
            </div>
          </article>
        ))}
      </div>
      {earlier > 0 && (
        <button type="button" className="btn small-btn vi-earlier" aria-expanded={showEarlier} onClick={() => setShowEarlier((x) => !x)}>
          {showEarlier ? "Hide earlier requests" : `Show earlier requests (${earlier})`}
        </button>)}
    </section>
  );
}
