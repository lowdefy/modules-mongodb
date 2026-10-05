import { test, expect } from "../fixtures.js";

// A save carries the browser's copy of the title. Written on every save, a tab holding an older
// name put it back over a rename. The title is written when the row is created and then only by
// rename-thread and title-thread, which only a running endpoint can show.

const THREADS = "conversations";

const USER = {
  id: "e2e-title-user-id",
  sub: "e2e-title-user-sub",
  name: "Title User",
  email: "title@example.com",
  roles: ["admin"],
  profile: { name: "Title User" },
};

const message = { id: "m1", role: "user", parts: [{ type: "text", text: "How do tags work?" }] };

async function call(page, endpoint, payload) {
  const raw = await page.request.post(`/api/endpoints/ai-assistant/${endpoint}`, {
    data: { payload },
  });
  return raw.json().catch(() => null);
}

test("a later save does not overwrite the stored title", async ({ ldf, page, mdb }) => {
  await ldf.user(USER);
  await call(page, "save-thread", {
    conversationId: "e2e-title-thread",
    messages: [message],
    title: "How do tags work?",
    scope: "demo",
  });
  await call(page, "rename-thread", { conversationId: "e2e-title-thread", title: "Tags" });
  await call(page, "save-thread", {
    conversationId: "e2e-title-thread",
    messages: [message],
    title: "How do tags work?",
    scope: "demo",
  });

  const thread = await mdb.collection(THREADS).findOne({ conversationId: "e2e-title-thread" });
  expect(thread.title).toBe("Tags");
});

test("the first save names the thread", async ({ ldf, page, mdb }) => {
  await ldf.user(USER);
  await call(page, "save-thread", {
    conversationId: "e2e-title-first",
    messages: [message],
    title: "Named before sending",
    scope: "demo",
  });

  const thread = await mdb.collection(THREADS).findOne({ conversationId: "e2e-title-first" });
  expect(thread.title).toBe("Named before sending");
});
