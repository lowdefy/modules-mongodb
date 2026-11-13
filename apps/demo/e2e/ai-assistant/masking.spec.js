import { test, expect } from "../fixtures.js";

// Personal information that gets past the browser guard is masked by every endpoint that
// stores chat text, since each can be called directly, outside the agent and its redact.
// Each number must become ONE [removed], with no digits left beside it. The agent's redact
// runs on the agent route, which the e2e server does not serve.

const THREADS = "conversations";
const ID_TEXT = "my ID is 80010150090";
const PHONE_TEXT = "call +27-82-123-4567 or 082 123 4567 890";
const MASKED_ID = "my ID is [removed]";
const MASKED_PHONE = "call [removed] or [removed]";

const USER = {
  id: "e2e-mask-user-id",
  sub: "e2e-mask-user-sub",
  name: "Mask User",
  email: "mask@example.com",
  roles: ["admin"],
  profile: { name: "Mask User" },
};

const text = (id, role, value) => ({
  id,
  role,
  parts: [{ type: "text", text: value }],
});

const textsOf = (messages) =>
  messages.flatMap((m) => m.parts.map((p) => p.text));

async function post(page, endpoint, payload) {
  const raw = await page.request.post(
    `/api/endpoints/ai-assistant/${endpoint}`,
    { data: { payload } },
  );
  return { status: raw.status(), body: await raw.json().catch(() => null) };
}

test("save-thread stores masked messages and a masked title", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  const messages = [
    text("q1", "user", ID_TEXT),
    text("a1", "assistant", PHONE_TEXT),
  ];
  const { body } = await post(page, "save-thread", {
    conversationId: "e2e-mask-save",
    messages,
    known_ids: ["q1", "a1"],
    title: ID_TEXT,
    scope: "demo",
    tag: null,
  });
  expect(body?.response).toEqual({ saved: true });
  const doc = await mdb
    .collection(THREADS)
    .findOne({ conversationId: "e2e-mask-save" });
  expect(textsOf(doc.messages)).toEqual([MASKED_ID, MASKED_PHONE]);
  expect(doc.title).toBe(MASKED_ID);
});

test("save-thread-on-finish stores the reply masked", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  const q1 = text("q1", "user", ID_TEXT);
  await post(page, "save-thread", {
    conversationId: "e2e-mask-hook",
    messages: [q1],
    known_ids: ["q1"],
    title: "Stored title",
    scope: "demo",
    tag: null,
  });
  const { body } = await post(page, "save-thread-on-finish", {
    conversationId: "e2e-mask-hook",
    messages: [q1, text("a1", "assistant", PHONE_TEXT)],
    steps: [],
    toolResults: [],
    finishReason: "stop",
  });
  expect(body?.response).toEqual({ saved: true });
  const doc = await mdb
    .collection(THREADS)
    .findOne({ conversationId: "e2e-mask-hook" });
  expect(textsOf(doc.messages)).toEqual([MASKED_ID, MASKED_PHONE]);
});

test("a file part passes through unmasked", async ({ ldf, page, mdb }) => {
  await ldf.user(USER);
  const file = {
    type: "file",
    mediaType: "image/png",
    filename: "80010150090.png",
    url: "https://example.com/80010150090.png",
  };
  await post(page, "save-thread", {
    conversationId: "e2e-mask-file",
    messages: [
      {
        id: "q1",
        role: "user",
        parts: [file, { type: "text", text: ID_TEXT }],
      },
    ],
    known_ids: ["q1"],
    title: "Stored title",
    scope: "demo",
    tag: null,
  });
  const doc = await mdb
    .collection(THREADS)
    .findOne({ conversationId: "e2e-mask-file" });
  expect(doc.messages[0].parts).toEqual([
    file,
    { type: "text", text: MASKED_ID },
  ]);
});
