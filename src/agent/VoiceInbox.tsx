import { useCallback, useEffect, useState } from "react";
import { VOICE_STATUSES, type VoiceRequest, type VoiceStatus, type VoiceTrip } from "../../shared/voice";
import { api } from "../lib/api";
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

  // Load now, then look for new messages every 30 seconds.
  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(true), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

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

  const fresh = items?.filter((x) => x.status === "new").length ?? 0;

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
        {items?.map((v) => (
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

            {v.english ? (
              <blockquote className="vi-text">
                <p>{v.english}</p>
                {v.transcript && v.transcript !== v.english && (
                  <details><summary>Original ({v.language || "as spoken"})</summary><p lang="und">{v.transcript}</p></details>
                )}
              </blockquote>
            ) : (
              <p className="warn-text small">{v.error ?? "No text yet."}{v.audioUrl ? " Listen to the recording above." : ""}</p>
            )}

            <VoiceTripBox v={v} onOpenPlanner={(trip) => onOpenPlanner(trip, v.name)}
              onChange={(r) => setItems((xs) => xs?.map((x) => (x.id === r.id ? r : x)) ?? null)} />

            <div className="vi-actions">
              {v.phone && <a className="btn solid" href={tel(v.phone)}>📞 Call {v.phone}</a>}
              {v.email && <a className="btn" href={`mailto:${v.email}?subject=${encodeURIComponent("Your trip with Sigma Travels")}`}>✉ Email</a>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
