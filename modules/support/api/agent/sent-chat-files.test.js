/**
 * Runs parts/sent-chat-files.yaml's pipeline on a real MongoDB, then the chat file
 * choice in parts/resolve-chat-files.yaml, as two agent calls in one chat would.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server";

const here = dirname(fileURLToPath(import.meta.url));
const readYaml = (path) => loadYaml(readFileSync(join(here, path), "utf8"));

const pipeline = readYaml("parts/sent-chat-files.yaml").find(
  (step) => step.id === "sent_chat_files",
).properties.pipeline;
const chooseCode = readYaml("parts/resolve-chat-files.yaml").find(
  (step) => step[":set_state"]?.chat_files,
)[":set_state"].chat_files._js;

// The pipeline's two operators, `_user: id` and `_state: chat_request_keys`.
function resolve(value, { userId, keys }) {
  if (Array.isArray(value))
    return value.map((item) => resolve(item, { userId, keys }));
  if (value && typeof value === "object") {
    if (value._user === "id") return userId;
    if (value._state === "chat_request_keys") return keys;
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        resolve(item, { userId, keys }),
      ]),
    );
  }
  return value;
}

const PREFIX = "ai-assistant/u1/";
const chatFile = (name) => ({
  key: `${PREFIX}k-${name}/${name}`,
  filename: name,
  mediaType: "image/png",
});

let server;
let client;
let tickets;

beforeAll(async () => {
  server = await MongoMemoryServer.create();
  client = await MongoClient.connect(server.getUri());
  tickets = client.db("test").collection("support-tickets");
});

afterAll(async () => {
  await client?.close();
  await server?.stop();
});

beforeEach(() => tickets.deleteMany({}));

// What one agent call in a chat holding `files` sends: the keys already sent on any
// of the user's tickets are left out.
async function filesToSend(userId, files) {
  const keys = files.map((file) => file.key);
  const [found] = await tickets
    .aggregate(resolve(pipeline, { userId, keys }))
    .toArray();
  const sent = found ? found.keys : [];
  return new Function("state", chooseCode)((key) =>
    key === "chat_files_input" ? { files, prefix: PREFIX, sent } : undefined,
  );
}

test("a second ticket in one chat sends only the image the first did not", async () => {
  const a = chatFile("a.png");
  const b = chatFile("b.png");

  const first = await filesToSend("u1", [a]);
  expect(first.map((file) => file.name)).toEqual(["a.png"]);
  await tickets.insertOne({ _id: "t1", user_id: "u1", chat_files: [a.key] });

  const second = await filesToSend("u1", [a, b]);
  expect(second.map((file) => file.name)).toEqual(["b.png"]);
});

test("a key sent on another user's ticket still goes", async () => {
  const a = chatFile("a.png");
  await tickets.insertOne({ _id: "t9", user_id: "u2", chat_files: [a.key] });
  expect((await filesToSend("u1", [a])).map((file) => file.name)).toEqual([
    "a.png",
  ]);
});

test("a chat with no files finds nothing sent", async () => {
  await tickets.insertOne({ _id: "t1", user_id: "u1", chat_files: ["x"] });
  expect(await filesToSend("u1", [])).toEqual([]);
});
