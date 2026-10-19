import { test, expect } from "../fixtures.js";

// The ai-assistant module's open-with-prompt, driven from the demo home page's
// "Ask the assistant for a tour" button. The agent call is intercepted: the
// conversationId it is posted under is the thing that has to be right, since a
// chat still bound to the thread it was showing would post the prompt there.

const USER = {
  id: "e2e-assistant-user",
  name: "Assistant User",
  email: "assistant@example.com",
  roles: ["admin"],
  profile: { name: "Assistant User" },
};

const PROMPT =
  "Give me a short tour of the modules in this demo app, and say which one to open first.";
const REPLY = "Start with the layout module.";

// A minimal AI SDK UI message stream: one text part, then finish.
function agentReply() {
  const events = [
    { type: "start" },
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: REPLY },
    { type: "text-end", id: "t1" },
    { type: "finish" },
  ];
  return (
    events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

async function interceptAgent(page) {
  const posted = [];
  await page.route("**/api/agent/**", async (route) => {
    const url = new URL(route.request().url());
    posted.push({
      conversationId: url.searchParams.get("conversationId"),
      body: route.request().postData() ?? "",
    });
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: agentReply(),
    });
  });
  return posted;
}

test("on a fresh page load it opens the panel on a new thread and sends the prompt", async ({
  ldf,
  page,
  mdb,
}) => {
  const posted = await interceptAgent(page);
  await ldf.user(USER);
  await ldf.goto("/home");

  await ldf.block("ask_assistant_tour").do.click();

  await expect(page.getByText(PROMPT)).toBeVisible();
  await expect(page.getByText(REPLY)).toBeVisible();

  const conversationId = await ldf.state("ai_conversation_id").value();
  expect(conversationId).toBeTruthy();
  expect(posted).toHaveLength(1);
  expect(posted[0].conversationId).toBe(conversationId);
  expect(posted[0].body).toContain(PROMPT);

  // Persisted under the new thread, for this user and scope.
  await expect
    .poll(async () => {
      const doc = await mdb
        .collection("conversations")
        .findOne({ conversationId, user_id: USER.id });
      return doc?.messages?.length ?? 0;
    })
    .toBe(2);
});

const existing = "demo_e2e-assistant-user_existing";

function seedExistingThread(mdb) {
  return mdb.seed("conversations", [
    {
      _id: existing,
      conversationId: existing,
      user_id: USER.id,
      scope: "demo",
      title: "Earlier chat",
      messages: [
        {
          id: "seed-user-1",
          role: "user",
          parts: [{ type: "text", text: "An earlier question" }],
        },
        {
          id: "seed-assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "An earlier answer" }],
        },
      ],
      tags: [],
      last_opened: new Date(),
      updated: new Date(),
    },
  ]);
}

async function expectPromptInNewThread({ ldf, page, mdb, posted }) {
  await expect(page.getByText(PROMPT)).toBeVisible();
  await expect(page.getByText(REPLY)).toBeVisible();
  await expect(page.getByText("An earlier answer")).toBeHidden();

  const conversationId = await ldf.state("ai_conversation_id").value();
  expect(conversationId).not.toBe(existing);
  expect(posted).toHaveLength(1);
  expect(posted[0].conversationId).toBe(conversationId);

  // The earlier thread is untouched; the prompt lives in the new one.
  const earlier = await mdb
    .collection("conversations")
    .findOne({ conversationId: existing });
  expect(earlier.messages).toHaveLength(2);
  await expect
    .poll(async () => {
      const doc = await mdb
        .collection("conversations")
        .findOne({ conversationId, user_id: USER.id });
      return doc?.messages?.length ?? 0;
    })
    .toBe(2);
}

test("with the panel open on another thread it starts a new thread for the prompt", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedExistingThread(mdb);
  const posted = await interceptAgent(page);
  await ldf.user(USER);
  await ldf.goto("/home");

  // Open the panel with its launcher: it resumes the seeded thread.
  await page.getByRole("button", { name: "Open assistant" }).click();
  await expect(page.getByText("An earlier answer")).toBeVisible();
  await ldf.state("ai_conversation_id").expect.toBe(existing);

  await ldf.block("ask_assistant_tour").do.click();

  await expectPromptInNewThread({ ldf, page, mdb, posted });
});

test("with the panel closed after showing another thread it starts a new thread for the prompt", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedExistingThread(mdb);
  const posted = await interceptAgent(page);
  await ldf.user(USER);
  await ldf.goto("/home");

  // Open then close: the chat stays mounted, hidden, on the seeded thread.
  await page.getByRole("button", { name: "Open assistant" }).click();
  await expect(page.getByText("An earlier answer")).toBeVisible();
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.locator("#ai_panel .fp-panel")).toHaveAttribute(
    "data-open",
    "false",
  );

  await ldf.block("ask_assistant_tour").do.click();

  await expectPromptInNewThread({ ldf, page, mdb, posted });
});
