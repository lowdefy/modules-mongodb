import { test, expect } from "../fixtures.js";

// A reply cut off mid-stream leaves its tool call with no result. The AI SDK
// validates the WHOLE history on load and on send, so one such pairing stops the
// thread opening and stops every later message reaching the model — the
// conversation is dead, and threads already stored that way stay dead until the
// read heals them. A build check compiles the filter but cannot run it, so
// driving the endpoint is the only thing that proves the routine.

const THREADS = "conversations";

const USER = {
  id: "e2e-chat-user-id",
  sub: "e2e-chat-user-sub",
  name: "Chat User",
  email: "chat@example.com",
  roles: ["admin"],
  profile: { name: "Chat User" },
};

async function getThread(page, conversationId) {
  const raw = await page.request.post("/api/endpoints/ai-assistant/get-thread", {
    data: { payload: { conversationId } },
  });
  const body = await raw.json().catch(() => null);
  return body?.response?.messages ?? null;
}

async function getActiveThread(page, scope) {
  const raw = await page.request.post("/api/endpoints/ai-assistant/get-active-thread", {
    data: { payload: { scope } },
  });
  const body = await raw.json().catch(() => null);
  return body?.response?.messages ?? null;
}

const threadDoc = ({ id, messages }) => ({
  _id: id,
  conversationId: id,
  user_id: USER.id,
  scope: "demo",
  title: "Cut off",
  messages,
  deleted: null,
});

test("an unresolved tool call is stripped, and the rest of the thread survives", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(THREADS, [
    threadDoc({
      id: "e2e-thread-stuck",
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "What modules are in this repo?" }] },
        {
          id: "m2",
          role: "assistant",
          parts: [
            { type: "step-start" },
            { type: "reasoning", state: "done", text: "Thinking about it." },
            // Emitted, never answered: this is the pairing that kills the thread.
            { type: "tool-search", state: "input-available", toolCallId: "tc1" },
          ],
        },
      ],
    }),
  ]);

  await ldf.user(USER);
  const messages = await getThread(page, "e2e-thread-stuck");

  const parts = messages.flatMap((m) => m.parts ?? []);
  expect(parts.some((p) => p.type === "tool-search")).toBe(false);
  // The turn still said something, so it is kept rather than discarded wholesale.
  expect(messages.map((m) => m.id)).toEqual(["m1", "m2"]);
  expect(parts.some((p) => p.type === "reasoning")).toBe(true);
});

test("a message left with nothing to replay is dropped", async ({ ldf, page, mdb }) => {
  await mdb.seed(THREADS, [
    threadDoc({
      id: "e2e-thread-empty",
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "hello?" }] },
        // Stored by a turn that produced nothing at all — the shape that fails
        // validation with "Message must contain at least one part".
        { id: "m2", role: "assistant", parts: [] },
        // Nothing left once its unresolved call goes, so the step-start alone
        // must not keep it alive.
        {
          id: "m3",
          role: "assistant",
          parts: [
            { type: "step-start" },
            { type: "tool-fetch", state: "input-available", toolCallId: "tc2" },
          ],
        },
      ],
    }),
  ]);

  await ldf.user(USER);
  const messages = await getThread(page, "e2e-thread-empty");

  expect(messages.map((m) => m.id)).toEqual(["m1"]);
  expect(messages.every((m) => (m.parts ?? []).length > 0)).toBe(true);
});

test("a completed tool call is left alone", async ({ ldf, page, mdb }) => {
  await mdb.seed(THREADS, [
    threadDoc({
      id: "e2e-thread-healthy",
      messages: [
        { id: "m1", role: "user", parts: [{ type: "text", text: "How do threads work?" }] },
        {
          id: "m2",
          role: "assistant",
          parts: [
            { type: "step-start" },
            { type: "tool-search", state: "output-available", toolCallId: "tc3", output: { results: [] } },
            { type: "text", state: "done", text: "Threads are stored per user and replayed on open." },
          ],
        },
      ],
    }),
  ]);

  await ldf.user(USER);
  const messages = await getThread(page, "e2e-thread-healthy");

  expect(messages).toHaveLength(2);
  expect(messages[1].parts).toHaveLength(3);
});

// `enter` resumes through get-active-thread, not get-thread, so a visit lands on this history
// before the user opens anything. Filtering only the explicit open would leave the commonest
// path — reload, land on your last thread — still broken.
test("the resumed thread is filtered too, not just an explicitly opened one", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(THREADS, [
    {
      ...threadDoc({
        id: "e2e-thread-active",
        messages: [
          { id: "m1", role: "user", parts: [{ type: "text", text: "What modules are in this repo?" }] },
          {
            id: "m2",
            role: "assistant",
            parts: [
              { type: "step-start" },
              { type: "tool-search", state: "input-available", toolCallId: "tc4" },
            ],
          },
        ],
      }),
      last_opened: new Date(),
    },
  ]);

  await ldf.user(USER);
  const messages = await getActiveThread(page, "demo");

  expect(messages.map((m) => m.id)).toEqual(["m1"]);
});
