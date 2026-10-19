import _support_context from "./supportContextOperator.js";
import { GLOBAL_KEY } from "./recorder.js";

const fakeWindow = () => ({
  location: { href: "https://app.example.com/orders?id=1" },
  navigator: { userAgent: "Mozilla/5.0 Test", language: "en-ZA" },
  innerWidth: 1280,
  innerHeight: 720,
  screen: { width: 1920, height: 1080 },
  devicePixelRatio: 2,
  console: { error: () => {} },
  addEventListener: () => {},
});

test("gives the page id and the snapshot, recording errors from then on", () => {
  const win = fakeWindow();
  const first = _support_context({
    globals: { window: win },
    pageId: "orders",
  });
  expect(first).toMatchObject({
    page: "orders",
    url: "https://app.example.com/orders?id=1",
    user_agent: "Mozilla/5.0 Test",
    viewport: { width: 1280, height: 720 },
    screen: { width: 1920, height: 1080, pixel_ratio: 2 },
    locale: "en-ZA",
    errors: [],
  });
  expect(win[GLOBAL_KEY]).toBeDefined();

  win.console.error("Request failed");
  const second = _support_context({
    globals: { window: win },
    pageId: "orders",
  });
  expect(second.errors).toMatchObject([
    { kind: "console", message: "Request failed" },
  ]);
});

test("is null outside a browser", () => {
  expect(_support_context({ globals: {}, pageId: "orders" })).toBe(null);
});

test("is volatile, so its block evaluates on every pass", () => {
  expect(_support_context.tracking).toEqual({ kind: "volatile" });
});
