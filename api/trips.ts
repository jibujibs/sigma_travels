import { requireUser } from "../server/auth.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { deleteTrip, ensureAuthUser, getTrip, listTrips, saveTrip } from "../server/supabase.js";
import { normalizePlan } from "../shared/normalize.js";
import { saveTripSchema } from "../shared/schemas.js";

/** Saved trips, stored in Supabase's existing "itineraries" table, per signed-in account. */

async function account(request: Request): Promise<string> {
  const user = await requireUser(request);
  return (await ensureAuthUser(user)).id;
}

// GET /api/trips           → list (newest first)
// GET /api/trips?id=…      → one trip with its full plan
export const GET = handle(async (request) => {
  const userId = await account(request);
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const trip = await getTrip(userId, id);
    if (!trip) throw new HttpError(404, "Trip not found");
    return json({ trip });
  }
  return json({ trips: await listTrips(userId) });
});

// POST /api/trips  { brief, plan, sel, carOn, food, total }
export const POST = handle(async (request) => {
  const userId = await account(request);
  const body = await parseBody(request, saveTripSchema);
  let plan;
  try {
    plan = normalizePlan(body.plan, body.brief.days);
  } catch {
    throw new HttpError(400, "The plan to save is incomplete");
  }
  const saved = await saveTrip(userId, body.brief, { plan, sel: body.sel, carOn: body.carOn, food: body.food }, body.total);
  return json({ id: saved.id, createdAt: saved.created_at });
});

// DELETE /api/trips?id=…
export const DELETE = handle(async (request) => {
  const userId = await account(request);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) throw new HttpError(400, "Missing trip id");
  await deleteTrip(userId, id);
  return json({ ok: true });
});
