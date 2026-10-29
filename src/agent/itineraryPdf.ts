import type { PDFFont, PDFImage, PDFPage, RGB } from "pdf-lib";
import { dayShift, hm, travellers, type FlightOption, type ShortlistItem } from "../../shared/flights";
import { AIRPORTS } from "../lib/airports";
import { safe } from "../lib/pdf";
import { CONTACT_EMAIL } from "../../shared/contact";

/**
 * A minimal one-page (or two) PDF of Sunny's options, to forward to the customer.
 * Built in the browser with pdf-lib (already a dependency): no server call, no key.
 */

const CONTACT = {
  company: "Sigma Tours & Travels",
  address: "12959 Jupiter Rd, Ste 100, Dallas, TX 75238",
  phone: "214 221 3300",
  email: CONTACT_EMAIL,
  web: "sigmatravelplan.com",
};

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "2026-12-15 ..." → "Tue 15 Dec 2026" */
function longDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DOW[d.getUTCDay()]} ${+m[3]} ${MON[+m[2] - 1]} ${m[1]}`;
}
const clock = (s: string) => (/\s(\d{1,2}:\d{2})/.exec(s)?.[1] ?? "").padStart(5, "0");
const inr = (n: number) => "INR " + Math.round(n).toLocaleString("en-IN");
/** "COK" → "Kochi (COK)"; falls back to the airport name Google gives. */
const place = (code: string, name = "") => AIRPORTS.find((a) => a.endsWith(`(${code})`)) ?? (name ? `${name} (${code})` : code);
const today = () => { const d = new Date(); return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };

export interface PdfCustomer { name: string; phone: string; email: string }

/** Makes the PDF (no download): used by Download PDF and by Email PDF. */
export async function buildItineraryPdf(customer: PdfCustomer, items: ShortlistItem[]): Promise<{ bytes: Uint8Array; filename: string }> {
  if (!items.length) throw new Error("Add at least one flight first.");
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.setTitle(`Sigma Travels · Flight options for ${safe(customer.name)}`);
  doc.setAuthor(CONTACT.company);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: PDFImage | null = null;
  try { logo = await doc.embedPng(await (await fetch("/sigma-logo.png")).arrayBuffer()); } catch { logo = null; }

  const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
  // Sigma logo colours, used sparingly: orange for accents, blue for links; the rest is ink and grey.
  const C = { ink: hex("#1d2329"), muted: hex("#6b7480"), line: hex("#e3e6ea"), soft: hex("#f6f7f9"), orange: hex("#f36523"), blue: hex("#008bbf"), white: rgb(1, 1, 1) };

  const PW = 595.28, PH = 841.89, M = 44, W = PW - 2 * M, FOOT = 80;
  let page: PDFPage = doc.addPage([PW, PH]);
  let y = PH - M;
  const text = (s: string, x: number, yy: number, size: number, f: PDFFont = font, color: RGB = C.ink) => {
    const t = safe(s);
    if (t) page.drawText(t, { x, y: yy, size, font: f, color });
  };
  const right = (s: string, xr: number, yy: number, size: number, f: PDFFont = font, color: RGB = C.ink) =>
    text(s, xr - f.widthOfTextAtSize(safe(s), size), yy, size, f, color);
  const label = (s: string, x: number, yy: number) => text(s.toUpperCase(), x, yy, 7.5, bold, C.muted);
  const fit = (s: string, size: number, f: PDFFont, max: number) => {
    let t = safe(s);
    while (t.length > 3 && f.widthOfTextAtSize(t, size) > max) t = t.slice(0, -2);
    return t === safe(s) ? t : t.replace(/\s+\S*$/, "") + "...";
  };

  /* ---- header ---- */
  if (logo) {
    const h = 36, w = (logo.width / logo.height) * h;
    page.drawImage(logo, { x: M, y: y - h, width: w, height: h });
  } else text("Sigma Tours & Travels", M, y - 24, 16, bold, C.orange);
  right("Flight options", PW - M, y - 16, 17, bold);
  right(`Prepared ${today()}`, PW - M, y - 30, 9, font, C.muted);
  y -= 48;
  page.drawRectangle({ x: M, y, width: W, height: 2, color: C.orange });
  y -= 22;

  /* ---- customer + trip ---- */
  const q = items[0].query;
  const first = items[0].out, back = items.find((i) => i.back)?.back ?? null;
  const fromCode = first.legs[0].from, toCode = first.legs[first.legs.length - 1].to;
  const colR = M + W / 2 + 10;
  label("Prepared for", M, y);
  label("Trip", colR, y);
  y -= 16;
  text(customer.name, M, y, 13, bold);
  text(`${place(fromCode, first.legs[0].fromName)}  to  ${place(toCode, first.legs[first.legs.length - 1].toName)}`, colR, y, 11, bold);
  y -= 15;
  const contact = [customer.phone, customer.email].filter(Boolean);
  contact.forEach((c, i) => text(c, M, y - i * 13, 10, font, C.muted));
  text(back ? `${longDate(first.legs[0].dep)}  -  ${longDate(back.legs[0].dep)}` : `${longDate(first.legs[0].dep)} · One way`, colR, y, 10, font, C.muted);
  text(`${travellers(q)} · ${q.cabin}`, colR, y - 13, 10, font, C.muted);
  y -= Math.max(contact.length, 2) * 13 + 14;

  /* ---- options ---- */
  const LEG = 13.5, LAY = 12, HEAD = 44;
  const flightHeight = (o: FlightOption) => 15 + o.legs.length * LEG + Math.min(o.layovers.length, o.legs.length - 1) * LAY + 6;
  const optionHeight = (it: ShortlistItem) => HEAD + flightHeight(it.out) + (it.back ? flightHeight(it.back) : 0) + 4;

  function flight(o: FlightOption, title: string) {
    const a = o.legs[0], z = o.legs[o.legs.length - 1], plus = dayShift(a.dep, z.arr);
    text(`${title} · ${longDate(a.dep)}`, M + 16, y, 9.5, bold);
    right(`${o.layovers.length ? `${o.layovers.length} stop${o.layovers.length > 1 ? "s" : ""}` : "Nonstop"} · ${hm(o.minutes)} total${plus > 0 ? ` · arrives +${plus} day${plus > 1 ? "s" : ""}` : ""}`, PW - M - 16, y, 9, font, C.muted);
    y -= 15;
    o.legs.forEach((l, i) => {
      text(clock(l.dep), M + 16, y, 10, bold);
      text(l.from, M + 52, y, 10, font);
      text("->", M + 80, y, 9, font, C.muted);
      text(clock(l.arr), M + 96, y, 10, bold);
      text(l.to, M + 132, y, 10, font);
      text(fit(`${l.airline} ${l.flightNo}`, 10, font, 170), M + 172, y, 10, font);
      right(`${hm(l.minutes)}${l.plane ? ` · ${fit(l.plane, 9, font, 110)}` : ""}`, PW - M - 16, y, 9, font, C.muted);
      y -= LEG;
      const lay = o.layovers[i];
      if (lay && i < o.legs.length - 1) {
        text(`Layover ${hm(lay.minutes)} in ${fit(place(lay.airport, lay.name), 9, font, 300)}${lay.overnight ? " · overnight" : ""}`, M + 52, y + 1, 9, font, C.orange);
        y -= LAY;
      }
    });
    y -= 6;
  }

  items.forEach((it, i) => {
    const h = optionHeight(it);
    if (y - h < FOOT) { page = doc.addPage([PW, PH]); y = PH - M; }
    const top = y;
    page.drawRectangle({ x: M, y: top - h + 8, width: W, height: h, color: C.soft, borderColor: C.line, borderWidth: 0.75 });
    page.drawRectangle({ x: M, y: top - h + 8, width: 3, height: h, color: C.orange });
    y -= 22;
    text(`OPTION ${i + 1}`, M + 16, y + 1, 8, bold, C.orange);
    const airlines = it.back && it.back.airline !== it.out.airline ? `${it.out.airline} / ${it.back.airline}` : it.out.airline;
    text(fit(airlines, 13, bold, W - 260), M + 70, y, 13, bold);
    const people = it.query.adults + it.query.children + it.query.infants;
    if (it.price != null) {
      right(inr(it.price), PW - M - 16, y, 14, bold);
      right(`total for ${travellers(it.query)}${people > 1 ? ` · about ${inr(it.price / people)} each` : ""}`, PW - M - 16, y - 12, 8.5, font, C.muted);
    } else right("Price on request", PW - M - 16, y, 11, bold, C.muted);
    y -= HEAD - 22;
    flight(it.out, it.back ? "Outbound" : "Flight");
    if (it.back) flight(it.back, "Return");
    y = top - h - 4;
  });

  /* ---- footer on every page ---- */
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    page = p;
    const fy = M + 16;
    p.drawLine({ start: { x: M, y: fy + 16 }, end: { x: PW - M, y: fy + 16 }, thickness: 0.5, color: C.line });
    text("Fares are from Google Flights on the date above and can change until the tickets are booked. Times are local.", M, fy + 4, 8, font, C.muted);
    text(CONTACT.company, M, fy - 10, 8.5, bold);
    text(`${CONTACT.address}  ·  ${CONTACT.phone}  ·  ${CONTACT.email}  ·  ${CONTACT.web}`, M, fy - 22, 8, font, C.muted);
    if (pages.length > 1) right(`Page ${i + 1} of ${pages.length}`, PW - M, fy + 4, 8, font, C.muted);
  });

  const bytes = await doc.save();
  return { bytes, filename: `sigma-flight-options-${customer.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "customer"}-${q.depart}.pdf` };
}

export async function downloadItineraryPdf(customer: PdfCustomer, items: ShortlistItem[]): Promise<void> {
  if (!items.length) return;
  const { bytes, filename } = await buildItineraryPdf(customer, items);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** PDF bytes → base64 for the email request. */
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
