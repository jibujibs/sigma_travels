import type { PDFFont, PDFPage, RGB } from "pdf-lib";
import { addDays, fmtDate, fmtLong, inrPlain, originCity, originCode, parseISO } from "./format";
import { buildDays, FOOD_LABEL, picks, price, type PlanState } from "./trip";

/* Standard PDF fonts only cover Latin-1/Windows-1252. Map what we can, drop the rest. */
const CP1252_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
function safe(input: string): string {
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

export async function downloadTripPdf(state: PlanState): Promise<void> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const { plan, brief } = state;
  const days = buildDays(state);
  const q = price(state);
  const { out, ret, hotel, car } = picks(state);
  const start = parseISO(brief.start);
  const end = addDays(start, plan.days.length - 1);
  const dest = `${plan.destination.city}${plan.destination.country ? ", " + plan.destination.country : ""}`;

  const doc = await PDFDocument.create();
  doc.setTitle(`Sigma Travels · ${dest} itinerary`);
  doc.setAuthor("Sigma Travels");
  doc.setCreator("Sigma Travels Trip Planner");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const C = {
    teal: rgb(15 / 255, 118 / 255, 110 / 255), ink: rgb(13 / 255, 42 / 255, 39 / 255), muted: rgb(85 / 255, 112 / 255, 108 / 255),
    line: rgb(213 / 255, 227 / 255, 224 / 255), soft: rgb(223 / 255, 241 / 255, 238 / 255), zebra: rgb(245 / 255, 249 / 255, 248 / 255),
    white: rgb(1, 1, 1), sand: rgb(180 / 255, 83 / 255, 42 / 255), gold: rgb(168 / 255, 115 / 255, 12 / 255),
  };
  const PW = 595.28, PH = 841.89, M = 42, W = PW - 2 * M, BOTTOM = M + 24;
  let page: PDFPage = doc.addPage([PW, PH]);
  let y = PH - M;

  const newPage = () => { page = doc.addPage([PW, PH]); y = PH - M; };
  const ensure = (h: number) => { if (y - h < BOTTOM) newPage(); };
  const width = (s: string, size: number, f: PDFFont) => f.widthOfTextAtSize(safe(s), size);
  const draw = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color: RGB = C.ink) => {
    const t = safe(s);
    if (t) page.drawText(t, { x, y: yy, size, font: f, color });
  };
  function wrap(text: string, size: number, f: PDFFont, max: number): string[] {
    const words = safe(text).split(" ").filter(Boolean);
    const lines: string[] = [];
    let cur = "";
    for (let w of words) {
      while (f.widthOfTextAtSize(w, size) > max && w.length > 1) { // break very long words
        let i = w.length - 1;
        while (i > 1 && f.widthOfTextAtSize(w.slice(0, i), size) > max) i--;
        if (cur) { lines.push(cur); cur = ""; }
        lines.push(w.slice(0, i));
        w = w.slice(i);
      }
      const next = cur ? cur + " " + w : w;
      if (f.widthOfTextAtSize(next, size) <= max) cur = next;
      else { if (cur) lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [""];
  }
  function para(text: string, size = 10, f: PDFFont = font, color: RGB = C.ink, x = M, max = W, lead = 1.4) {
    for (const l of wrap(text, size, f, max)) { ensure(size * lead); draw(l, x, y - size, size, f, color); y -= size * lead; }
  }
  function heading(text: string) {
    ensure(48);
    y -= 14;
    draw(text, M, y - 14, 14, bold, C.teal);
    y -= 22;
    page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: C.line });
    y -= 8;
  }
  interface Col { h: string; w: number; align?: "right" }
  function table(cols: Col[], rows: string[][], opts: { boldLast?: boolean; flag?: (i: number) => boolean } = {}) {
    const size = 9, lead = 11.5, pad = 5;
    const widths = cols.map((c) => c.w * W);
    const header = () => {
      ensure(20 + lead * 2);
      page.drawRectangle({ x: M, y: y - 18, width: W, height: 18, color: C.teal });
      let x = M;
      cols.forEach((c, i) => {
        const tx = c.align === "right" ? x + widths[i] - pad - width(c.h, 8.5, bold) : x + pad;
        draw(c.h, tx, y - 12.5, 8.5, bold, C.white);
        x += widths[i];
      });
      y -= 18;
    };
    header();
    rows.forEach((r, ri) => {
      const isBold = opts.boldLast && ri === rows.length - 1;
      const f = isBold ? bold : font;
      const cells = r.map((c, i) => wrap(c, size, f, widths[i] - 2 * pad));
      const h = Math.max(...cells.map((c) => c.length)) * lead + 2 * pad - 2;
      if (y - h < BOTTOM) { newPage(); header(); }
      if (ri % 2 === 1 || isBold) page.drawRectangle({ x: M, y: y - h, width: W, height: h, color: isBold ? C.soft : C.zebra });
      let x = M;
      cells.forEach((lines, i) => {
        lines.forEach((l, li) => {
          const ty = y - pad - size + 1 - li * lead;
          const tx = cols[i].align === "right" ? x + widths[i] - pad - f.widthOfTextAtSize(l, size) : x + pad;
          draw(l, tx, ty, size, f, opts.flag?.(ri) && i === 1 ? C.sand : C.ink);
        });
        x += widths[i];
      });
      y -= h;
      page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.5, color: C.line });
    });
    y -= 6;
  }

  /* ---- cover band ---- */
  const band = 104;
  page.drawRectangle({ x: 0, y: PH - band, width: PW, height: band, color: C.teal });
  draw("SIGMA TRAVELS · TRIP ITINERARY", M, PH - 32, 9, bold, C.white);
  draw(dest, M, PH - 62, 24, bold, C.white);
  draw(`${originCity(brief.origin)} (${originCode(brief.origin)}) -> ${plan.destination.city} (${plan.destination.airport})  ·  ${fmtLong(start)} – ${fmtLong(end)}  ·  ${brief.pax} adult${brief.pax > 1 ? "s" : ""}`, M, PH - 84, 10, font, C.white);
  y = PH - band - 18;

  /* ---- summary box ---- */
  const boxH = 64;
  page.drawRectangle({ x: M, y: y - boxH, width: W, height: boxH, color: C.soft });
  draw("ESTIMATED TOTAL", M + 14, y - 20, 8, bold, C.muted);
  draw(inrPlain(q.total), M + 14, y - 44, 22, bold, C.ink);
  draw(`${inrPlain(q.perPerson)} per person`, M + 14, y - 57, 9, font, C.muted);
  const meta: [string, string][] = [["Days", `${plan.days.length} days, ${q.nights} nights`], ["Style", brief.budget], ["Food", FOOD_LABEL[state.food]], ["Rental car", state.carOn && car && plan.car_days ? `${plan.car_days} day${plan.car_days > 1 ? "s" : ""}` : "Not included"]];
  meta.forEach(([k, v], i) => {
    const x = M + 230 + (i % 2) * 140, yy = y - 22 - Math.floor(i / 2) * 24;
    draw(k.toUpperCase(), x, yy, 7.5, bold, C.muted);
    draw(v, x, yy - 11, 9.5, font, C.ink);
  });
  y -= boxH + 12;
  if (plan.destination.summary) para(plan.destination.summary, 10, font, C.muted);

  /* ---- flights ---- */
  heading("Flights");
  const fr = (leg: string, f: typeof out) => [leg, f.airline, f.route, f.depart, `${f.arrive}${f.arrive_next_day ? " (+1)" : ""}`, [f.stops, f.duration].filter(Boolean).join(", "), inrPlain(f.fare_inr)];
  table(
    [{ h: "Leg", w: 0.15 }, { h: "Airline", w: 0.18 }, { h: "Route", w: 0.15 }, { h: "Departs", w: 0.09 }, { h: "Arrives", w: 0.1 }, { h: "Stops", w: 0.19 }, { h: "Fare pp", w: 0.14, align: "right" }],
    [fr(`Out · ${fmtDate(start)}`, out), fr(`Return · ${fmtDate(end)}`, ret)],
  );

  /* ---- stay & car ---- */
  heading("Hotel and rental car");
  const rows: string[][] = [
    ["Hotel", `${hotel.name}${hotel.area ? ", " + hotel.area : ""}${hotel.tier ? " (" + hotel.tier + ")" : ""}`, `${inrPlain(hotel.rate_inr)} / room / night · ${q.rooms} room${q.rooms > 1 ? "s" : ""} × ${q.nights} nights${plan.hotel_tax_pct ? ` + ${plan.hotel_tax_pct}% tax` : ""}`],
  ];
  if (state.carOn && car && plan.car_days > 0) rows.push(["Rental car", `${car.name}${car.company ? " · " + car.company : ""} (${car.mode}, ${car.seats} seats)`, `${inrPlain(car.daily_inr)} / day × ${plan.car_days} day${plan.car_days > 1 ? "s" : ""}${car.includes ? " · " + car.includes : ""}`]);
  else rows.push(["Rental car", "Not included", plan.car_note || ""]);
  table([{ h: "Item", w: 0.16 }, { h: "Choice", w: 0.42 }, { h: "Details", w: 0.42 }], rows);

  /* ---- itinerary ---- */
  heading("Day-by-day itinerary");
  days.forEach((d, i) => {
    ensure(22 + 40);
    y -= 4;
    draw(`Day ${i + 1} · ${fmtDate(d.date)} · ${d.title}`, M, y - 11, 11, bold, C.ink);
    y -= 18;
    table(
      [{ h: "Time", w: 0.1 }, { h: "Activity", w: 0.42 }, { h: "Notes", w: 0.48 }],
      d.stops.map((s) => [s.time || "-", s.name + (s.kind === "flight" ? "  [flight]" : s.kind === "hotel" ? "  [hotel]" : s.kind === "car" ? "  [car]" : "") + (s.isClosed ? "  (closed this day)" : ""), s.note]),
      { flag: (ri) => d.stops[ri].isClosed },
    );
  });

  /* ---- costs ---- */
  heading("Estimated cost");
  table(
    [{ h: "Item", w: 0.24 }, { h: "How it adds up", w: 0.52 }, { h: "Amount", w: 0.24, align: "right" }],
    [...q.lines.map((l) => [l.label, l.why, inrPlain(l.value)]), ["Total", `${inrPlain(q.perPerson)} per person`, inrPlain(q.total)]],
    { boldLast: true },
  );

  /* ---- tips ---- */
  if (plan.tips.length) {
    heading("Good to know");
    plan.tips.forEach((t) => {
      const lines = wrap(t, 10, font, W - 14);
      ensure(lines.length * 14);
      draw("•", M + 2, y - 10, 10, bold, C.teal);
      lines.forEach((l) => { draw(l, M + 14, y - 10, 10); y -= 14; });
      y -= 2;
    });
  }

  /* ---- footer on every page ---- */
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 6 }, end: { x: PW - M, y: M + 6 }, thickness: 0.5, color: C.line });
    p.drawText(safe("Sigma Travels · Prices are AI estimates generated with Gemini, not live fares. Verify before booking."), { x: M, y: M - 8, size: 7.5, font, color: C.muted });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: PW - M - font.widthOfTextAtSize(label, 7.5), y: M - 8, size: 7.5, font, color: C.muted });
  });

  const bytes = await doc.save();
  const blob = new Blob([bytes as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sigma-trip-${plan.destination.city.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${brief.start}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
