# Sigma Travels · AI Trip Planner

Ask for exactly what you need: flights, a hotel, a rental car or a full trip plan. Gemini reads the request first, so "flights to Dubai" returns only flights with a flights-only quote, while "5 days in Paris" returns the full plan (flights, hotel, rental car, day-by-day itinerary and a live quote). With no place in mind, describe an idea and Gemini recommends three destinations. Save the result as a PDF, keep trips in **My trips**, and ask **Sigma Copilot** questions about it.

**Stack:** React 19 + Vite 7 (frontend) · Vercel Functions in `api/` (backend) · Gemini REST API · Supabase (REST API, no SDK) · pdf-lib (PDF in the browser)

```
api/          Vercel Functions: intent, recommend, plan, trips, chat, health, diag
server/       Gemini client, prompts, Copilot, Supabase client, error handling (server only)
shared/       Types, request validation (zod), response normaliser
src/          React app (components, quote maths, PDF export)
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

Row Level Security is on with no policies, so browsers can't read the tables; only the server, with the secret key, can. `/api/diag` checks that each table is reachable.

## Only what you ask for

1. `POST /api/intent` sends the free text to Gemini (`intentPrompt` in `server/prompts.ts`). It returns the place, if one is named, and which parts were asked for: flights, hotel, rental car, day-by-day plan.
2. The **I need** ticks on the form update to match. If a place is named, the app skips the three suggestions and goes straight to it.
3. `POST /api/plan` asks Gemini only for the ticked parts (`planPrompt`), and `shared/normalize.ts` drops anything else. The page, quote, PDF and Copilot context show only those parts.
4. The traveller can change the ticks and press **Update results** to rebuild for the same place.

A request that asks for a whole trip, or names only a place or an idea, gets the full plan. If reading the request fails, the app carries on as a normal search. Trips saved before this feature have no `needs` and open as full trips. Return flights are always included; trips can be 1 to 10 days.

## Sigma Copilot

The **Sigma Copilot** button opens a side chat. Each question is sent to `/api/chat` with a text summary of what's on screen (form, recommendations, current plan and quote), and Gemini answers in English. If Gemini is unavailable, Copilot replies with a short notice instead of failing. History is saved in Supabase when it's configured.

## Notes

- **Timeouts:** the AI routes may run for up to 300 s (`maxDuration` in `vercel.json`, which is the Hobby limit with Fluid compute). The server asks Gemini for minimal "thinking", moves on to the next model if one gives no answer within 90 s, and stops at 280 s with a readable message.
- **Diagnostics:** open `/api/health?check=1` to see which Gemini models your key can use, plus the status and response time of a tiny test call to each model the app tries.

- Flights, hotels and prices are Gemini's estimates from general knowledge, not live inventory. The app and the PDF both say so.
- The PDF is generated in the browser. Text the standard PDF fonts can't show (₹, some non-Latin scripts) is converted: ₹ becomes "Rs".
- Run `npm run typecheck` for a full TypeScript check. The Vercel build (`vite build`) doesn't type-check.
