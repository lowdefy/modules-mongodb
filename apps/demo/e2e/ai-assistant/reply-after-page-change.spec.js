import { test, expect } from "../fixtures.js";

// A reply the agent finishes after the person has left the page reaches the thread through the
// agent's onFinish hook, save-thread-on-finish, which Lowdefy calls on the server once the stream
// ends. The e2e server has no model, so the agent call is intercepted and the hook is called the
// way Lowdefy calls it, with the whole finish payload. The browser's own saves must then keep
// that reply, whichever lands first.

const THREADS = "conversations";

const USER = {
  id: "e2e-reply-user-id",
  sub: "e2e-reply-user-sub",
  name: "Reply User",
  email: "reply@example.com",
  roles: ["admin"],
  profile: { name: "Reply User" },
};

const PROMPT = "What modules are in this repo?";
const REPLY = "Layout, events, files and a dozen more.";
const SECOND = "Which one should I open first?";
const SECOND_REPLY = "Start with the layout module.";

const text = (id, role, value) => ({
  id,
  role,
  parts: [{ type: "text", text: value }],
});

const threadDoc = (id, messages) => ({
  _id: id,
  conversationId: id,
  user_id: USER.id,
  scope: "demo",
  title: "Stored title",
  messages,
  tags: [],
  deleted: null,
  last_opened: new Date(),
  updated: new Date(),
});

async function post(page, endpoint, payload) {
  const raw = await page.request.post(
    `/api/endpoints/ai-assistant/${endpoint}`,
    { data: { payload } },
  );
  return { status: raw.status(), body: await raw.json().catch(() => null) };
}

// What handleAgentChat sends each hooks.onFinish endpoint: the finish fields, then the
// agent context, then usage and locale.
const finishPayload = ({ conversationId, messages }) => ({
  messages,
  steps: [{ stepNumber: 0, text: REPLY, toolCalls: [], toolResults: [] }],
  toolResults: [],
  finishReason: "stop",
  isAborted: false,
  conversationId,
  pageId: "home",
  pathParams: {},
  sharedState: {},
  sharedStateReadOnly: false,
  urlQuery: {},
  userId: USER.id,
  usage: { inputTokens: 10, outputTokens: 12 },
  locale: "en",
});

const storedIds = async (mdb, conversationId) => {
  const doc = await mdb.collection(THREADS).findOne({ conversationId });
  return (doc?.messages ?? []).map((message) => message.id);
};

function replyStream(reply) {
  const events = [
    { type: "start" },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: reply },
    { type: "text-end", id: "t1" },
    { type: "finish" },
  ];
  return (
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

// The first call is held open, as a reply still streaming; later ones answer at once.
async function interceptAgent(page) {
  const posted = [];
  await page.route("**/api/agent/**", async (route) => {
    posted.push(JSON.parse(route.request().postData() ?? "{}"));
    if (posted.length === 1) return;
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: replyStream(SECOND_REPLY),
    });
  });
  return posted;
}

test("the onFinish hook adds the reply to the thread saved on send", async ({
  ldf,
  page,
  mdb,
}) => {
  const q1 = text("q1", "user", PROMPT);
  await mdb.seed(THREADS, [threadDoc("e2e-hook-thread", [q1])]);
  await ldf.user(USER);

  const { status, body } = await post(
    page,
    "save-thread-on-finish",
    finishPayload({
      conversationId: "e2e-hook-thread",
      messages: [q1, text("a1", "assistant", REPLY)],
    }),
  );
  expect(status).toBe(200);
  expect(body?.response).toEqual({ saved: true });

  const doc = await mdb
    .collection(THREADS)
    .findOne({ conversationId: "e2e-hook-thread" });
  expect(doc.messages.map((m) => m.id)).toEqual(["q1", "a1"]);
  // Title, scope and tags stay the browser's.
  expect(doc.title).toBe("Stored title");
  expect(doc.scope).toBe("demo");
  expect(doc.tags).toEqual([]);
});

test("the onFinish hook writes nothing to a thread that is not stored", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  const { body } = await post(
    page,
    "save-thread-on-finish",
    finishPayload({
      conversationId: "e2e-hook-unknown",
      messages: [text("q1", "user", PROMPT), text("a1", "assistant", REPLY)],
    }),
  );
  expect(body?.response).toEqual({ saved: false });
  expect(
    await mdb.collection(THREADS).countDocuments({
      conversationId: "e2e-hook-unknown",
    }),
  ).toBe(0);
});

test("the onFinish hook writes only the session user's thread", async ({
  ldf,
  page,
  mdb,
}) => {
  const q1 = text("q1", "user", PROMPT);
  await mdb.seed(THREADS, [
    { ...threadDoc("e2e-hook-other", [q1]), user_id: "someone-else" },
  ]);
  await ldf.user(USER);
  const { body } = await post(
    page,
    "save-thread-on-finish",
    finishPayload({
      conversationId: "e2e-hook-other",
      messages: [q1, text("a1", "assistant", REPLY)],
    }),
  );
  expect(body?.response).toEqual({ saved: false });
  expect(await storedIds(mdb, "e2e-hook-other")).toEqual(["q1"]);
});

test("a send from a chat that never received the hook's reply keeps it, in either order", async ({
  ldf,
  page,
  mdb,
}) => {
  const q1 = text("q1", "user", PROMPT);
  const a1 = text("a1", "assistant", REPLY);
  const q2 = text("q2", "user", SECOND);
  await mdb.seed(THREADS, [
    threadDoc("e2e-race-hook-first", [q1]),
    threadDoc("e2e-race-send-first", [q1]),
  ]);
  await ldf.user(USER);
  const send = (conversationId) =>
    post(page, "save-thread", {
      conversationId,
      messages: [q1, q2],
      known_ids: ["q1", "q2"],
      title: "Stored title",
      scope: "demo",
      tag: null,
    });
  const hook = (conversationId) =>
    post(
      page,
      "save-thread-on-finish",
      finishPayload({ conversationId, messages: [q1, a1] }),
    );

  await hook("e2e-race-hook-first");
  await send("e2e-race-hook-first");
  expect(await storedIds(mdb, "e2e-race-hook-first")).toEqual([
    "q1",
    "a1",
    "q2",
  ]);

  await send("e2e-race-send-first");
  await hook("e2e-race-send-first");
  expect(await storedIds(mdb, "e2e-race-send-first")).toEqual([
    "q1",
    "a1",
    "q2",
  ]);
});

test("a message deleted in the chat is dropped from the stored thread", async ({
  ldf,
  page,
  mdb,
}) => {
  const q1 = text("q1", "user", PROMPT);
  const a1 = text("a1", "assistant", REPLY);
  await mdb.seed(THREADS, [threadDoc("e2e-delete", [q1, a1])]);
  await ldf.user(USER);
  await post(page, "save-thread", {
    conversationId: "e2e-delete",
    messages: [q1],
    known_ids: ["q1", "a1"],
    scope: "demo",
    tag: null,
  });
  expect(await storedIds(mdb, "e2e-delete")).toEqual(["q1"]);
});

test("a reply that finishes after the page changes shows when the panel opens again", async ({
  ldf,
  page,
  mdb,
}) => {
  const posted = await interceptAgent(page);
  await ldf.user(USER);
  await ldf.goto("/home");

  await page.getByRole("button", { name: "Open assistant" }).click();
  await page.getByText(PROMPT).click();
  const conversationId = await ldf.state("ai_conversation_id").value();
  await expect.poll(() => storedIds(mdb, conversationId)).toHaveLength(1);
  await expect.poll(() => posted.length).toBe(1);

  // Leave mid-reply, by the app's own menu.
  await page.getByRole("menuitem", { name: "AI Assistant" }).click();
  await expect(page).toHaveURL(/assistant-demo/);

  // The agent finishes on the server and its hook stores the reply.
  const sent = posted[0].messages;
  const { body } = await post(
    page,
    "save-thread-on-finish",
    finishPayload({
      conversationId,
      messages: [...sent, text("server-reply-1", "assistant", REPLY)],
    }),
  );
  expect(body?.response).toEqual({ saved: true });

  await page.goBack();
  await expect(page).toHaveURL(/home/);
  await page.getByRole("button", { name: "Open assistant" }).click();
  await expect(page.getByText(REPLY)).toBeVisible();
  await ldf.state("ai_busy").expect.toBe(false);
  await page.screenshot({
    path: "test-results/reply-after-page-change-desktop.png",
  });

  // Sending straight away keeps the reply this chat only got from the server.
  await page.getByPlaceholder("Ask about the demo app…").fill(SECOND);
  await page.keyboard.press("Enter");
  await expect(page.getByText(SECOND_REPLY)).toBeVisible();
  await expect
    .poll(async () => {
      const doc = await mdb.collection(THREADS).findOne({ conversationId });
      return (doc?.messages ?? []).map((m) => m.role);
    })
    .toEqual(["user", "assistant", "user", "assistant"]);
  expect((await storedIds(mdb, conversationId))[1]).toBe("server-reply-1");

  // And after a refresh.
  await page.reload();
  await page.getByRole("button", { name: "Open assistant" }).click();
  await expect(page.getByText(REPLY)).toBeVisible();
  await expect(page.getByText(SECOND_REPLY)).toBeVisible();
});

test("a reply sent from the embedded chat shows in another page's panel and back in the embedded chat", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(THREADS, [
    threadDoc("e2e-shared", [
      text("q0", "user", "An earlier question"),
      text("a0", "assistant", "An earlier answer"),
    ]),
  ]);
  const posted = await interceptAgent(page);
  await ldf.user(USER);
  await ldf.goto("/home");
  // Home's panel resumes the thread first, so its page state is older than what follows.
  await page.getByRole("button", { name: "Open assistant" }).click();
  await expect(page.getByText("An earlier answer")).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();

  await page.getByRole("menuitem", { name: "AI Assistant" }).click();
  await expect(page).toHaveURL(/assistant-demo/);
  // Scoped to the embedded shell: the home panel's composer can linger while the page changes.
  const embedded = page.locator("#ai_embedded");
  await expect(embedded.getByText("An earlier answer")).toBeVisible();
  await embedded.getByPlaceholder("Ask about the demo app…").fill(PROMPT);
  await page.keyboard.press("Enter");
  const conversationId = await ldf.state("ai_conversation_id").value();
  expect(conversationId).toBe("e2e-shared");
  await expect.poll(() => storedIds(mdb, conversationId)).toHaveLength(3);
  await expect.poll(() => posted.length).toBe(1);

  await page.goBack();
  await expect(page).toHaveURL(/home/);
  const { body } = await post(
    page,
    "save-thread-on-finish",
    finishPayload({
      conversationId,
      messages: [
        ...posted[0].messages,
        text("server-reply-1", "assistant", REPLY),
      ],
    }),
  );
  expect(body?.response).toEqual({ saved: true });

  await page.getByRole("button", { name: "Open assistant" }).click();
  await ldf.state("ai_conversation_id").expect.toBe(conversationId);
  await expect(page.getByText(REPLY)).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/assistant-demo/);
  await expect(embedded.getByText(REPLY)).toBeVisible();
  await ldf.state("ai_busy").expect.toBe(false);
  expect(await storedIds(mdb, conversationId)).toEqual([
    "q0",
    "a0",
    posted[0].messages.at(-1).id,
    "server-reply-1",
  ]);
});

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`a thread still waiting for its reply says so, and Check again loads it (${viewport.name})`, async ({
    ldf,
    page,
    mdb,
  }) => {
    await page.setViewportSize(viewport);
    await mdb.seed(THREADS, [
      threadDoc("e2e-pending", [text("q1", "user", PROMPT)]),
    ]);
    await ldf.user(USER);
    await ldf.goto("/home");

    await page.getByRole("button", { name: "Open assistant" }).click();
    await expect(page.getByText(PROMPT).last()).toBeVisible();
    await expect(
      page.getByText("The assistant is still replying."),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/reply-pending-${viewport.name}.png`,
    });

    await mdb
      .collection(THREADS)
      .updateOne(
        { conversationId: "e2e-pending" },
        { $push: { messages: text("a1", "assistant", REPLY) } },
      );
    await page.getByRole("button", { name: "Check again" }).click();
    await expect(page.getByText(REPLY)).toBeVisible();
    await expect(
      page.getByText("The assistant is still replying."),
    ).toBeHidden();
    await page.screenshot({
      path: `test-results/reply-loaded-${viewport.name}.png`,
    });
  });
}

test("the embedded chat says a resumed thread is still waiting for its reply", async ({
  ldf,
  page,
  mdb,
}) => {
  await mdb.seed(THREADS, [
    threadDoc("e2e-pending-embedded", [text("q1", "user", PROMPT)]),
  ]);
  await ldf.user(USER);
  await ldf.goto("/assistant-demo");
  await expect(page.getByText(PROMPT).last()).toBeVisible();
  await expect(
    page.getByText("The assistant is still replying."),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/reply-pending-embedded.png",
  });
});
