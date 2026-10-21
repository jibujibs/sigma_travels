import { requireUser } from "../server/auth.js";
import { askCopilot } from "../server/copilot.js";
import { handle, HttpError, json, parseBody } from "../server/http.js";
import { addChatMessages, ensureAuthUser, getChatHistory } from "../server/supabase.js";
import { chatRequestSchema } from "../shared/schemas.js";
import { z } from "zod";

/** Sigma Copilot for signed-in users. Gemini answers; Supabase keeps the history. */

// GET /api/chat?threadId=…  → saved messages of this conversation
export const GET = handle(async (request) => {
  const user = await requireUser(request);
  const thread = z.string().uuid().safeParse(new URL(request.url).searchParams.get("threadId"));
  if (!thread.success) throw new HttpError(400, "Missing or invalid threadId");
  try {
    const { id } = await ensureAuthUser(user);
    return json({ messages: await getChatHistory(id, thread.data), saved: true });
  } catch (err) {
    console.error("[chat] history unavailable", (err as Error).message);
    return json({ messages: [], saved: false });
  }
});

// POST /api/chat  { threadId, message, context, history }
export const POST = handle(async (request) => {
  const user = await requireUser(request);
  const body = await parseBody(request, chatRequestSchema);
  const { reply, model } = await askCopilot(body.context, body.history, body.message);

  // Saving the history is best effort: the answer is shown even if saving fails.
  let saved = false;
  if (model !== "local") {
    try {
      const { id } = await ensureAuthUser(user);
      await addChatMessages(id, body.threadId, [{ role: "user", content: body.message }, { role: "assistant", content: reply }]);
      saved = true;
    } catch (err) {
      console.error("[chat] not saved", (err as Error).message);
    }
  }
  return json({ reply, model, saved });
});
