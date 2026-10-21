import { test, expect } from "../fixtures.js";

// The open thread lives in page state, one copy per page, and Lowdefy keeps a
// page's state when the user navigates back to it. `enter` re-reads the stored
// thread whenever the panel opens (and, on the embedded page, on every visit),
// so a page visited again shows what was sent since, wherever it was sent. The
// demo shares one thread between the home page's docked panel and the
// assistant-demo page's embedded chat. Navigation goes through the menu and the
// browser's Back button and links, never a full load, which would reset page state and
// hide the bug. The agent call is intercepted.

const USER = {
  id: "e2e-reopen-user",
  name: "Reopen User",
  email: "reopen@example.com",
  roles: ["admin"],
  // The home breadcrumb links to the router page, which sends a user whose
  // profile is not created to onboarding instead of home.
  profile: { name: "Reopen User", profile_created: true },
};

const THREAD = "demo_e2e-reopen-user_stored";

const OLDER = "demo_e2e-reopen-user_older";

function storedThread() {
  return {
    _id: THREAD,
    conversationId: THREAD,
    user_id: USER.id,
    scope: "demo",
    title: "Stored chat",
    messages: [
      {
        id: "seed-user-1",
        role: "user",
        parts: [{ type: "text", text: "A stored question" }],
      },
      {
        id: "seed-assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "A stored answer" }],
      },
    ],
    tags: [],
    last_opened: new Date(),
    updated: new Date(),
  };
}

function seedThread(mdb, others = []) {
  return mdb.seed("conversations", [storedThread(), ...others]);
}

function streamBody(reply) {
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

// Replies to each send with the next reply in the list, after delayMs.
async function interceptAgent(page, replies, { delayMs = 0 } = {}) {
  let call = 0;
  await page.route("**/api/agent/**", async (route) => {
    const reply = replies[call++] ?? "Another reply.";
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: streamBody(reply),
    });
  });
}

async function storedMessageCount(mdb) {
  const doc = await mdb
    .collection("conversations")
    .findOne({ conversationId: THREAD });
  return doc?.messages?.length ?? 0;
}

// Right after a navigation the outgoing page can still be on screen, so every
// lookup is scoped to the shell on the page that should be showing.
const panel = (page) => page.locator("#ai_panel");
const embedded = (page) => page.locator("#ai_embedded");

async function send(shell, text) {
  const composer = shell.getByPlaceholder("Ask about the demo app…");
  await composer.fill(text);
  await composer.press("Enter");
}

async function openPanel(page) {
  await page.getByRole("button", { name: "Open assistant" }).click();
}

async function closePanel(page) {
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(page.locator("#ai_panel .fp-panel")).toHaveAttribute(
    "data-open",
    "false",
  );
}

async function goToAssistantDemo(page) {
  await page.getByRole("menuitem", { name: "AI Assistant" }).click();
  await expect(page).toHaveURL(/assistant-demo/);
}

test("a message sent in the panel shows when the user comes back to the page by menu or Back", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedThread(mdb);
  await interceptAgent(page, ["First reply on home."]);
  await ldf.user(USER);
  await ldf.goto("/home");

  await openPanel(page);
  await expect(panel(page).getByText("A stored answer")).toBeVisible();
  await send(panel(page), "First question on home");
  await expect(panel(page).getByText("First reply on home.")).toBeVisible();
  await expect.poll(() => storedMessageCount(mdb)).toBe(4);
  await closePanel(page);

  // Away and back with the browser's Back button.
  await goToAssistantDemo(page);
  await page.goBack();
  await expect(page).toHaveURL(/home/);
  await openPanel(page);
  await expect(panel(page).getByText("First reply on home.")).toBeVisible();
  await ldf.state("ai_conversation_id").expect.toBe(THREAD);
  await closePanel(page);

  // Away and back through links: the menu, then the home breadcrumb.
  await goToAssistantDemo(page);
  await page.locator(".ant-breadcrumb a").first().click();
  await expect(page).toHaveURL(/home/);
  await openPanel(page);
  await expect(panel(page).getByText("First reply on home.")).toBeVisible();
});

test("a message sent on another page shows in the panel when the user comes back", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedThread(mdb);
  await interceptAgent(page, ["Reply on the embedded page."]);
  await ldf.user(USER);
  await ldf.goto("/home");

  // Home holds its copy of the stored thread.
  await openPanel(page);
  await expect(panel(page).getByText("A stored answer")).toBeVisible();
  await closePanel(page);

  // The embedded chat on assistant-demo resumes the same thread; send there.
  await goToAssistantDemo(page);
  await expect(embedded(page).getByText("A stored answer")).toBeVisible();
  await send(embedded(page), "Question on the embedded page");
  await expect(
    embedded(page).getByText("Reply on the embedded page."),
  ).toBeVisible();
  await expect.poll(() => storedMessageCount(mdb)).toBe(4);

  await page.goBack();
  await expect(page).toHaveURL(/home/);
  await openPanel(page);
  await expect(
    panel(page).getByText("Question on the embedded page"),
  ).toBeVisible();
  await expect(
    panel(page).getByText("Reply on the embedded page."),
  ).toBeVisible();
});

test("a thread switched to on another page is the one the panel shows on coming back", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedThread(mdb, [
    {
      _id: OLDER,
      conversationId: OLDER,
      user_id: USER.id,
      scope: "demo",
      title: "Older chat",
      messages: [
        {
          id: "older-user-1",
          role: "user",
          parts: [{ type: "text", text: "An older question" }],
        },
        {
          id: "older-assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "An older answer" }],
        },
      ],
      tags: [],
      last_opened: new Date(Date.now() - 60_000),
      updated: new Date(Date.now() - 60_000),
    },
  ]);
  await ldf.user(USER);
  await ldf.goto("/home");

  await openPanel(page);
  await expect(panel(page).getByText("A stored answer")).toBeVisible();
  await closePanel(page);

  // On the embedded page, open the older thread from the thread list.
  await goToAssistantDemo(page);
  await expect(embedded(page).getByText("A stored answer")).toBeVisible();
  // ldf.block resolves blocks on the page first loaded, so click by element id.
  await page.locator("#ai_embedded_manage_chats_button").click();
  await embedded(page).getByText("Older chat").click();
  await expect(embedded(page).getByText("An older answer")).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/home/);
  await openPanel(page);
  await expect(panel(page).getByText("An older answer")).toBeVisible();
  await expect(panel(page).getByText("A stored answer")).toBeHidden();
  await ldf.state("ai_conversation_id").expect.toBe(OLDER);
});

test("a reply streaming when the panel is closed and reopened is not replaced", async ({
  ldf,
  page,
  mdb,
}) => {
  await seedThread(mdb);
  await interceptAgent(page, ["The slow reply."], { delayMs: 3000 });
  await ldf.user(USER);
  await ldf.goto("/home");

  await openPanel(page);
  await expect(panel(page).getByText("A stored answer")).toBeVisible();
  await send(panel(page), "A question with a slow reply");
  await ldf.state("ai_busy").expect.toBe(true);

  await closePanel(page);
  await openPanel(page);

  await expect(
    panel(page).getByText("A question with a slow reply"),
  ).toBeVisible();
  await expect(panel(page).getByText("The slow reply.")).toBeVisible({
    timeout: 10_000,
  });
  await ldf.state("ai_conversation_id").expect.toBe(THREAD);
  await expect.poll(() => storedMessageCount(mdb)).toBe(4);
});
