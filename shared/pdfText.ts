/** Text helpers for PDFs made with pdf-lib (browser and server). */

/* Standard PDF fonts only cover Latin-1/Windows-1252. Map what we can, drop the rest. */
const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
export function safe(input: string): string {
  const s = String(input ?? "")
    .replace(/→/g, "->").replace(/←/g, "<-").replace(/₹\s?/g, "Rs ").replace(/[\t\r\n]+/g, " ")
    .replace(/[✓✔]/g, "v").replace(/[≈]/g, "~");
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || CP1252_EXTRA.includes(ch)) { out += ch; continue; }
    const base = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    if (base && [...base].every((b) => { const k = b.codePointAt(0) ?? 0; return k >= 0x20 && k <= 0x7e; })) out += base;
  }
  return out.replace(/\s{2,}/g, " ").trim();
}
