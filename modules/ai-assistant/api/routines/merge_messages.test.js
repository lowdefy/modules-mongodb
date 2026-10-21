/**
 * Runs the `_js` bodies that merge a thread's two writers: save-thread's removed_ids, then
 * merge_messages.yaml, as save-thread (the browser) and save-thread-on-finish (the agent's
 * onFinish hook) run them, in both orders the two writes can land in.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const readYaml = (path) => loadYaml(readFileSync(join(here, path), "utf8"));

const merge = readYaml("merge_messages.yaml");
const saveThread = readYaml("../save-thread.yaml");
const removedStep = saveThread.routine.find(
  (step) => step[":set_state"] && step[":set_state"].removed_ids,
);

function runJs(code, state) {
  return new Function("state", code)((key) => state[key]);
}

const mergeMessages = (state) =>
  runJs(merge[0][":set_state"].merged_messages._js, state);

// save-thread: the browser's history, with the ids it has held.
function browserSave(stored, sent, knownIds) {
  const removed = runJs(removedStep[":set_state"].removed_ids._js, {
    stored_messages: stored,
    replayable_messages: sent,
    known_ids: knownIds,
  });
  return mergeMessages({
    stored_messages: stored,
    replayable_messages: sent,
    removed_ids: removed,
    merge_prefer: "sent",
  });
}

// save-thread-on-finish: the agent's input followed by its reply.
const hookSave = (stored, sent) =>
  mergeMessages({
    stored_messages: stored,
    replayable_messages: sent,
    removed_ids: [],
    merge_prefer: "stored",
  });

const user = (id, text = id) => ({
  id,
  role: "user",
  parts: [{ type: "text", text }],
});
const assistant = (id, text = id) => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text }],
});
const ids = (messages) => messages.map((message) => message.id);

const q1 = user("q1");
const a1 = assistant("a1");
const q2 = user("q2");
const a2 = assistant("a2");

test("the hook adds the reply to the question saved on send", () => {
  expect(ids(hookSave([q1], [q1, a1]))).toEqual(["q1", "a1"]);
});

test("the hook's copy of a stored message gives way to the stored one", () => {
  const storedQ1 = {
    ...q1,
    parts: [{ type: "file", url: "data:image/png;base64,AAAA" }],
  };
  const hookQ1 = { ...q1, parts: [{ type: "file", url: "AAAA" }] };
  const merged = hookSave([storedQ1], [hookQ1, a1]);
  expect(merged[0]).toBe(storedQ1);
  expect(merged[1]).toBe(a1);
});

test("a reply stored by the hook survives a send from a chat that never received it", () => {
  // Reopened on [q1] before the reply landed, then the hook stored a1, then the user sent q2.
  const stored = [q1, a1];
  const merged = browserSave(stored, [q1, q2], ["q1", "q2"]);
  expect(ids(merged)).toEqual(["q1", "a1", "q2"]);
});

test("the hook landing after that send still puts the reply before the next question", () => {
  const stored = browserSave([q1], [q1, q2], ["q1", "q2"]);
  expect(ids(stored)).toEqual(["q1", "q2"]);
  expect(ids(hookSave(stored, [q1, a1]))).toEqual(["q1", "a1", "q2"]);
});

test("the second turn's saves keep the first reply, in either order", () => {
  const afterFirst = [q1, a1, q2];
  const browserFirst = browserSave(
    afterFirst,
    [q1, q2, a2],
    ["q1", "q2", "a2"],
  );
  expect(ids(browserFirst)).toEqual(["q1", "a1", "q2", "a2"]);
  expect(ids(hookSave(browserFirst, [q1, q2, a2]))).toEqual([
    "q1",
    "a1",
    "q2",
    "a2",
  ]);
  const hookFirst = hookSave(afterFirst, [q1, q2, a2]);
  expect(ids(hookFirst)).toEqual(["q1", "a1", "q2", "a2"]);
  expect(ids(browserSave(hookFirst, [q1, q2, a2], ["q1", "q2", "a2"]))).toEqual(
    ["q1", "a1", "q2", "a2"],
  );
});

test("a message the browser deleted is dropped", () => {
  expect(
    ids(browserSave([q1, a1, q2, a2], [q1, q2, a2], ["q1", "a1", "q2", "a2"])),
  ).toEqual(["q1", "q2", "a2"]);
});

test("a regenerated reply replaces the one the browser held", () => {
  const regenerated = assistant("a1b");
  expect(
    ids(browserSave([q1, a1], [q1, regenerated], ["q1", "a1", "a1b"])),
  ).toEqual(["q1", "a1b"]);
});

test("a regenerated reply the browser never saw replaces the stored one in the hook", () => {
  const regenerated = assistant("a1b");
  expect(ids(hookSave([q1, a1], [q1, regenerated]))).toEqual(["q1", "a1b"]);
});

test("an edited question drops what followed it", () => {
  const edited = user("q1b");
  expect(ids(browserSave([q1, a1], [edited], ["q1", "a1", "q1b"]))).toEqual([
    "q1b",
  ]);
});

test("without known_ids the browser's history replaces the stored one", () => {
  expect(ids(browserSave([q1, a1, q2], [q1], undefined))).toEqual(["q1"]);
});

test("the browser's copy of a shared message wins", () => {
  const edited = { ...a1, parts: [{ type: "text", text: "newer" }] };
  const merged = browserSave([q1, a1], [q1, edited], ["q1", "a1"]);
  expect(merged[1]).toBe(edited);
});

test("a thread with nothing stored is the writer's history", () => {
  expect(ids(browserSave([], [q1], ["q1"]))).toEqual(["q1"]);
  expect(ids(hookSave([], [q1, a1]))).toEqual(["q1", "a1"]);
});
