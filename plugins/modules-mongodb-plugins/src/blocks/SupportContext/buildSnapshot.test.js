import buildSnapshot from "./buildSnapshot.js";
import { createRecorder } from "./recorder.js";

const win = {
  location: { href: "https://app.example.com/tickets?id=1" },
  navigator: { userAgent: "Mozilla/5.0 Test", language: "en-ZA" },
  innerWidth: 1280,
  innerHeight: 720,
  screen: { width: 1920, height: 1080 },
  devicePixelRatio: 2,
};

test("carries the browser, viewport, screen, locale, timezone and errors", () => {
  const recorder = createRecorder();
  recorder.record("console", ["Request failed"]);
  const snapshot = buildSnapshot(win, recorder);
  expect(snapshot).toEqual({
    url: "https://app.example.com/tickets?id=1",
    user_agent: "Mozilla/5.0 Test",
    viewport: { width: 1280, height: 720 },
    screen: { width: 1920, height: 1080, pixel_ratio: 2 },
    locale: "en-ZA",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    errors: [
      expect.objectContaining({ kind: "console", message: "Request failed" }),
    ],
  });
  expect(Object.keys(snapshot)).toEqual([
    "url",
    "user_agent",
    "viewport",
    "screen",
    "locale",
    "timezone",
    "errors",
  ]);
});

test("gives an empty error list without a recorder", () => {
  expect(buildSnapshot(win, null).errors).toEqual([]);
});
