import { money } from "../shared/currency.js";
import { currencyOf, dayShift, hm, type FlightOption } from "../shared/flights.js";
import { sabreName, TITLE_LABEL, type CustomerChoice } from "../shared/choose.js";
import { SIGMA } from "./customerEmail.js";

/**
 * Two short emails when a customer confirms a flight option on the choose page:
 * to Sunny (and the team) so he can book it in Sabre, and to the customer as a receipt.
 * Passport numbers are never put in email; Sunny sees them in the Agent tab.
 */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const day = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const clock = (s: string) => (/\s(\d{1,2}:\d{2})/.exec(s)?.[1] ?? "").padStart(5, "0");

export const flightLine = (o: FlightOption) => {
  const a = o.legs[0], z = o.legs[o.legs.length - 1], plus = dayShift(a.dep, z.arr);
  const stops = o.layovers.length ? `${o.layovers.length} stop${o.layovers.length > 1 ? "s" : ""} via ${o.layovers.map((l) => l.airport).join(", ")}` : "nonstop";
  return `${o.legs.map((l) => l.flightNo).join(" / ")} · ${day(a.dep.slice(0, 10))} ${clock(a.dep)} ${a.from} → ${clock(z.arr)}${plus > 0 ? ` (+${plus})` : ""} ${z.to} · ${stops} · ${hm(o.minutes)}`;
};

const C = { ink: "#2b1a14", muted: "#7a6359", line: "#ecdcd0", soft: "#faf5ef", coral: "#c8472b", green: "#1f7a3f" };
const font = "font-family:Arial,Helvetica,sans-serif;";

function shell(logo: string, body: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4ebe1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4ebe1"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;border-collapse:separate;overflow:hidden">
<tr><td style="padding:18px 28px;background:${C.coral}"><img src="${esc(logo)}" width="44" height="44" alt="Sigma" style="display:inline-block;vertical-align:middle;border:0;border-radius:8px;background:#fff"><span style="${font}font-size:18px;font-weight:bold;color:#fff;vertical-align:middle;margin-left:12px">${SIGMA.company}</span></td></tr>
${body}
<tr><td style="padding:14px 28px 18px;background:${C.soft};${font}font-size:11px;line-height:1.5;color:${C.muted}">${SIGMA.company} · ${SIGMA.address} · ${SIGMA.phone} · ${SIGMA.email}</td></tr>
</table></td></tr></table></body></html>`;
}

function flightBox(c: CustomerChoice) {
  const it = c.item;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.line};border-radius:10px;border-collapse:separate"><tr><td style="${font}padding:14px 16px">
  <div style="font-size:11px;font-weight:bold;color:${C.coral};letter-spacing:.06em">OPTION ${c.option} · ${esc(it.out.airline)}</div>
  <div style="font-size:14px;color:${C.ink};margin-top:6px">${esc(flightLine(it.out))}</div>
  ${it.back ? `<div style="font-size:14px;color:${C.ink};margin-top:4px">Return: ${esc(flightLine(it.back))}</div>` : it.query.return ? `<div style="font-size:13px;color:${C.muted};margin-top:4px">Return on ${esc(day(it.query.return))} (flight chosen when booking)</div>` : ""}
  <div style="font-size:16px;font-weight:bold;color:${C.ink};margin-top:8px">${esc(money(it.price, currencyOf(it)))} <span style="font-size:12px;font-weight:normal;color:${C.muted}">total, as shown on ${esc(day(c.item.addedAt.slice(0, 10)))}</span></div>
</td></tr></table>`;
}

const names = (c: CustomerChoice) => c.passengers.map((p) => `${TITLE_LABEL[p.title]} ${p.given} ${p.surname}`);

/** To Sunny and the team: what to book. */
export function choiceForSunny(customer: string, c: CustomerChoice, agentUrl: string, logo: string) {
  const it = c.item, route = `${it.out.legs[0].from} → ${it.out.legs[it.out.legs.length - 1].to}`;
  const subject = `✅ ${customer} chose option ${c.option}: ${it.out.airline} ${route} · ${c.passengers.length} traveller${c.passengers.length > 1 ? "s" : ""}`;
  const rows = c.passengers.map((p) => `<tr><td style="${font}padding:7px 10px;border-bottom:1px solid ${C.line};font-family:Menlo,Consolas,monospace;font-size:13px">${esc(sabreName(p))}</td><td style="${font}padding:7px 10px;border-bottom:1px solid ${C.line};font-size:13px;color:${C.muted}">${p.type} · DOB ${esc(day(p.dob))} · ${esc(p.nationality)}</td></tr>`).join("");
  const html = shell(logo, `<tr><td style="padding:24px 28px;${font}font-size:15px;line-height:1.55;color:${C.ink}">
  <p style="margin:0 0 12px"><b>${esc(customer)}</b> confirmed a flight and entered the travellers' details. Book it in Sabre, then send the payment link.</p>
  ${flightBox(c)}
  <p style="margin:16px 0 6px;font-size:12px;font-weight:bold;color:${C.muted};letter-spacing:.06em">TRAVELLERS (AS IN PASSPORT)</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
  <p style="margin:12px 0 0;font-size:13px;color:${C.muted}">Contact: ${esc(c.contact.email)} · ${esc(c.contact.phone)}${c.notes ? `<br>Note: ${esc(c.notes)}` : ""}</p>
  <p style="margin:18px 0 0"><a href="${esc(agentUrl)}" style="display:inline-block;background:${C.coral};color:#fff;text-decoration:none;font-weight:bold;padding:11px 18px;border-radius:9px">Open in the Agent tab</a></p>
  <p style="margin:10px 0 0;font-size:12px;color:${C.muted}">Passport numbers aren't sent by email. They're in the Agent tab.</p>
</td></tr>`);
  const text = [`${customer} chose option ${c.option}.`, flightLine(it.out), it.back ? `Return: ${flightLine(it.back)}` : "", `Travellers: ${c.passengers.map(sabreName).join(", ")}`, `Contact: ${c.contact.email} · ${c.contact.phone}`, c.notes ? `Note: ${c.notes}` : "", `Open: ${agentUrl}`].filter(Boolean).join("\n");
  return { subject, html, text };
}

/** To the customer: a receipt of what they confirmed. */
export function choiceForCustomer(firstName: string, c: CustomerChoice, logo: string) {
  const subject = `We've got your choice: ${c.item.out.airline}, option ${c.option} · Sigma Travels`;
  const html = shell(logo, `<tr><td style="padding:24px 28px;${font}font-size:15px;line-height:1.6;color:${C.ink}">
  <p style="margin:0 0 12px">Hi ${esc(firstName)},</p>
  <p style="margin:0 0 14px">Thank you. Sunny will book this flight and send you a secure payment link. The final fare can change slightly until the tickets are issued; Sunny will confirm it.</p>
  ${flightBox(c)}
  <p style="margin:16px 0 6px;font-size:12px;font-weight:bold;color:${C.muted};letter-spacing:.06em">TRAVELLERS</p>
  <p style="margin:0">${names(c).map(esc).join("<br>")}</p>
  <p style="margin:16px 0 0">Something wrong? Open the link in the flight-options email again to change it, or call Sunny on <a href="tel:+12142213300" style="color:${C.coral};font-weight:bold;text-decoration:none">${SIGMA.phone}</a>.</p>
  <p style="margin:16px 0 0">Best regards,<br><b>Sunny</b><br>${SIGMA.company}</p>
</td></tr>`);
  const text = [`Hi ${firstName},`, "Thank you. Sunny will book this flight and send you a secure payment link.", flightLine(c.item.out), c.item.back ? `Return: ${flightLine(c.item.back)}` : "", `Travellers: ${names(c).join(", ")}`, `Questions? Call ${SIGMA.phone}.`, `Sunny, ${SIGMA.company}`].filter(Boolean).join("\n");
  return { subject, html, text };
}
