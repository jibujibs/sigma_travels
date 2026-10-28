import { hm, rupees, topThree, travellers, type VoiceFlights } from "../shared/flights.js";
import type { VoiceTrip } from "../shared/voice.js";
import type { VoiceRow } from "./supabase.js";

/**
 * The email Sunny gets for a new voice message: a short, professional summary he can act on from his
 * phone (who, where, when, what they said, the Top 3 flights), with one button to the Agent Desk.
 * Plain HTML tables with inline styles, because that is what email apps (Outlook, Gmail) render reliably.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
/** "dayalu kumar" → "Dayalu Kumar" (customers often type their name in lower case). */
export const properName = (s: string) => s.trim().replace(/\s+/g, " ").replace(/(^|[\s-])(\p{Ll})/gu, (_, a: string, b: string) => a + b.toUpperCase());

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const day = (iso: string, year = false) => {
  const d = new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)));
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ""}`;
};
const short = (iso: string) => `${+iso.slice(8, 10)} ${MON[+iso.slice(5, 7) - 1]}`;
const clock = (s: string) => (/\s(\d{1,2}:\d{2})/.exec(s)?.[1] ?? "").padStart(5, "0");
const placeOf = (p: VoiceTrip["from"]) => (p ? `${p.city}${p.airport ? ` (${p.airport})` : ""}` : "");
const people = (t: VoiceTrip) => travellers(t);

export interface VoiceEmail { subject: string; html: string; text: string }

export function voiceEmail(row: VoiceRow, trip: VoiceTrip | null, flights: VoiceFlights | null, desk: string, logo: string): VoiceEmail {
  const name = properName(row.name) || "A customer";
  const mins = `${Math.floor(row.seconds / 60)}:${String(row.seconds % 60).padStart(2, "0")}`;
  const lang = row.language || "";
  const english = lang === "" || lang === "English";

  /* ---- subject: who, where, when, how many ---- */
  // "San Francisco → Kochi"; with only one end known: "to Dubai" / "from Kochi".
  const route = trip?.from && trip?.to ? `${trip.from.city} → ${trip.to.city}` : trip?.to ? `to ${trip.to.city}` : trip?.from ? `from ${trip.from.city}` : "";
  const headline = trip?.from && trip?.to ? ` for ${route}` : route ? ` for a trip ${route}` : "";
  const dates = trip?.depart ? (trip.return ? `${short(trip.depart)}–${short(trip.return)}` : short(trip.depart)) : "";
  const subject = ["New voice request", [name, route, dates, trip && people(trip)].filter(Boolean).join(" · ")].join(": ");

  /* ---- trip rows ---- */
  const tripRows: [string, string][] = trip ? [
    ["Route", trip.from && trip.to ? `${placeOf(trip.from)} → ${placeOf(trip.to)}` : trip.to ? `To ${placeOf(trip.to)} (from: not said)` : trip.from ? `From ${placeOf(trip.from)} (to: not said)` : ""],
    ["Dates", trip.depart ? (trip.return ? `${day(trip.depart)} – ${day(trip.return, true)}` : `${day(trip.depart, true)}${trip.oneWay ? " · one way" : ""}`) : ""],
    ["Travellers", [people(trip), trip.cabin].filter(Boolean).join(" · ")],
    ["Airlines", trip.airline],
    ["Budget", trip.budget],
    ["Notes", trip.notes],
  ].filter((r): r is [string, string] => Boolean(r[1])) as [string, string][] : [];

  /* ---- flights ---- */
  const search = flights?.search ?? null;
  const top = search ? topThree(search.options, trip?.airline ?? "") : [];
  const roundTrip = Boolean(search?.query.return);
  const searchedAt = search ? new Date(search.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : "";

  /* ---------- HTML ---------- */
  const C = { ink: "#1d2329", muted: "#6b7480", line: "#e3e6ea", soft: "#f6f7f9", orange: "#f36523", blue: "#2f7fd8", yellow: "#fff3b8", yellowInk: "#2b2400", amber: "#fff4e5", amberLine: "#f5c27a", teal: "#0f766e" };
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const label = (s: string) => `<div style="${font}font-size:11px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:${C.muted};margin:0 0 8px">${esc(s)}</div>`;
  const section = (inner: string) => `<tr><td style="padding:0 28px 22px">${inner}</td></tr>`;
  const kv = (rows: [string, string][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows.map(([k, v]) =>
    `<tr><td style="${font}font-size:13px;color:${C.muted};padding:5px 12px 5px 0;width:96px;vertical-align:top">${esc(k)}</td><td style="${font}font-size:14px;color:${C.ink};padding:5px 0;vertical-align:top">${esc(v)}</td></tr>`).join("")}</table>`;

  const contact = [
    row.phone ? `<a href="tel:${esc(row.phone.replace(/[^\d+]/g, ""))}" style="color:${C.teal};text-decoration:none;font-weight:bold">${esc(row.phone)}</a>` : "",
    row.email ? `<a href="mailto:${esc(row.email)}" style="color:${C.teal};text-decoration:none">${esc(row.email)}</a>` : "",
  ].filter(Boolean).join(" &nbsp;·&nbsp; ");

  const said = row.transcript_en
    ? english
      ? `${label("What they said")}<div style="${font}font-size:14px;line-height:1.55;color:${C.ink};background:${C.soft};border-radius:8px;padding:12px 14px">“${esc(row.transcript_en)}”</div>`
      : `${label("What they said")}
<div style="${font}font-size:12px;font-weight:bold;color:${C.blue};margin:0 0 4px">Original · ${esc(lang)}</div>
<div style="${font}font-size:14px;line-height:1.55;color:${C.ink};border-left:3px solid ${C.blue};padding:2px 0 2px 12px;margin:0 0 12px">${esc(row.transcript ?? "")}</div>
<div style="${font}font-size:12px;font-weight:bold;color:${C.muted};margin:0 0 4px">English translation</div>
<div style="${font}font-size:14px;line-height:1.55;color:${C.yellowInk};background:${C.yellow};border-radius:8px;padding:12px 14px">“${esc(row.transcript_en)}”</div>`
    : `${label("What they said")}<div style="${font}font-size:14px;color:${C.ink}">${esc(row.error ?? "The message couldn't be turned into text.")} Listen to it on the Agent Desk.</div>`;

  const missing = trip?.missing.length
    ? `<div style="${font}font-size:14px;line-height:1.5;color:#5c3b00;background:${C.amber};border:1px solid ${C.amberLine};border-radius:8px;padding:10px 14px"><b>Still to confirm with ${esc(name.split(" ")[0])}:</b> ${esc(trip.missing.join(", "))}</div>`
    : "";

  const th = (s: string, align = "left") => `<th align="${align}" style="${font}font-size:11px;font-weight:bold;letter-spacing:.04em;text-transform:uppercase;color:${C.muted};padding:8px 10px;border-bottom:1px solid ${C.line}">${s}</th>`;
  const td = (s: string, align = "left") => `<td align="${align}" style="${font}font-size:14px;color:${C.ink};padding:10px;border-bottom:1px solid ${C.line};vertical-align:top">${s}</td>`;
  const flightsBlock = search
    ? top.length
      ? `${label(`Top ${top.length} flight picks · Google Flights`)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${C.line};border-radius:8px">
<tr>${th("Flight")}${th("Departs")}${th("Stops · time")}${th("Price", "right")}</tr>
${top.map(({ option: o, reason }) => {
  const a = o.legs[0];
  return `<tr>${td(`<b>${esc(o.airline)}</b><br><span style="font-size:12px;color:${C.orange};font-weight:bold">${esc(reason)}</span>`)}${td(`<b>${clock(a.dep)}</b><br><span style="font-size:12px;color:${C.muted}">${esc(day(a.dep.slice(0, 10)))}</span>`)}${td(`${o.layovers.length ? `${o.layovers.length} stop${o.layovers.length > 1 ? "s" : ""}` : "Nonstop"}<br><span style="font-size:12px;color:${C.muted}">${hm(o.minutes)}${o.layovers.length ? ` · via ${esc(o.layovers.map((l) => l.airport).join(", "))}` : ""}</span>`)}${td(`<b>${esc(rupees(o.price))}</b>`, "right")}</tr>`;
}).join("\n")}
</table>
<div style="${font}font-size:12px;color:${C.muted};margin:8px 0 0">${search.options.length} flights found. Prices are the total for ${esc(travellers(search.query))}${roundTrip ? ", round trip" : ", one way"}, from Google Flights at ${searchedAt} IST; they can change.</div>`
      : `${label("Flights")}<div style="${font}font-size:14px;color:${C.ink}">No flights found on Google Flights for these details. Sunny can change the search on the Agent Desk.</div>`
    : flights?.note || trip
      ? `${label("Flights")}<div style="${font}font-size:14px;color:${C.ink}">${esc(flights?.note ?? "Not searched yet: confirm the details above, then search on the Agent Desk.")}</div>`
      : "";

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#eef0f3">
<div style="display:none;max-height:0;overflow:hidden">${esc([name, route, dates].filter(Boolean).join(" · "))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f3"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px;border-collapse:separate;overflow:hidden">
<tr><td style="padding:22px 28px 16px;border-bottom:3px solid ${C.orange}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td><img src="${esc(logo)}" width="96" height="52" alt="Sigma Tours &amp; Travels" style="display:block;border:0;${font}font-size:18px;font-weight:bold;color:${C.orange}"></td>
    <td align="right" style="${font}font-size:12px;font-weight:bold;letter-spacing:.06em;text-transform:uppercase;color:${C.muted}">AI Voice Assistant</td>
  </tr></table>
</td></tr>
<tr><td style="padding:24px 28px 18px;${font}">
  <div style="font-size:16px;color:${C.ink};margin:0 0 6px">Hello Sunny,</div>
  <div style="font-size:20px;font-weight:bold;color:${C.ink};line-height:1.3">You have a new voice request from ${esc(name)}${esc(headline)}.</div>
</td></tr>
${section(`${label("Customer")}<div style="${font}font-size:15px;color:${C.ink};line-height:1.6"><b>${esc(name)}</b>${contact ? `<br>${contact}` : ""}<br><span style="color:${C.muted};font-size:13px">${mins} voice message${lang ? ` · ${esc(lang)}` : ""}</span></div>`)}
${tripRows.length ? section(`${label("Trip")}${kv(tripRows)}`) : ""}
${missing ? section(missing) : ""}
${section(said)}
${flightsBlock ? section(flightsBlock) : ""}
<tr><td align="center" style="padding:6px 28px 26px">
  <a href="${esc(desk)}" style="display:inline-block;background:${C.teal};color:#ffffff;${font}font-size:15px;font-weight:bold;text-decoration:none;padding:12px 26px;border-radius:8px">Open the Agent Desk</a>
  <div style="${font}font-size:12px;color:${C.muted};margin:10px 0 0">Listen to the recording, compare all flights and choose options for ${esc(name.split(" ")[0])}.</div>
</td></tr>
<tr><td style="padding:14px 28px 18px;background:${C.soft};${font}font-size:11px;line-height:1.5;color:${C.muted}">
  Automatic message from the Sigma Travels AI Voice Assistant. Nothing has been booked or sent to the customer.<br>
  Sigma Tours &amp; Travels · 12959 Jupiter Rd, Ste 100, Dallas, TX · 214 221 3300 · sigmatravelplan.com
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  /* ---------- plain text (for apps that don't show HTML) ---------- */
  const text = [
    "Hello Sunny,",
    `You have a new voice request from ${name}${headline}.`,
    ["CUSTOMER", name, [row.phone, row.email].filter(Boolean).join(" · "), `${mins} voice message${lang ? ` · ${lang}` : ""}`].filter(Boolean).join("\n"),
    tripRows.length ? ["TRIP", ...tripRows.map(([k, v]) => `${k}: ${v}`)].join("\n") : "",
    trip?.missing.length ? `STILL TO CONFIRM: ${trip.missing.join(", ")}` : "",
    row.transcript_en ? (english ? `WHAT THEY SAID\n"${row.transcript_en}"` : `WHAT THEY SAID\nOriginal (${lang}): ${row.transcript ?? ""}\nEnglish: "${row.transcript_en}"`) : `WHAT THEY SAID\n${row.error ?? "Couldn't be turned into text."}`,
    top.length ? [`TOP ${top.length} FLIGHT PICKS`, ...top.map(({ option: o, reason }, i) => `${i + 1}. ${o.airline} · ${clock(o.legs[0].dep)} ${day(o.legs[0].dep.slice(0, 10))} · ${o.layovers.length ? `${o.layovers.length} stop` : "nonstop"} · ${hm(o.minutes)} · ${rupees(o.price)} (${reason})`),
      `Total for ${travellers(search!.query)}${roundTrip ? ", round trip" : ", one way"}; from Google Flights, can change.`].join("\n") : flights?.note ?? "",
    `Open the Agent Desk: ${desk}`,
    "Automatic message from the Sigma Travels AI Voice Assistant.",
  ].filter(Boolean).join("\n\n");

  return { subject, html, text };
}
