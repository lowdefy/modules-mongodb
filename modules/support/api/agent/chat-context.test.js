/**
 * Runs the `_js` in parts/chat-context.yaml: the context of a ticket the app's
 * agent files, taken from the chat's shared state, never from the model.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const steps = loadYaml(
  readFileSync(join(here, "parts/chat-context.yaml"), "utf8"),
);
const code = steps.find((step) => step[":set_state"]?.chat_context)[
  ":set_state"
].chat_context._js;

const chatContext = ({ shared, page = null, url = null }) =>
  new Function("state", code)(() => ({ shared, page, url }));

const snapshot = {
  page: "orders",
  url: "https://app.example.com/orders",
  user_agent: "Mozilla/5.0 Test",
  viewport: { width: 1280, height: 720 },
  screen: { width: 1920, height: 1080, pixel_ratio: 2 },
  locale: "en-ZA",
  timezone: "Africa/Johannesburg",
  errors: [
    {
      at: "2026-10-13T09:00:00.000Z",
      kind: "console",
      message: "Request failed",
      stack: "Error: Request failed\n    at load",
    },
    {
      at: "2026-10-13T09:00:01.000Z",
      kind: "console",
      message: "Request ID: r1",
    },
  ],
};

test("carries the shared snapshot: browser, viewport, screen, locale, time zone and errors", () => {
  expect(chatContext({ shared: { support_context: snapshot } })).toEqual(
    snapshot,
  );
});

test("the snapshot's page and url win over the model's", () => {
  const context = chatContext({
    shared: { support_context: snapshot },
    page: "made-up",
    url: "https://evil.example/",
  });
  expect(context.page).toBe("orders");
  expect(context.url).toBe("https://app.example.com/orders");
});

test("the model's page and url are the fallback when the chat shares none", () => {
  for (const shared of [null, {}, { support_context: null }, "text"]) {
    expect(
      chatContext({
        shared,
        page: "orders",
        url: "https://app.example.com/orders",
      }),
    ).toEqual({
      page: "orders",
      url: "https://app.example.com/orders",
      user_agent: null,
      viewport: null,
      screen: null,
      locale: null,
      timezone: null,
      errors: [],
    });
  }
});

test("keeps only the snapshot's own fields", () => {
  const context = chatContext({
    shared: {
      support_context: {
        ...snapshot,
        app: "other-app",
        environment: "production",
        organization: { id: "o2", name: "Another" },
        extra: { filed_by: "person" },
        viewport: { width: 1280, height: "720", depth: 3 },
      },
      record_id: "r1",
    },
  });
  expect(Object.keys(context)).toEqual([
    "page",
    "url",
    "user_agent",
    "viewport",
    "screen",
    "locale",
    "timezone",
    "errors",
  ]);
  expect(context.viewport).toEqual({ width: 1280, height: null });
});

test("holds errors and texts to the recorder's limits", () => {
  const errors = Array.from({ length: 25 }, (_, index) => ({
    at: "2026-10-13T09:00:00.000Z",
    kind: index === 0 ? "unknown" : "error",
    message: `error ${index + 1} ${"x".repeat(3000)}`,
    stack: "y".repeat(3000),
    extra: "dropped",
  }));
  const context = chatContext({
    shared: {
      support_context: {
        ...snapshot,
        user_agent: "z".repeat(5000),
        errors: [...errors, "not an entry"],
      },
    },
  });
  expect(context.errors).toHaveLength(20);
  expect(context.errors[0].message.startsWith("error 6 ")).toBe(true);
  for (const entry of context.errors) {
    expect(Object.keys(entry)).toEqual(["at", "kind", "message", "stack"]);
    expect(entry.message).toHaveLength(2000);
    expect(entry.stack).toHaveLength(2000);
    expect(entry.kind).toBe("error");
  }
  expect(context.user_agent).toHaveLength(2000);
});

test("an error with no stack has none", () => {
  const context = chatContext({ shared: { support_context: snapshot } });
  expect(context.errors[1]).toEqual({
    at: "2026-10-13T09:00:01.000Z",
    kind: "console",
    message: "Request ID: r1",
  });
});
