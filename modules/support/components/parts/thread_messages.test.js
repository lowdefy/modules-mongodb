/**
 * Runs the `_js` in thread_messages.yaml, which maps a stored view's messages
 * onto ChatThread.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const code = loadYaml(readFileSync(join(here, "thread_messages.yaml"), "utf8"))
  ._js.fn;

const map = (messages) => new Function("args", code)({ messages });

test("a message maps onto ChatThread's shape", () => {
  expect(
    map([
      {
        id: "m1",
        from: "team",
        author: { name: "Grace Hopper", initials: "GH" },
        at: "2026-10-07T09:00:00.000Z",
        text: "Fixed in the next release.",
        files: [
          { name: "shot.png", url: "https://pelican.example/shot.png" },
          { name: "Invoice.PDF", url: "https://pelican.example/invoice" },
        ],
        deleted: false,
      },
    ]),
  ).toEqual([
    {
      _id: "m1",
      author_type: "team",
      author: { name: "Grace Hopper" },
      body: "Fixed in the next release.",
      attachments: [
        {
          name: "shot.png",
          url: "https://pelican.example/shot.png",
          mime: "image/*",
        },
        {
          name: "Invoice.PDF",
          url: "https://pelican.example/invoice",
          mime: "application/pdf",
        },
      ],
      seq: "2026-10-07T09:00:00.000Z",
    },
  ]);
});

test("a removed message keeps its place as Removed, with no files", () => {
  const [message] = map([
    {
      id: "m2",
      from: "reporter",
      author: { name: "Ann" },
      at: "2026-10-07T09:05:00.000Z",
      text: "secret",
      files: [{ name: "a.png", url: "https://pelican.example/a.png" }],
      deleted: true,
    },
  ]);
  expect(message.body).toBe("Removed");
  expect(message.attachments).toEqual([]);
  expect(message.seq).toBe("2026-10-07T09:05:00.000Z");
});

test("no messages map to none", () => {
  expect(map(null)).toEqual([]);
});
