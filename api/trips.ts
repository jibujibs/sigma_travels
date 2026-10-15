import { handle, HttpError, json, parseBody } from "../server/http.js";
import { deleteTrip, ensureUser, getTrip, listTrips, saveTrip } from "../server/supabase.js";
import { normalizePlan } from "../shared/normalize.js";
import { guestIdSchema, saveTripSchema } from "../shared/schemas.js";

/** Saved trips, stored in Supabase's existing "itineraries" table. */

function guestFrom(request: Request): { guestId: string; id: string | null } {
  const q = new URL(request.url).searchParams;
  const g = guestIdSchema.safeParse(q.get("guestId"));
  if (!g.success) throw new HttpError(400, "Missing or invalid guestId");
  return { guestId: g.data, id: q.get("id") };
}

// GET /api/trips?guestId=…           → list (newest first)
// GET /api/trips?guestId=…&id=…      → one trip with its full plan
export const GET = handle(async (request) => {
  const { guestId, id } = guestFrom(request);
  const userId = await ensureUser(guestId);
  if (id) {
    const trip = await getTrip(userId, id);
    if (!trip) throw new HttpError(404, "Trip not found");
    return json({ trip });
  }
  return json({ trips: await listTrips(userId) });
});

// POST /api/trips  { guestId, brief, plan, sel, carOn, food, total }
export const POST = handle(async (request) => {
  const body = await parseBody(request, saveTripSchema);
  let plan;
  try {
    plan = normalizePlan(body.plan, body.brief.days);
  } catch {
    throw new HttpError(400, "The plan to save is incomplete");
  }
  const userId = await ensureUser(body.guestId);
  const saved = await saveTrip(userId, body.brief, { plan, sel: body.sel, carOn: body.carOn, food: body.food }, body.total);
  return json({ id: saved.id, createdAt: saved.created_at });
});

// DELETE /api/trips?guestId=…&id=…
export const DELETE = handle(async (request) => {
  const { guestId, id } = guestFrom(request);
  if (!id) throw new HttpError(400, "Missing trip id");
  const userId = await ensureUser(guestId);
  await deleteTrip(userId, id);
  return json({ ok: true });
});
