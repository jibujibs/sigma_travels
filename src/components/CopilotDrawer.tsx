import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { api, type ChatMsg } from "../lib/api";
import { getThreadId, newThreadId } from "../lib/guest";

interface Props {
  guestId: string;
  /** Builds the current trip context at send time. */
  getContext: () => string;
  hasPlan: boolean;
  /** Lift the button above the mobile quote bar when a plan is on screen. */
  raised: boolean;
}

const WELCOME = "Hi! I'm Sigma Copilot. Ask me anything about your trip: visas, flights, hotels, what to pack or what to do there.";

/**
 * Gemini sometimes answers in Markdown. Show **bold** as bold and turn "* item" / "- item" / "# Heading"
 * into plain lines, so no stray symbols appear. Builds React elements (no HTML injection).
 */
function formatReply(text: string): ReactNode {
  const clean = text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^(\s*)[*-]\s+/gm, "$1• ");
  return clean.split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    /^\*\*[^*\n]+\*\*$/.test(part)
      ? <strong key={i}>{part.slice(2, -2)}</strong>
      : <Fragment key={i}>{part.replace(/\*\*/g, "")}</Fragment>,
  );
}

export function CopilotDrawer({ guestId, getContext, hasPlan, raised }: Props) {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState(getThreadId);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load this conversation's saved history the first time the drawer opens.
  useEffect(() => {
    if (!open || loaded) return;
    setLoaded(true);
    api.chat.history(guestId, threadId)
      .then((r) => { if (r.messages.length) setMsgs(r.messages.map((m) => ({ role: m.role, content: m.content }))); })
      .catch(() => { /* history is optional */ });
  }, [open, loaded, guestId, threadId]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [msgs, sending, open]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    const history = msgs.slice(-10);
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setInput("");
    setNote("");
    setSending(true);
    try {
      const r = await api.chat.send({ guestId, threadId, message, context: getContext(), history });
      setMsgs((m) => [...m, { role: "assistant", content: r.reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: `Sorry, something went wrong: ${(e as Error).message}` }]);
    } finally {
      setSending(false);
    }
  }

  function newChat() {
    setThreadId(newThreadId());
    setMsgs([]);
    setNote("Started a new chat.");
  }

  const suggestions = hasPlan
    ? ["What should I pack?", "Do I need a visa?", "Summarise my trip", "Best time to visit?"]
    : ["Suggest a 5-day trip under ₹50,000", "Best places to visit in December?", "Beach or mountains for a family?"];

  return (
    <>
      <button className={"copilot-fab" + (raised ? " raised" : "")} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="copilot">
        <span className="fab-dot" aria-hidden="true">Σ</span> Sigma Copilot
      </button>

      {open && (
        <aside className="copilot" id="copilot" role="dialog" aria-label="Sigma Copilot">
          <header className="copilot-head">
            <div>
              <strong>Sigma Copilot</strong>
              <small>Answers about your trip · powered by Gemini</small>
            </div>
            <div className="copilot-head-actions">
              <button className="btn" onClick={newChat} disabled={sending}>New chat</button>
              <button className="btn icon" onClick={() => setOpen(false)} aria-label="Close Sigma Copilot">✕</button>
            </div>
          </header>

          <div className="copilot-msgs" ref={listRef}>
            <div className="msg assistant">{WELCOME}</div>
            {msgs.map((m, i) => <div key={i} className={`msg ${m.role}`}>{m.role === "assistant" ? formatReply(m.content) : m.content}</div>)}
            {sending && <div className="msg assistant typing" aria-live="polite"><span /><span /><span /></div>}
            {note && <p className="fine" style={{ textAlign: "center" }}>{note}</p>}
          </div>

          {msgs.length === 0 && (
            <div className="copilot-suggest">
              {suggestions.map((s) => <button key={s} className="chip" onClick={() => send(s)} disabled={sending}>{s}</button>)}
            </div>
          )}

          <form className="copilot-input" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <textarea
              ref={inputRef}
              value={input}
              rows={2}
              maxLength={1000}
              placeholder={hasPlan ? "Ask about your plan…" : "Ask about any trip…"}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }}
            />
            <button className="btn solid" type="submit" disabled={sending || !input.trim()}>Send</button>
          </form>
        </aside>
      )}
    </>
  );
}
