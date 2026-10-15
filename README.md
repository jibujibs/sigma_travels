# Sigma Travels · AI Trip Planner

Describe a travel idea or pick a famous spot. Google Gemini recommends three destinations, then builds a full plan: flights, a hotel, a rental car, a day-by-day itinerary and a live quote. You can save the itinerary as a PDF.

**Stack:** React 19 + Vite 7 (frontend) · Vercel Functions in `api/` (backend) · Gemini REST API · pdf-lib (PDF in the browser)

```
api/          Vercel Functions: /api/recommend, /api/plan, /api/health
server/       Gemini client, prompts, error handling (server only)
shared/       Types, request validation (zod), response normaliser, example plan
src/          React app (components, quote maths, PDF export)
vite.config.ts  Runs api/*.ts locally during `npm run dev`
vercel.json   SPA rewrite + 60 s timeout for the AI routes
```

## Run locally

1. Install Node.js 20 or newer.
2. In this folder, create a file named `.env.local` with your Gemini key:

   ```
   GEMINI_API_KEY=your-key-here
   ```

   Copy the key value from your other project's `.env.local`. The name must be `GEMINI_API_KEY` (or `GOOGLE_API_KEY`). **Never** prefix it with `VITE_`, because that would put it in the public browser bundle.
3. Install and start:

   ```
   npm install
   npm run dev
   ```

4. Open http://localhost:5173. Check http://localhost:5173/api/health. It should show `"gemini": true`.

**Optional:** to pin a model, set `GEMINI_MODEL=...` in `.env.local`. If you don't, the server tries current Flash models in order and skips any your key can't use.

## Deploy to Vercel

1. Push this folder to a new GitHub repo. `.env.local` is in `.gitignore`, so the key stays on your machine.
2. In Vercel, go to **Add New → Project** and import the repo. Settings:
   - Framework: **Vite**
   - Build command: `npm run build`
   - Output: `dist`
3. Under **Environment Variables**, add `GEMINI_API_KEY` with your key, for both Production and Preview.
4. Click **Deploy**, then open `https://<your-app>.vercel.app/api/health` to check.

## Notes

- Flights, hotels and prices are Gemini's estimates from general knowledge, not live inventory. The app and the PDF both say so.
- The PDF is generated in the browser. Text the standard PDF fonts can't show (₹, some non-Latin scripts) is converted: ₹ becomes "Rs".
- Run `npm run typecheck` for a full TypeScript check. The Vercel build (`vite build`) doesn't type-check.
