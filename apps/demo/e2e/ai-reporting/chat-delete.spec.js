import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect } from "../fixtures.js";
import { USER_A, callEndpoint } from "./helpers.js";

// Deleting a conversation removes its text at once and keeps it removed. The title arrives
// while the reply streams (set-conversation-title, usually the writer that creates the row),
// and the agent's onFinish hooks (save-conversation, then emit-data-parts) land after a delete
// made in the meantime, so every writer must skip a deleted row. The calls are made the way
// the chat page and Lowdefy make them, straight to the endpoints.

const CONVERSATIONS = "conversations";

const text = (id, role, value) => ({
  id,
  role,
  parts: [{ type: "text", text: value }],
});

const q1 = text("q1", "user", "Which region sold most?");
const a1 = text("a1", "assistant", "The North region led on revenue.");

// A download part needs no pipeline run, so it is the cheapest turn that makes
// emit-data-parts write data_parts.
const exportResult = {
  toolName: "export_data",
  output: {
    spec: {
      label: "Companies",
      query: { collection: "demo_companies", pipeline: [] },
    },
  },
};

const finishPayload = (conversationId, toolResults = []) => ({
  conversationId,
  messages: [q1, a1],
  toolResults,
  steps: [],
  finishReason: "stop",
});

test("a deleted conversation opens as nothing and keeps no text", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER_A);
  await callEndpoint(page, "save-conversation", finishPayload("e2e-cdel-1"));
  const emitted = await callEndpoint(
    page,
    "emit-data-parts",
    finishPayload("e2e-cdel-1", [exportResult]),
  );
  expect(emitted.response?.dataParts).toHaveLength(1);
  const before = await mdb
    .collection(CONVERSATIONS)
    .findOne({ _id: "e2e-cdel-1" });
  expect(before.messages).toHaveLength(2);
  expect(before.data_parts).toHaveLength(1);

  const deleted = await callEndpoint(page, "delete-conversation", {
    conversationId: "e2e-cdel-1",
  });
  expect(deleted.response).toEqual({ ok: true, deletedCount: 1 });

  const loaded = await callEndpoint(page, "get-conversation-results", {
    conversationId: "e2e-cdel-1",
  });
  expect(loaded.response).toEqual({
    messages: [],
    charts: [],
    tables: [],
    downloads: [],
    saved_reports: [],
  });
  const listed = await callEndpoint(page, "list-conversations", {});
  expect(listed.response.map((c) => c._id)).not.toContain("e2e-cdel-1");

  const doc = await mdb
    .collection(CONVERSATIONS)
    .findOne({ _id: "e2e-cdel-1" });
  expect(doc.deleted?.timestamp).toBeInstanceOf(Date);
  expect(doc).not.toHaveProperty("messages");
  expect(doc).not.toHaveProperty("data_parts");
  expect(doc).not.toHaveProperty("title");
});

test("a reply that finishes after the delete writes nothing back", async ({
  ldf,
  page,
  mdb,
}) => {
  await ldf.user(USER_A);
  // The title arrives while the reply streams, and creates the row.
  await callEndpoint(page, "set-conversation-title", {
    conversationId: "e2e-cdel-stream",
    title: "Regional revenue",
  });
  // Deleted while it streams.
  await callEndpoint(page, "delete-conversation", {
    conversationId: "e2e-cdel-stream",
  });

  // The agent finishes: both onFinish hooks, and a late title.
  const saved = await callEndpoint(
    page,
    "save-conversation",
    finishPayload("e2e-cdel-stream"),
  );
  expect(saved.response).toEqual({ skipped: true });
  const emitted = await callEndpoint(
    page,
    "emit-data-parts",
    finishPayload("e2e-cdel-stream", [exportResult]),
  );
  expect(emitted.errored).toBe(false);
  const titled = await callEndpoint(page, "set-conversation-title", {
    conversationId: "e2e-cdel-stream",
    title: "Regional revenue, again",
  });
  expect(titled.response).toEqual({ skipped: true });

  const docs = await mdb
    .collection(CONVERSATIONS)
    .find({ _id: "e2e-cdel-stream" })
    .toArray();
  expect(docs).toHaveLength(1);
  expect(docs[0].deleted?.timestamp).toBeInstanceOf(Date);
  expect(docs[0]).not.toHaveProperty("messages");
  expect(docs[0]).not.toHaveProperty("data_parts");
  expect(docs[0]).not.toHaveProperty("title");
});

test("the documented TTL index applies to the created date each writer stamps", async ({
  ldf,
  page,
  mdb,
}) => {
  // The index an app declares, as docs/ai-reporting/reference/indexes.md gives it.
  const docs = fs.readFileSync(
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../../docs/ai-reporting/reference/indexes.md",
    ),
    "utf8",
  );
  expect(docs).toContain(
    '{ "created.timestamp": 1 },\n  { expireAfterSeconds: 7776000 }',
  );

  const conversations = mdb.collection(CONVERSATIONS);
  const name = await conversations.createIndex(
    { "created.timestamp": 1 },
    { expireAfterSeconds: 7776000, name: "e2e_ttl_created_timestamp" },
  );
  try {
    await ldf.user(USER_A);
    // Each writer that can create a conversation.
    await callEndpoint(page, "save-conversation", finishPayload("e2e-ttl-a"));
    await callEndpoint(page, "set-conversation-title", {
      conversationId: "e2e-ttl-b",
      title: "Created by its title",
    });
    for (const id of ["e2e-ttl-a", "e2e-ttl-b"]) {
      const doc = await conversations.findOne({ _id: id });
      expect(doc.created.timestamp).toBeInstanceOf(Date);
    }
    const index = (await conversations.indexes()).find((i) => i.name === name);
    expect(index.expireAfterSeconds).toBe(7776000);
  } finally {
    // Other specs seed rows with old dates into the same collection.
    await conversations.dropIndex(name);
  }
});
