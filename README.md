# Sigma Travels · AI Trip Planner

Ask for exactly what you need: flights, a hotel, a rental car or a full trip plan. Gemini reads the request first, so "flights to Dubai" returns only flights with a flights-only quote, while "5 days in Paris" returns the full plan (flights, hotel, rental car, day-by-day itinerary and a live quote). With no place in mind, describe an idea and Gemini recommends three destinations. Save the result as a PDF, keep trips in **My trips**, and ask **Sigma Copilot** questions about it. Only approved Google accounts can use the app, and each traveller's home airport is remembered.

**Stack:** React 19 + Vite 7 (frontend) · Vercel Functions in `api/` (backend) · Gemini REST API · Supabase database and Auth (REST API, no SDK) · pdf-lib (PDF in the browser)

```
api/          Vercel Functions: intent, recommend, plan, trips, chat, profile, health, diag, pnr, paylink, pay
server/       Gemini client, prompts, Copilot, Supabase client, sign-in check, error handling (server only)
shared/       Types, request validation (zod), response normaliser
src/          React app (sign-in, components, quote maths, PDF export)
vite.config.ts  Runs api/*.ts locally during `npm run dev`
vercel.json   SPA rewrite + time limits (300 s for recommend, plan and chat)
```

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, create a file named `.env.local`:

   ```
   GEMINI_API_KEY=your-gemini-key
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-secret-key
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

   The first three are server secrets. **Never** prefix them with `VITE_`, because that would put them in the public browser bundle. The two `VITE_` lines are public on purpose: the browser needs them to sign in with Google (see **Sign-in** below).
3. Install and start:

   ```
   npm install
   npm run dev
   ```

4. Open http://localhost:5173 and sign in with an approved Google account. http://localhost:5173/api/health should show `"gemini": true` and `"supabase": true`.

**Optional:** to pin a model, set `GEMINI_MODEL=...` in `.env.local`. If you don't, the server tries current Flash models in order and skips any your key can't use.

## Deploy to Vercel

1. Push this folder to a new GitHub repo. `.env.local` is in `.gitignore`, so the key stays on your machine.
2. In Vercel, go to **Add New → Project** and import the repo. Settings:
   - Framework: **Vite**
   - Build command: `npm run build`
   - Output: `dist`
3. Under **Environment Variables**, add `GEMINI_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Secret), and `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (Config).
4. Click **Deploy**, then open `https://<your-app>.vercel.app/api/health` to check.

## Supabase

The app reuses the tables from the original Sigma Travels migrations, plus one table and three columns for sign-in:

| Table | Used for |
|---|---|
| `users` | one row per Google account: `auth_user_id` (Supabase Auth user), `email`, `home_airport`. Older rows have a browser `guest_id` |
| `allowed_emails` | the accounts allowed to use the app (lower-case emails) |
| `itineraries` | **Save trip / My trips**: `criteria` = the form, `segments` = the Gemini plan plus the chosen flight/hotel/car, `total` = quote in INR |
| `chat_messages` | Sigma Copilot history (`user` and `assistant` rows) |
| `payment_links` | payment links for Sabre PNRs (see **Booking & payment**) |

Row Level Security is on with no policies, so browsers can't read the tables; only the server, with the secret key, can. `/api/diag` checks that each table is reachable.

The sign-in columns and table were added with:

```sql
alter table public.users
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete cascade,
  add column if not exists email text,
  add column if not exists home_airport text;
alter table public.users alter column guest_id drop not null;
create table if not exists public.allowed_emails (
  email text primary key check (email = lower(email)), note text, created_at timestamptz not null default now()
);
alter table public.allowed_emails enable row level security;
```

## Sign-in (Google)

1. Opening the site without signing in shows only **Sign in with Google**.
2. `src/lib/auth.ts` sends the browser to Supabase Auth, which hands over to Google (OAuth with PKCE). Google sends the traveller back with a one-time code, which is swapped for an access token (about an hour) and a refresh token kept in the browser.
3. Every API call carries the token. `server/auth.ts` asks Supabase Auth who it belongs to and checks the email is in `allowed_emails`. Without a valid, approved token, `intent`, `recommend`, `plan`, `chat`, `trips`, `profile` and `diag` answer 401 or 403 and never call Gemini.
4. On the first sign-in the traveller picks a **home airport**. It is saved in `users.home_airport` and fills **From** on every device; the account menu has **Change** and **Sign out**. Trips saved earlier as a guest in the same browser move to the account.

**Setup:** Google Cloud → Google Auth Platform: a Web client with JavaScript origins `http://localhost:5173` and the Vercel URL, and redirect URI `https://<project>.supabase.co/auth/v1/callback`. While the app is in *Testing*, add each person under **Audience → Test users**. Supabase → Authentication → Sign In / Providers → Google: paste the client ID and secret; URL Configuration: Site URL = the Vercel URL, Redirect URLs = `http://localhost:5173/**` and `https://<your-app>.vercel.app/**`.

**Give someone access:** add their email (lower case) to `allowed_emails` in the Supabase Table Editor, and to Google's test users while the app is in Testing.

## Booking & payment (Agent Desk)

The first page after sign-in is the **Agent Desk**; the AI planner is the second tab (`/planner`).

1. The agent creates the PNR in Sabre, types it on the desk and presses **Search** (`GET /api/pnr`).
2. The desk shows passengers, flights, fare, fare rules, contact and the ticketing deadline. The agent confirms the itinerary with the traveller and ticks **I've verified this itinerary**.
3. The **checklist** (names vs passports, flights, amount, fare rules, deadline, contact) unlocks the payment card.
4. The agent picks **Stripe** or **Sabre**, checks the customer email and presses **Generate payment link** (`POST /api/paylink`). The amount always comes from the booking on the server. The link (`/pay/<token>`) is shown with **Copy** and an email preview; it expires after 3 days or at the ticketing deadline, whichever is first, and a new link expires the old one.
5. The customer opens the link (no sign-in), reviews the booking (passport numbers and contact details are hidden), ticks the confirmation and pays:
   - **Stripe:** Stripe Checkout (Stripe's own page, so card details never reach our site). On return, `/api/pay` checks the session with Stripe and marks the link paid.
   - **Sabre:** a demo card page until Sabre payment is connected. Only the last 4 digits are sent; no money is taken.
6. The desk checks every few seconds and shows **Payment received** with the reference.

**Tabs:** the top bar has three tabs: **AGENT** (the desk above, `/`), **CUSTOMER** (`/customer`) and **AI Trip Planner** (`/planner`).

**Customer tab, "Manage my booking":** the traveller enters their PNR and booking email (`POST /api/booking`, public). The email must match the booking's contact email or the email the payment link went to; a wrong PNR and a wrong email get the same "not found" answer. It shows flights, fare and payment status, with a **Pay** button when the agent has sent an open payment link. Passport digits and phone numbers are never returned.

**Contact footer:** every page ends with the Sigma Travel & Tours contact details from sigmatravelplan.com (`src/components/ContactFooter.tsx`).

**Sabre:** until Sabre API access is set up, the desk uses sample PNRs (`server/sabre-mock.ts`): `SGM7QX` (Kochi–Dubai, 2 adults), `TRV4LM` (Trivandrum–Singapore, family), `SFO2NY` (USD) and `PAID01` (already paid). `SABRE_MODE=live` is reserved for the real Sabre Booking Management API.

**Environment variables:** `STRIPE_SECRET_KEY=sk_test_...` (Secret; without it, Stripe links fall back to the demo card page). Optional `SITE_URL=https://<your-app>.vercel.app` fixes the host used in payment links.

**Table:**

```sql
create table public.payment_links (
  id uuid primary key default gen_random_uuid(),
  token text unique not null,
  pnr text not null,
  rail text not null check (rail in ('stripe','sabre')),
  status text not null default 'sent' check (status in ('sent','paid','expired')),
  amount numeric not null,
  currency text not null,
  customer_email text not null,
  agent_email text not null,
  stripe_session_id text,
  reference text,
  paid_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index on public.payment_links (pnr, created_at desc);
alter table public.payment_links enable row level security;
```

## Only what you ask for

1. `POST /api/intent` sends the free text to Gemini (`intentPrompt` in `server/prompts.ts`). It returns the place, if one is named, and which parts were asked for: flights, hotel, rental car, day-by-day plan.
2. The **I need** ticks on the form update to match. If a place is named, the app skips the three suggestions and goes straight to it.
3. `POST /api/plan` asks Gemini only for the ticked parts (`planPrompt`), and `shared/normalize.ts` drops anything else. The page, quote, PDF and Copilot context show only those parts.
4. The traveller can change the ticks and press **Update results** to rebuild for the same place.

A request that asks for a whole trip, or names only a place or an idea, gets the full plan. If reading the request fails, the app carries on as a normal search. Trips saved before this feature have no `needs` and open as full trips. Return flights are always included; trips can be 1 to 10 days.

## Sigma Copilot

The **Sigma Copilot** button opens a side chat. Each question is sent to `/api/chat` with a text summary of what's on screen (form, recommendations, current plan and quote), and Gemini answers in English. If Gemini is unavailable, Copilot replies with a short notice instead of failing. History is saved in Supabase under the signed-in account.

## Notes

- **Timeouts:** the AI routes may run for up to 300 s (`maxDuration` in `vercel.json`, which is the Hobby limit with Fluid compute). The server asks Gemini for minimal "thinking", moves on to the next model if one gives no answer within 90 s, and stops at 280 s with a readable message.
- **Diagnostics:** open `/api/health?check=1` to see which Gemini models your key can use, plus the status and response time of a tiny test call to each model the app tries.

- Flights, hotels and prices are Gemini's estimates from general knowledge, not live inventory. The app and the PDF both say so.
- The PDF is generated in the browser. Text the standard PDF fonts can't show (₹, some non-Latin scripts) is converted: ₹ becomes "Rs".
- Run `npm run typecheck` for a full TypeScript check. The Vercel build (`vite build`) doesn't type-check.
