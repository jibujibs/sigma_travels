# Sigma Travels · AI Trip Planner

Describe a travel idea or pick a famous spot. Google Gemini recommends three destinations, then builds a full plan: flights, a hotel, a rental car, a day-by-day itinerary and a live quote. Save the itinerary as a PDF, keep trips in **My trips**, and ask **Sigma Copilot** questions about the plan.

**Stack:** React 19 + Vite 7 (frontend) · Vercel Functions in `api/` (backend) · Gemini REST API · Supabase (REST API, no SDK) · pdf-lib (PDF in the browser)

```
api/          Vercel Functions: recommend, plan, trips, chat, health, diag
server/       Gemini client, prompts, Copilot, Supabase client, error handling (server only)
shared/       Types, request validation (zod), response normaliser, example plan
src/          React app (components, quote maths, PDF export)
vite.config.ts  Runs api/*.ts locally during `npm run dev`
vercel.json   SPA rewrite + 60 s timeout for the AI routes
```

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, create a file named `.env.local`:

   ```
   GEMINI_API_KEY=your-gemini-key
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-secret-key
   ```

   Copy the values from the original Sigma project's `.env.local`. **Never** prefix them with `VITE_`, because that would put them in the public browser bundle. Without the Supabase lines the app still works; only **Save trip / My trips** and chat history are hidden.
3. Install and start:

   ```
   npm install
   npm run dev
   ```

4. Open http://localhost:5173. Check http://localhost:5173/api/health. It should show `"gemini": true` and `"supabase": true`.

**Optional:** to pin a model, set `GEMINI_MODEL=...` in `.env.local`. If you don't, the server tries current Flash models in order and skips any your key can't use.

## Deploy to Vercel

1. Push this folder to a new GitHub repo. `.env.local` is in `.gitignore`, so the key stays on your machine.
2. In Vercel, go to **Add New → Project** and import the repo. Settings:
   - Framework: **Vite**
   - Build command: `npm run build`
   - Output: `dist`
3. Under **Environment Variables**, add `GEMINI_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, for both Production and Preview.
4. Click **Deploy**, then open `https://<your-app>.vercel.app/api/health` to check.

## Supabase

The app reuses the tables from the original Sigma Travels migrations, so no new SQL is needed:

| Table | Used for |
|---|---|
| `users` | one row per browser (a random guest id, no login) |
| `itineraries` | **Save trip / My trips**: `criteria` = the form, `segments` = the Gemini plan plus the chosen flight/hotel/car, `total` = quote in INR |
| `chat_messages` | Sigma Copilot history (`user` and `assistant` rows) |

Row Level Security is on with no policies, so browsers can't read the tables; only the server, with the secret key, can. `share_logs` (email) is not used. `/api/diag` checks that each table is reachable.

## Sigma Copilot

The **Sigma Copilot** button opens a side chat. Each question is sent to `/api/chat` with a text summary of what's on screen (form, recommendations, current plan and quote), and Gemini answers in the language of the question. If Gemini is unavailable, Copilot replies with a short notice instead of failing. History is saved in Supabase when it's configured.

## Notes

- **Timeouts:** the AI routes may run for up to 300 s (`maxDuration` in `vercel.json`, which is the Hobby limit with Fluid compute). The server asks Gemini for minimal "thinking", moves on to the next model if one gives no answer within 90 s, and stops at 280 s with a readable message.
- **Diagnostics:** open `/api/health?check=1` to see which Gemini models your key can use, plus the status and response time of a tiny test call to each model the app tries.

- Flights, hotels and prices are Gemini's estimates from general knowledge, not live inventory. The app and the PDF both say so.
- The PDF is generated in the browser. Text the standard PDF fonts can't show (₹, some non-Latin scripts) is converted: ₹ becomes "Rs".
- Run `npm run typecheck` for a full TypeScript check. The Vercel build (`vite build`) doesn't type-check.
