import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../fixtures.js";

// Deleting a thread removes its text at once and keeps it removed. A delete made while a reply
// is still streaming is normal, and the reply's saves (the agent's onFinish hook and the
// browser's own save on completion) land after it, so every writer must skip a deleted row.
// The calls are made the way the chat and Lowdefy make them, straight to the endpoints.

const THREADS = "conversations";

const USER = {
  id: "e2e-delete-user-id",
  sub: "e2e-delete-user-sub",
  name: "Delete User",
  email: "delete@example.com",
  roles: ["admin"],
  profile: { name: "Delete User" },
};

const text = (id, role, value) => ({
  id,
  role,
  parts: [{ type: "text", text: value }],
});

async function post(page, endpoint, payload) {
  const raw = await page.request.post(
    `/api/endpoints/ai-assistant/${endpoint}`,
    { data: { payload } },
  );
  return { status: raw.status(), body: await raw.json().catch(() => null) };
}

const sendSave = (page, conversationId, messages) =>
  post(page, "save-thread", {
    conversationId,
    messages,
    known_ids: messages.map((message) => message.id),
    title: "What modules are in this repo?",
    scope: "demo",
    tag: null,
  });

const finishPayload = (conversationId, messages) => ({
  messages,
  steps: [],
  toolResults: [],
  finishReason: "stop",
  isAborted: false,
  conversationId,
  pageId: "home",
  userId: USER.id,
  usage: { inputTokens: 10, outputTokens: 12 },
});

const q1 = text("q1", "user", "What modules are in this repo?");
const a1 = text("a1", "assistant", "Layout, events, files and a dozen more.");

test("a deleted thread loads as nothing and keeps no text", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  expect((await sendSave(page, "e2e-del-1", [q1, a1])).status).toBe(200);

  const { body } = await post(page, "delete-thread", {
    conversationId: "e2e-del-1",
  });
  expect(body?.response).toEqual({
    conversationId: "e2e-del-1",
    deleted: true,
  });

  const loaded = await post(page, "get-thread", {
    conversationId: "e2e-del-1",
  });
  expect(loaded.body?.response).toEqual({ messages: [] });
  const active = await post(page, "get-active-thread", { scope: "demo" });
  expect(active.body?.response?.conversationId).toBeNull();

  const doc = await mdb
    .collection(THREADS)
    .findOne({ conversationId: "e2e-del-1" });
  expect(doc.deleted?.timestamp).toBeInstanceOf(Date);
  expect(doc.deleted?.user?.id).toBe(USER.id);
  expect(doc).not.toHaveProperty("messages");
  expect(doc).not.toHaveProperty("title");
  expect(doc.created).toBeInstanceOf(Date);
});

test("a reply that finishes after the delete writes nothing back", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER);
  // Sent: the browser stores the question, and the reply starts streaming.
  await sendSave(page, "e2e-del-stream", [q1]);
  // Deleted while it streams, from the thread list or another tab.
  await post(page, "delete-thread", { conversationId: "e2e-del-stream" });

  // The agent finishes: its onFinish hook, then the browser's completion save.
  const hook = await post(
    page,
    "save-thread-on-finish",
    finishPayload("e2e-del-stream", [q1, a1]),
  );
  expect(hook.body?.response).toEqual({ saved: false });
  const browser = await sendSave(page, "e2e-del-stream", [q1, a1]);
  expect(browser.body?.response).toEqual({ saved: false });

  const docs = await mdb
    .collection(THREADS)
    .find({ conversationId: "e2e-del-stream" })
    .toArray();
  expect(docs).toHaveLength(1);
  expect(docs[0].deleted?.timestamp).toBeInstanceOf(Date);
  expect(docs[0]).not.toHaveProperty("messages");
  expect(docs[0]).not.toHaveProperty("title");
});

test("the documented TTL index applies to the created date save-thread writes", async ({
  ldf,
  page,
  mdb,
}) => {
  // The index an app declares, as docs/ai-assistant/index.md gives it.
  const docs = fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../docs/ai-assistant/index.md",
    ),
    "utf8",
  );
  expect(docs).toContain("{ created: 1 },\n  { expireAfterSeconds: 7776000 }");

  const threads = mdb.collection(THREADS);
  const name = await threads.createIndex(
    { created: 1 },
    { expireAfterSeconds: 7776000, name: "e2e_ttl_created" },
  );
  try {
    await ldf.user(USER);
    await sendSave(page, "e2e-del-ttl", [q1]);
    const doc = await threads.findOne({ conversationId: "e2e-del-ttl" });
    expect(doc.created).toBeInstanceOf(Date);
    const index = (await threads.indexes()).find((i) => i.name === name);
    expect(index.expireAfterSeconds).toBe(7776000);
  } finally {
    // Other specs seed rows with old dates into the same collection.
    await threads.dropIndex(name);
  }
});
