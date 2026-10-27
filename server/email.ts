/**
 * Notification emails through Resend's REST API (no SDK).
 * RESEND_API_KEY and NOTIFY_EMAIL are server settings. Until a domain is verified in Resend,
 * mail is sent from onboarding@resend.dev and can only go to the Resend account's own address,
 * which is what we want for now ("send it to our email").
 */

export const emailReady = (): boolean => Boolean(process.env.RESEND_API_KEY?.trim() && process.env.NOTIFY_EMAIL?.trim());

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Sends one email. Never throws: returns the reason instead, so a mail problem never loses a customer's message. */
export async function sendEmail(subject: string, lines: string[], link?: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const to = process.env.NOTIFY_EMAIL?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];
  if (!key || !to.length) return { ok: false, reason: "Email isn't set up (RESEND_API_KEY and NOTIFY_EMAIL)." };
  const from = process.env.EMAIL_FROM?.trim() || "Sigma Travels <onboarding@resend.dev>";
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#0d2a27">
${lines.map((l) => `<p style="margin:0 0 10px">${esc(l).replace(/\n/g, "<br>")}</p>`).join("\n")}
${link ? `<p style="margin:16px 0 0"><a href="${esc(link)}" style="background:#0f766e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open the Agent Desk</a></p>` : ""}
</div>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to, subject, html, text: [...lines, link ?? ""].join("\n\n") }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    console.warn(`[email] Resend ${res.status}: ${body.message ?? ""}`);
    return { ok: false, reason: `Resend ${res.status}: ${body.message ?? "error"}` };
  } catch {
    return { ok: false, reason: "Couldn't reach Resend." };
  }
}
