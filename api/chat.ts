import { askCopilot } from "../server/copilot.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { addChatMessages, ensureUser, getChatHistory, isSupabaseConfigured } from "../server/supabase.js";
import { chatRequestSchema, guestIdSchema } from "../shared/schemas.js";
import { z } from "zod";

/** Sigma Copilot. Gemini answers; Supabase keeps the history when it is configured. */

// GET /api/chat?guestId=…&threadId=…  → saved messages of this conversation
export const GET = handle(async (request) => {
  const q = new URL(request.url).searchParams;
  const guest = guestIdSchema.safeParse(q.get("guestId"));
  const thread = z.string().uuid().safeParse(q.get("threadId"));
  if (!guest.success || !thread.success) throw new HttpError(400, "Missing or invalid guestId/threadId");
  if (!isSupabaseConfigured()) return json({ messages: [], saved: false });
  try {
    const userId = await ensureUser(guest.data);
    return json({ messages: await getChatHistory(userId, thread.data), saved: true });
  } catch (err) {
    console.error("[chat] history unavailable", (err as Error).message);
    return json({ messages: [], saved: false });
  }
});

// POST /api/chat  { guestId, threadId, message, context, history }
export const POST = handle(async (request) => {
  const body = await parseBody(request, chatRequestSchema);
  const { reply, model } = await askCopilot(body.context, body.history, body.message);

  // Saving the history is best effort: the chat keeps working without Supabase.
  let saved = false;
  if (isSupabaseConfigured() && model !== "local") {
    try {
      const userId = await ensureUser(body.guestId);
      await addChatMessages(userId, body.threadId, [{ role: "user", content: body.message }, { role: "assistant", content: reply }]);
      saved = true;
    } catch (err) {
      console.error("[chat] not saved", (err as Error).message);
    }
  }
  return json({ reply, model, saved });
});
