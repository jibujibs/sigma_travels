import { z } from "zod";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { effectiveStatus, originOf, toPayView } from "../server/payments.js";
import { getBooking } from "../server/sabre.js";
import { createCheckout, getCheckout, stripeReady } from "../server/stripe.js";
import { syncPaymentToSabre } from "../server/sabre-sync.js";
import { paymentLinkByToken, updatePaymentLink, type PaymentLinkRow } from "../server/supabase.js";

/**
 * The customer's payment page (public: the secret token in the link is the key).
 * GET  /api/pay?token=…                         → what the customer reviews
 * POST /api/pay { token, action: "checkout" }    → Stripe Checkout URL
 * POST /api/pay { token, action: "confirm", sessionId } → after Stripe, record the payment
 * POST /api/pay { token, action: "demo-pay", last4 }    → demo card page (Sabre rail / no Stripe key)
 */

const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{24,64}$/, "This payment link isn't valid.");

async function load(token: string): Promise<{ row: PaymentLinkRow; view: ReturnType<typeof toPayView> }> {
  const row = await paymentLinkByToken(token);
  if (!row) throw new HttpError(404, "This payment link isn't valid. Ask your travel agent for a new one.");
  const { booking } = await getBooking(row.pnr);
  return { row, view: toPayView(row, booking, stripeReady()) };
}

function mustBeOpen(row: PaymentLinkRow): void {
  const s = effectiveStatus(row);
  if (s === "paid") throw new HttpError(409, "This booking is already paid.");
  if (s === "expired") throw new HttpError(410, "This payment link has expired. Ask your travel agent for a new one.");
}

export const GET = handle(async (request) => {
  const token = tokenSchema.parse(new URL(request.url).searchParams.get("token"));
  return json((await load(token)).view);
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("checkout"), token: tokenSchema }),
  z.object({ action: z.literal("confirm"), token: tokenSchema, sessionId: z.string().regex(/^cs_[A-Za-z0-9_]+$/) }),
  z.object({ action: z.literal("demo-pay"), token: tokenSchema, last4: z.string().regex(/^\d{4}$/) }),
]);

export const POST = handle(async (request) => {
  const body = await parseBody(request, bodySchema);
  const { row, view } = await load(body.token);

  if (body.action === "checkout") {
    mustBeOpen(row);
    if (!view.stripe) throw new HttpError(400, "This link uses the demo card page, not Stripe.");
    const s = await createCheckout({
      token: row.token, pnr: row.pnr, amount: Number(row.amount), currency: row.currency, email: row.customer_email,
      description: view.segments.map((x) => `${x.flight} ${x.from}-${x.to} ${x.depart.slice(0, 10)}`).join(" · "),
      origin: originOf(request), expiresAt: new Date(row.expires_at),
    });
    await updatePaymentLink(row.token, { stripe_session_id: s.id });
    return json({ url: s.url });
  }

  if (body.action === "confirm") {
    if (effectiveStatus(row) === "paid") return json(view);
    const s = await getCheckout(body.sessionId);
    if (s.metadata?.token !== row.token) throw new HttpError(400, "This payment doesn't belong to this link.");
    if (s.payment_status !== "paid") return json(view); // not paid (yet): the page keeps the Pay button
    const paid = await updatePaymentLink(row.token, { status: "paid", reference: s.payment_intent ?? s.id, paid_at: new Date().toISOString(), stripe_session_id: s.id }, "sent");
    if (!paid) console.warn(`[pay] ${row.pnr} was already marked paid`);
    else await syncPaymentToSabre(paid); // write the payment into the Sabre PNR so the agent can ticket
    return json((await load(row.token)).view);
  }

  // demo-pay: only when this link doesn't go through Stripe. No card data is sent here, only the last 4 digits.
  mustBeOpen(row);
  if (view.stripe) throw new HttpError(400, "This link is paid on Stripe's page.");
  const ref = `DEMO-${row.rail.toUpperCase()}-${Date.now().toString(36).toUpperCase()}-${body.last4}`;
  const paid = await updatePaymentLink(row.token, { status: "paid", reference: ref, paid_at: new Date().toISOString() }, "sent");
  if (paid) await syncPaymentToSabre(paid);
  return json((await load(row.token)).view);
});
