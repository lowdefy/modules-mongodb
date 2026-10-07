/**
 * Runs the `_js` in the agent tools: the chat files a ticket or message carries
 * (parts/resolve-chat-files.yaml), and the lean answers of agent-list-my-tickets
 * and agent-read-ticket.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const readYaml = (path) => loadYaml(readFileSync(join(here, path), "utf8"));

function runJs(code, state) {
  return new Function("state", code)((key) => state[key]);
}

const resolveSteps = readYaml("parts/resolve-chat-files.yaml");
const chooseCode = resolveSteps.find((step) => step[":set_state"]?.chat_files)[
  ":set_state"
].chat_files._js;
const chatFiles = ({ files, prefix = "ai-assistant/u1/", sent = [] }) =>
  runJs(chooseCode, { chat_files_input: { files, prefix, sent } });

const listCode = readYaml("agent-list-my-tickets.yaml").routine.find(
  (step) => step[":return"],
)[":return"].tickets._js;
const readCode = readYaml("agent-read-ticket.yaml").routine.find(
  (step) => step[":return"],
)[":return"].ticket._js;
const stages = readYaml("../../enums/stages.yaml");

const chatFile = (name, mediaType = "image/png", owner = "u1") => ({
  key: `ai-assistant/${owner}/k-${name}/${name}`,
  filename: name,
  mediaType,
});

describe("the chat files a ticket or message carries", () => {
  test("are the caller's own images and PDFs, as { key, name }", () => {
    expect(
      chatFiles({
        files: [
          chatFile("shot.png"),
          chatFile("invoice.pdf", "application/pdf"),
        ],
      }),
    ).toEqual([
      { key: "ai-assistant/u1/k-shot.png/shot.png", name: "shot.png" },
      { key: "ai-assistant/u1/k-invoice.pdf/invoice.pdf", name: "invoice.pdf" },
    ]);
  });

  test("leave out another user's upload and a key outside the prefix", () => {
    expect(
      chatFiles({
        files: [
          chatFile("theirs.png", "image/png", "u2"),
          {
            key: "support/u1/a/form.png",
            filename: "form.png",
            mediaType: "image/png",
          },
          chatFile("mine.png"),
        ],
      }).map((file) => file.name),
    ).toEqual(["mine.png"]);
  });

  test("are none when the app sets no prefix", () => {
    expect(chatFiles({ files: [chatFile("shot.png")], prefix: null })).toEqual(
      [],
    );
    expect(chatFiles({ files: [chatFile("shot.png")], prefix: "" })).toEqual(
      [],
    );
  });

  test("are none when no agent called, or the chat has no files", () => {
    expect(chatFiles({ files: null })).toEqual([]);
    expect(chatFiles({ files: [] })).toEqual([]);
  });

  test("leave out files Pelican does not take", () => {
    expect(
      chatFiles({
        files: [
          chatFile(
            "notes.docx",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ),
          chatFile("data.csv", "text/csv"),
          chatFile("photo.jpg", "image/jpeg"),
        ],
      }).map((file) => file.name),
    ).toEqual(["photo.jpg"]);
  });

  test("leave out keys already sent on the ticket, and send each key once", () => {
    const shot = chatFile("shot.png");
    const later = chatFile("later.png");
    expect(
      chatFiles({ files: [shot, later, later], sent: [shot.key] }),
    ).toEqual([{ key: later.key, name: "later.png" }]);
  });

  test("are at most five, the first in the chat", () => {
    const files = ["1", "2", "3", "4", "5", "6"].map((n) =>
      chatFile(`${n}.png`),
    );
    expect(chatFiles({ files }).map((file) => file.name)).toEqual([
      "1.png",
      "2.png",
      "3.png",
      "4.png",
      "5.png",
    ]);
  });

  test("are named by the key's last part when the chat gave no name", () => {
    expect(
      chatFiles({
        files: [
          {
            key: "ai-assistant/u1/k/pasted.png",
            filename: null,
            mediaType: "image/png",
          },
        ],
      }),
    ).toEqual([{ key: "ai-assistant/u1/k/pasted.png", name: "pasted.png" }]);
  });

  test("skip a malformed entry", () => {
    expect(
      chatFiles({
        files: [null, { filename: "x.png" }, chatFile("ok.png")],
      }).map((file) => file.name),
    ).toEqual(["ok.png"]);
  });
});

test("agent-list-my-tickets answers each ticket lean", () => {
  expect(
    runJs(listCode, {
      agent_tickets: [
        {
          id: "t1",
          key: "SUP-1",
          title: "Export fails",
          type: "bug",
          stage: "needs_your_reply",
          updated: "2026-10-07T09:00:00.000Z",
          organization: { id: "o1", name: "Org" },
          unread: true,
        },
        {
          id: "t2",
          key: "SUP-2",
          title: "Idea",
          stage: "received",
          updated: null,
        },
      ],
      stages,
    }),
  ).toEqual([
    {
      key: "SUP-1",
      title: "Export fails",
      stage: "Needs your reply",
      updated: "2026-10-07T09:00:00.000Z",
      unread: true,
    },
    {
      key: "SUP-2",
      title: "Idea",
      stage: "Received",
      updated: null,
      unread: false,
    },
  ]);
  expect(runJs(listCode, { agent_tickets: null, stages })).toEqual([]);
});

describe("agent-read-ticket", () => {
  const view = {
    id: "t1",
    key: "SUP-1",
    title: "Export fails",
    type: "bug",
    version: 3,
    stage: "needs_your_reply",
    created: "2026-10-07T09:00:00.000Z",
    updated: "2026-10-07T10:00:00.000Z",
    messages: [
      {
        id: "m1",
        from: "reporter",
        author: { name: "Ann", initials: "A" },
        at: "2026-10-07T09:00:00.000Z",
        text: "It fails.",
        files: [{ name: "shot.png", url: "https://pelican.example/shot.png" }],
        deleted: false,
      },
      {
        id: "m2",
        from: "team",
        author: { name: "Pelican", initials: "P" },
        at: "2026-10-07T10:00:00.000Z",
        text: "Which browser?",
        files: [],
        deleted: false,
      },
      {
        id: "m3",
        from: "team",
        author: { name: "Sam", initials: "S" },
        at: "2026-10-07T10:05:00.000Z",
        text: null,
        files: null,
        deleted: true,
      },
    ],
  };

  test("answers the thread with file names, never their links", () => {
    expect(runJs(readCode, { agent_view: view, stages })).toEqual({
      key: "SUP-1",
      title: "Export fails",
      type: "bug",
      stage: "Needs your reply",
      created: "2026-10-07T09:00:00.000Z",
      updated: "2026-10-07T10:00:00.000Z",
      messages: [
        {
          from: "reporter",
          author: "Ann",
          at: "2026-10-07T09:00:00.000Z",
          text: "It fails.",
          files: ["shot.png"],
          deleted: false,
        },
        {
          from: "team",
          author: "Pelican",
          at: "2026-10-07T10:00:00.000Z",
          text: "Which browser?",
          files: [],
          deleted: false,
        },
        {
          from: "team",
          author: "Sam",
          at: "2026-10-07T10:05:00.000Z",
          text: null,
          files: [],
          deleted: true,
        },
      ],
    });
  });

  test("answers null when there is no ticket", () => {
    expect(runJs(readCode, { agent_view: null, stages })).toBeNull();
  });
});
