import { useCallback, useEffect, useRef, useState } from "react";
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
export function VoiceInbox({ onOpenPlanner, onNewCount }: { onOpenPlanner: (trip: VoiceTrip, from: string) => void; onNewCount?: (n: number) => void }) {
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

  // Load now, then look for new messages every 30 seconds, or every 4 seconds while a voice is being turned into text
  // or its flights are being searched, so the Top 3 appears by itself.
  const busyText = items?.some((x) => x.processing || x.searching) ?? false;
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

  // The newest request opens by itself; earlier ones stay folded in the list until Sunny asks.
  // A new request from a customer opens in its place and folds the earlier list away again.
  const [showEarlier, setShowEarlier] = useState(false);
  const [openId, setOpenId] = useState<string>();
  const newestId = items?.[0]?.id;
  useEffect(() => { setShowEarlier(false); setOpenId(newestId); }, [newestId]);
  const open = items?.find((x) => x.id === openId) ?? items?.[0];
  const earlier = items?.slice(1) ?? [];
  const fresh = items?.filter((x) => x.status === "new").length ?? 0;
  useEffect(() => { onNewCount?.(fresh); }, [fresh, onNewCount]);
  const update = (r: VoiceRequest) => setItems((xs) => xs?.map((x) => (x.id === r.id ? r : x)) ?? null);

  const row = (v: VoiceRequest) => (
    <li key={v.id}>
      <button type="button" className={`vi-row${v.id === open?.id ? " on" : ""}`} aria-current={v.id === open?.id ? "true" : undefined} onClick={() => setOpenId(v.id)}>
        <span className="vi-row-top">
          <b>{v.status === "new" && <span className="vi-dot" aria-label="New" />}{v.name}</b>
          <span className="vi-row-when">{v.id === newestId ? timeOf(v.createdAt) : dayOf(v.createdAt)}</span>
        </span>
        <span className="vi-row-trip">{v.processing ? "Reading the message…" : tripLine(v.trip) || (v.error ? "Couldn't read · try again" : "No trip details")}</span>
      </button>
    </li>
  );

  return (
    <section className="voice-inbox" aria-labelledby="vi-h">
      <h2 id="vi-h" className="sr-only">Voice requests</h2>
      {error && <p className="err-text" role="alert">{error}</p>}
      {items && items.length === 0 && <p className="note">No voice messages yet. They'll appear here as soon as a customer sends one.</p>}
      {!items && !error && <p className="hint"><span className="spin" aria-hidden="true" /> Loading voice requests…</p>}

      {items && items.length > 0 && open && (
        <div className="vi-layout">
          <aside className="vi-side" aria-label="Requests">
            <div className="vi-side-head">
              <span className="lbl">Newest</span>
              <button className="btn small-btn" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "↻ Refresh"}</button>
            </div>
            <ul className="vi-rows">{row(items[0])}</ul>
            {earlier.length > 0 && (
              <>
                <button type="button" className="vi-earlier" aria-expanded={showEarlier} onClick={() => setShowEarlier((x) => !x)}>
                  {showEarlier ? "▾" : "▸"} Earlier requests ({earlier.length})
                </button>
                {showEarlier && <ul className="vi-rows">{earlier.map(row)}</ul>}
              </>
            )}
          </aside>

          <Detail key={open.id} v={open} saving={saving === open.id} onStatus={(s) => void setStatus(open.id, s)} onRetry={() => void retry(open.id)}
            onOpenPlanner={onOpenPlanner} onChange={update} />
        </div>
      )}
    </section>
  );
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const shortDate = (d: string) => (d ? `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}` : "");
/** "COK → RUH · 15 Nov · 3 adults" for the list. */
function tripLine(t: VoiceTrip | null): string {
  if (!t) return "";
  const place = (p: VoiceTrip["from"]) => p?.airport || p?.city || "?";
  const route = t.from || t.to ? `${place(t.from)} → ${place(t.to)}` : "";
  const dates = t.depart ? (t.return ? `${shortDate(t.depart)}–${shortDate(t.return)}` : shortDate(t.depart)) : "";
  const n = t.adults + t.children + t.infants;
  return [route, dates, n ? `${n} ${n === 1 ? "adult" : t.children + t.infants ? "travellers" : "adults"}` : ""].filter(Boolean).join(" · ");
}

/** The open request: who, Call / Email / Status, the message with a play button, trip details and flights. */
function Detail({ v, saving, onStatus, onRetry, onOpenPlanner, onChange }: {
  v: VoiceRequest; saving: boolean; onStatus: (s: VoiceStatus) => void; onRetry: () => void;
  onOpenPlanner: (trip: VoiceTrip, from: string) => void; onChange: (r: VoiceRequest) => void;
}) {
  const play = v.audioUrl ? <PlayButton src={v.audioUrl} name={v.name} /> : null;
  return (
    <article className={`vi-item vi-detail${v.status === "new" ? " is-new" : ""}`} aria-label={`Voice message from ${v.name}`}>
      <header className="vi-top">
        <div>
          <strong className="vi-name">{v.name}</strong>
          <span className="hint"> {when(v.createdAt)} · {v.language ? `${v.language} · ` : ""}{clock(v.seconds)}</span>
        </div>
        <div className="vi-actions">
          {v.phone && <a className="btn solid" href={tel(v.phone)}>📞 Call {v.phone}</a>}
          {v.email && <a className="btn" href={`mailto:${v.email}?subject=${encodeURIComponent("Your trip with Sigma Travels")}`}>✉ Email</a>}
          <label className="vi-status">
            <span className="sr-only">Status</span>
            <select value={v.status} disabled={saving} onChange={(e) => onStatus(e.target.value as VoiceStatus)}>
              {VOICE_STATUSES.map((s) => <option key={s} value={s}>Status: {STATUS_LABEL[s]}</option>)}
            </select>
          </label>
        </div>
      </header>

      {v.processing ? (
        <div className="vi-text"><section className="vi-trans vi-msg">{play}
          <p className="vi-processing" role="status"><span className="spin" aria-hidden="true" /> Turning the voice into text… You can listen to it already.</p></section></div>
      ) : v.english ? (
        // The customer's own words first (blue label), then the English translation highlighted in yellow.
        v.transcript && v.transcript !== v.english ? (
          <div className="vi-text">
            <section className="vi-orig" aria-label="Original message">
              <p className="vi-label orig">Original · {v.language || "as spoken"}</p>
              <p lang="und">{v.transcript}</p>
            </section>
            <section className="vi-trans vi-msg" aria-label="English translation">{play}
              <div><p className="vi-label">English translation</p><p>“{v.english}”</p></div>
            </section>
          </div>
        ) : (
          <div className="vi-text">
            <section className="vi-trans vi-msg" aria-label="Message">{play}
              <div><p className="vi-label">Message · {v.language || "English"}</p><p>“{v.english}”</p></div>
            </section>
          </div>
        )
      ) : (
        <div className="vi-failed">
          {play}
          <p className="warn-text small">{v.error ?? "No text yet."}{v.audioUrl ? " You can still listen to the recording." : ""}</p>
          <button className="btn small-btn" onClick={onRetry} disabled={saving}>{saving ? "Trying again…" : "Try again"}</button>
        </div>
      )}
      {!v.audioUrl && <p className="hint small">The recording can't be played right now.</p>}

      {!v.processing && <VoiceTripBox v={v} onOpenPlanner={(trip) => onOpenPlanner(trip, v.name)} onChange={onChange} />}
      {!v.processing && v.english && <VoiceFlights key={`${v.id}:${JSON.stringify(v.trip)}`} v={v} onChange={onChange} />}
    </article>
  );
}

/** Round ▶ / ❚❚ button that plays the customer's recording, with a thin progress ring. */
function PlayButton({ src, name }: { src: string; name: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [pct, setPct] = useState(0);
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setPlaying(false)); else a.pause();
  };
  return (
    <>
      <button type="button" className="vi-play" aria-label={`${playing ? "Pause" : "Play"} the recording from ${name}`} onClick={toggle}
        style={{ ["--p" as string]: `${pct}%` }}>{playing ? "❚❚" : "▶"}</button>
      <audio ref={ref} src={src} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setPct(0); }}
        onTimeUpdate={(e) => { const a = e.currentTarget; setPct(a.duration ? (a.currentTime / a.duration) * 100 : 0); }} />
    </>
  );
}
