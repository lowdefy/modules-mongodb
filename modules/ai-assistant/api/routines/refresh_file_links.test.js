/**
 * Runs the `_js` bodies of the thread loaders' message routines
 * (sanitize_messages.yaml, then refresh_file_links.yaml) against stored
 * messages, to pin which file parts get a new link and which keep theirs.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const readYaml = (name) => loadYaml(readFileSync(join(here, name), "utf8"));

const sanitize = readYaml("sanitize_messages.yaml");
const refresh = readYaml("refresh_file_links.yaml");
const steps = refresh["_build.if"].then;
const linksIf = steps[1];
const [callStep, storeLinks, relinkStep] = linksIf[":then"];

function runJs(code, state) {
  return new Function("state", code)((key) => state[key]);
}

const sanitized = (rawMessages) =>
  runJs(sanitize[0][":set_state"].replayable_messages._js, {
    raw_messages: rawMessages,
  });

const keyedFiles = (messages) =>
  runJs(steps[0][":set_state"].keyed_files._js, {
    replayable_messages: messages,
  });

const relinked = (messages, fileLinks) =>
  runJs(relinkStep[":set_state"].replayable_messages._js, {
    replayable_messages: messages,
    file_links: fileLinks,
  });

const filePart = ({ key, url, filename = "shot.png" }) => ({
  type: "file",
  url,
  mediaType: "image/png",
  filename,
  ...(key === undefined ? {} : { providerMetadata: { lowdefy: { key } } }),
});

const thread = [
  {
    id: "m1",
    role: "user",
    parts: [
      { type: "text", text: "What is wrong here?" },
      filePart({ key: "uploads/u1/a/shot.png", url: "https://old/a" }),
    ],
  },
  {
    id: "m2",
    role: "assistant",
    parts: [{ type: "text", text: "The button is cut off." }],
  },
  {
    id: "m3",
    role: "user",
    parts: [
      { type: "text", text: "And this one?" },
      filePart({
        key: "uploads/u1/b/log.txt",
        url: "https://old/b",
        filename: "log.txt",
      }),
      // Inline base64, from a chat with no storage policy: no key.
      filePart({ url: "data:image/png;base64,AAAA" }),
      // The same upload attached again.
      filePart({ key: "uploads/u1/a/shot.png", url: "https://old/a" }),
    ],
  },
];

test("sanitize_messages keeps a file part's providerMetadata", () => {
  const out = sanitized(thread);
  expect(out[0].parts[1].providerMetadata).toEqual({
    lowdefy: { key: "uploads/u1/a/shot.png" },
  });
});

test("collects each keyed file part once, in message order, with its name and type", () => {
  expect(keyedFiles(thread)).toEqual([
    {
      key: "uploads/u1/a/shot.png",
      filename: "shot.png",
      mediaType: "image/png",
    },
    {
      key: "uploads/u1/b/log.txt",
      filename: "log.txt",
      mediaType: "image/png",
    },
  ]);
});

test("a thread with no keyed file parts collects nothing", () => {
  expect(
    keyedFiles([
      { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      { id: "m2", role: "user", parts: [filePart({ url: "data:," })] },
      {
        id: "m3",
        role: "user",
        parts: [filePart({ key: "", url: "https://x" })],
      },
      { id: "m4", role: "assistant" },
    ]),
  ).toEqual([]);
});

test("each keyed part takes its key's new link and keeps the rest of the part", () => {
  const out = relinked(thread, [
    { key: "uploads/u1/a/shot.png", url: "https://new/a" },
    { key: "uploads/u1/b/log.txt", url: "https://new/b" },
  ]);
  expect(out[0].parts[1]).toEqual(
    filePart({ key: "uploads/u1/a/shot.png", url: "https://new/a" }),
  );
  expect(out[2].parts[1].url).toBe("https://new/b");
  expect(out[2].parts[3].url).toBe("https://new/a");
  expect(out[0].parts[0]).toEqual(thread[0].parts[0]);
  expect(out[1]).toEqual(thread[1]);
});

test("a key answered with url null, or not answered, keeps its stored link", () => {
  const out = relinked(thread, [{ key: "uploads/u1/a/shot.png", url: null }]);
  expect(out[0].parts[1].url).toBe("https://old/a");
  expect(out[2].parts[1].url).toBe("https://old/b");
  expect(out[2].parts[2].url).toBe("data:image/png;base64,AAAA");
});

test("an endpoint that answers no files leaves every link as stored", () => {
  expect(relinked(thread, null)).toEqual(thread);
});

test("the endpoint is called once, only when a part carries a key", () => {
  expect(refresh["_build.if"].else).toEqual([]);
  expect(linksIf[":if"]).toEqual({
    _gt: [{ "_array.length": { _state: "keyed_files" } }, 0],
  });
  expect(callStep).toEqual({
    id: "file_links",
    type: "CallApi",
    properties: {
      endpointId: { "_module.var": "file_links_endpoint" },
      payload: { files: { _state: "keyed_files" } },
    },
  });
  expect(storeLinks[":set_state"].file_links).toEqual({
    _step: "file_links.files",
  });
});
