/** Random ids kept in this browser: who the guest is, and the current Copilot conversation. No login needed. */
const uuid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (+c ^ (Math.random() * 16) >> (+c / 4)).toString(16));

function stored(key: string): string {
  try {
    const v = localStorage.getItem(key);
    if (v && /^[0-9a-f-]{36}$/i.test(v)) return v;
    const n = uuid();
    localStorage.setItem(key, n);
    return n;
  } catch {
    return uuid(); // storage blocked: works for this visit only
  }
}

export const getGuestId = () => stored("sigma-guest-id");
export const getThreadId = () => stored("sigma-copilot-thread");
export function newThreadId(): string {
  const n = uuid();
  try { localStorage.setItem("sigma-copilot-thread", n); } catch { /* ignore */ }
  return n;
}
