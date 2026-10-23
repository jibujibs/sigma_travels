import { HttpError } from "./http.js";

/**
 * Minimal Stripe client (REST, no SDK) for payment links.
 * The customer pays on Stripe's own Checkout page, so card details never reach our
 * server (PCI SAQ-A). Works with a test key (sk_test_…) for the demo and a live key later.
 */

export const stripeReady = (): boolean => /^sk_(test|live)_/.test(process.env.STRIPE_SECRET_KEY?.trim() ?? "");
export const stripeIsTest = (): boolean => (process.env.STRIPE_SECRET_KEY ?? "").trim().startsWith("sk_test_");

async function stripe<T>(method: "GET" | "POST", path: string, form?: Record<string, string>): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) throw new HttpError(503, "Stripe isn't set up. Add STRIPE_SECRET_KEY on the server.");
  let res: Response;
  try {
    res = await fetch(`https://api.stripe.com/v1/${path}`, {
      method,
      headers: { authorization: `Bearer ${key}`, ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
      body: form ? new URLSearchParams(form).toString() : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpError(502, "Couldn't reach Stripe. Try again.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    const msg = data.error?.message ?? `HTTP ${res.status}`;
    console.error(`[stripe] ${method} ${path}: ${msg}`);
    throw new HttpError(502, `Stripe: ${msg}`);
  }
  return data;
}

// Currencies Stripe counts in whole units (no cents).
const ZERO_DECIMAL = new Set(["jpy", "krw", "vnd", "clp", "pyg", "ugx", "xaf", "xof"]);
export const toMinor = (amount: number, currency: string) =>
  Math.round(ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount * 100);

export interface CheckoutSession {
  id: string;
  url: string;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  payment_intent: string | null;
  amount_total: number;
  currency: string;
  metadata: Record<string, string>;
}

export function createCheckout(o: {
  token: string; pnr: string; amount: number; currency: string; email: string; description: string; origin: string; expiresAt: Date;
}): Promise<CheckoutSession> {
  // Checkout sessions may stay open 30 minutes to 24 hours.
  const expires = Math.floor(Math.min(o.expiresAt.getTime(), Date.now() + 23.5 * 3600_000) / 1000);
  return stripe<CheckoutSession>("POST", "checkout/sessions", {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": o.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(toMinor(o.amount, o.currency)),
    "line_items[0][price_data][product_data][name]": `Flight booking ${o.pnr}`,
    "line_items[0][price_data][product_data][description]": o.description.slice(0, 300),
    customer_email: o.email,
    "payment_intent_data[receipt_email]": o.email,
    "payment_intent_data[description]": `Sigma Travels · PNR ${o.pnr}`,
    "payment_intent_data[metadata][pnr]": o.pnr,
    "metadata[pnr]": o.pnr,
    "metadata[token]": o.token,
    success_url: `${o.origin}/pay/${o.token}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${o.origin}/pay/${o.token}?cancelled=1`,
    ...(expires > Date.now() / 1000 + 1800 ? { expires_at: String(expires) } : {}),
  });
}

export const getCheckout = (id: string) => stripe<CheckoutSession>("GET", `checkout/sessions/${encodeURIComponent(id)}`);
