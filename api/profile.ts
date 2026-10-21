import { requireUser } from "../server/auth.js";
import { handle, json, parseBody } from "../server/http.js";
import { ensureAuthUser, setHomeAirport } from "../server/supabase.js";
import { guestIdSchema, homeAirportSchema } from "../shared/schemas.js";

/** The signed-in traveller: who they are and their saved home airport. */

// GET /api/profile?guestId=…  (guestId only links this browser's guest trips on the first sign-in)
export const GET = handle(async (request) => {
  const user = await requireUser(request);
  const g = guestIdSchema.safeParse(new URL(request.url).searchParams.get("guestId"));
  const row = await ensureAuthUser(user, g.success ? g.data : undefined);
  return json({ email: user.email, name: user.name, avatar: user.avatar, homeAirport: row.home_airport ?? "" });
});

// PUT /api/profile  { homeAirport }
export const PUT = handle(async (request) => {
  const user = await requireUser(request);
  const { homeAirport } = await parseBody(request, homeAirportSchema);
  const row = await setHomeAirport(user, homeAirport);
  return json({ homeAirport: row.home_airport ?? homeAirport });
});
