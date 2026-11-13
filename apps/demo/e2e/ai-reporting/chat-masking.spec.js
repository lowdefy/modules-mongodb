import { test, expect } from "../fixtures.js";
import { USER_A, callEndpoint } from "./helpers.js";

// Personal information that gets past the browser guard is masked by every endpoint that
// stores chat text, since each can be called directly, outside the agent and its redact.
// Each number must become ONE [removed], with no digits left beside it. The agent's redact
// runs on the agent route, which the e2e server does not serve.

const CONVERSATIONS = "conversations";
const ID_TEXT = "my ID is 80010150090";
const PHONE_TEXT = "call +27-82-123-4567 or 082 123 4567 890";
const MASKED_ID = "my ID is [removed]";
const MASKED_PHONE = "call [removed] or [removed]";

const text = (id, role, value) => ({
  id,
  role,
  parts: [{ type: "text", text: value }],
});

const textsOf = (messages) =>
  messages.flatMap((m) => m.parts.map((p) => p.text));

test("save-conversation stores masked messages and a masked title", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER_A);
  const { response } = await callEndpoint(page, "save-conversation", {
    conversationId: "e2e-mask-save",
    messages: [
      text("q1", "user", ID_TEXT),
      text("a1", "assistant", PHONE_TEXT),
    ],
  });
  expect(response).toEqual({ ok: true });
  const doc = await mdb
    .collection(CONVERSATIONS)
    .findOne({ _id: "e2e-mask-save" });
  expect(textsOf(doc.messages)).toEqual([MASKED_ID, MASKED_PHONE]);
  expect(doc.title).toBe(MASKED_ID);
});

test("set-conversation-title stores a masked title", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER_A);
  for (const [id, title, masked] of [
    ["e2e-mask-title-1", ID_TEXT, MASKED_ID],
    ["e2e-mask-title-2", PHONE_TEXT, MASKED_PHONE],
  ]) {
    await callEndpoint(page, "set-conversation-title", {
      conversationId: id,
      title,
    });
    const doc = await mdb.collection(CONVERSATIONS).findOne({ _id: id });
    expect(doc.title).toBe(masked);
  }
});
