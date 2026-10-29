import { dayShift, hm, rupees, travellers, type FlightOption, type ShortlistItem } from "../shared/flights.js";
import { properName } from "../shared/voice.js";
import { AIRPORTS } from "../shared/airports.js";

/**
 * The email Sunny sends the customer with the itinerary PDF attached: a short, friendly summary of
 * Sunny's chosen options (built on the server from the saved shortlist, not from text the browser sends),
 * an optional note from Sunny, and how to book. Inline styles for email apps.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const day = (iso: string) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const clock = (s: string) => (/\s(\d{1,2}:\d{2})/.exec(s)?.[1] ?? "").padStart(5, "0");

export const SIGMA = {
  company: "Sigma Tours & Travels", phone: "214 221 3300", email: "sunny@sigmatravelplan.com",
  web: "sigmatravelplan.com", address: "12959 Jupiter Rd, Ste 100, Dallas, TX 75238",
};

const legLine = (o: FlightOption) => {
  const a = o.legs[0], z = o.legs[o.legs.length - 1], plus = dayShift(a.dep, z.arr);
  const stops = o.layovers.length ? `${o.layovers.length} stop${o.layovers.length > 1 ? "s" : ""} via ${o.layovers.map((l) => l.airport).join(", ")}` : "nonstop";
  return `${o.airline} · ${day(a.dep.slice(0, 10))} ${clock(a.dep)} ${a.from} → ${clock(z.arr)}${plus > 0 ? ` (+${plus})` : ""} ${z.to} · ${stops} · ${hm(o.minutes)}`;
};

export interface CustomerEmail { subject: string; html: string; text: string; filename: string }

export function customerPdfEmail(customerName: string, items: ShortlistItem[], note: string, logo: string): CustomerEmail {
  const name = properName(customerName) || "there";
  const first = name.split(" ")[0];
  const q = items[0].query;
  const o0 = items[0].out;
  const from = o0.legs[0].from, to = o0.legs[o0.legs.length - 1].to;
  // "Kochi" from our airport list; else the airport name Google gives.
  const city = (code: string, name: string) => AIRPORTS.find((a) => a.endsWith(`(${code})`))?.replace(/\s*\([A-Z]{3}\)$/, "") ?? (name || code);
  const cityFrom = city(from, o0.legs[0].fromName), cityTo = city(to, o0.legs[o0.legs.length - 1].toName);
  const when = q.return ? `${day(q.depart)} – ${day(q.return)}` : `${day(q.depart)}, one way`;
  const who = `${travellers(q)} · ${q.cabin}`;
  const subject = `Your flight options: ${from} → ${to} · ${day(q.depart)} · Sigma Travels`;
  const filename = `Sigma-flight-options-${first.replace(/[^A-Za-z0-9]+/g, "")}-${q.depart}.pdf`;

  const C = { ink: "#1d2329", muted: "#6b7480", line: "#e3e6ea", soft: "#f6f7f9", orange: "#f36523", teal: "#0f766e" };
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const rows = items.map((it, i) => {
    const people = it.query.adults + it.query.children + it.query.infants;
    return `<tr><td style="${font}padding:12px 14px;border-bottom:1px solid ${C.line};vertical-align:top">
  <div style="font-size:11px;font-weight:bold;color:${C.orange};letter-spacing:.06em">OPTION ${i + 1}</div>
  <div style="font-size:14px;color:${C.ink};margin-top:3px">${esc(legLine(it.out))}</div>
  ${it.back ? `<div style="font-size:14px;color:${C.ink};margin-top:3px">Return: ${esc(legLine(it.back))}</div>` : ""}
</td><td align="right" style="${font}padding:12px 14px;border-bottom:1px solid ${C.line};vertical-align:top;white-space:nowrap">
  <div style="font-size:16px;font-weight:bold;color:${C.ink}">${esc(rupees(it.price))}</div>
  ${it.price != null && people > 1 ? `<div style="font-size:12px;color:${C.muted}">about ${esc(rupees(Math.round(it.price / people)))} each</div>` : ""}
</td></tr>`;
  }).join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#eef0f3">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;border-collapse:separate;overflow:hidden">
<tr><td style="padding:22px 28px 16px;border-bottom:3px solid ${C.orange}">
  <img src="${esc(logo)}" width="96" height="52" alt="Sigma Tours &amp; Travels" style="display:block;border:0;${font}font-size:18px;font-weight:bold;color:${C.orange}">
</td></tr>
<tr><td style="padding:24px 28px 8px;${font}font-size:15px;line-height:1.55;color:${C.ink}">
  <p style="margin:0 0 12px">Hi ${esc(first)},</p>
  <p style="margin:0 0 12px">Here ${items.length > 1 ? `are ${items.length} flight options` : "is a flight option"} for your trip from <b>${esc(cityFrom)} (${esc(from)})</b> to <b>${esc(cityTo)} (${esc(to)})</b>, ${esc(when)}, for ${esc(who)}. The full details are in the attached PDF.</p>
  ${note ? `<p style="margin:0 0 12px;padding:10px 14px;background:${C.soft};border-left:3px solid ${C.teal};border-radius:6px">${esc(note).replace(/\n/g, "<br>")}</p>` : ""}
</td></tr>
<tr><td style="padding:4px 28px 8px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${C.line}">${rows}</table>
  <div style="${font}font-size:12px;color:${C.muted};margin:8px 0 0">Prices are the total for all travellers, from Google Flights today, and can change until the tickets are booked.</div>
</td></tr>
<tr><td style="padding:16px 28px 24px;${font}font-size:15px;line-height:1.55;color:${C.ink}">
  <p style="margin:0 0 12px">To book, just reply to this email with the option you like, or call us on <a href="tel:+12142213300" style="color:${C.teal};font-weight:bold;text-decoration:none">${SIGMA.phone}</a>.</p>
  <p style="margin:0">Best regards,<br><b>Sunny</b><br>${SIGMA.company}</p>
</td></tr>
<tr><td style="padding:14px 28px 18px;background:${C.soft};${font}font-size:11px;line-height:1.5;color:${C.muted}">
  ${SIGMA.company} · ${SIGMA.address} · ${SIGMA.phone} · ${SIGMA.email} · ${SIGMA.web}
</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Hi ${first},`,
    `Here ${items.length > 1 ? `are ${items.length} flight options` : "is a flight option"} for your trip from ${cityFrom} (${from}) to ${cityTo} (${to}), ${when}, for ${who}. The full details are in the attached PDF.`,
    note,
    items.map((it, i) => `Option ${i + 1}: ${legLine(it.out)}${it.back ? `\n   Return: ${legLine(it.back)}` : ""}\n   ${rupees(it.price)} total`).join("\n\n"),
    "Prices are from Google Flights today and can change until the tickets are booked.",
    `To book, reply to this email with the option you like, or call us on ${SIGMA.phone}.`,
    `Best regards,\nSunny\n${SIGMA.company}\n${SIGMA.address} · ${SIGMA.email} · ${SIGMA.web}`,
  ].filter(Boolean).join("\n\n");

  return { subject, html, text, filename };
}
