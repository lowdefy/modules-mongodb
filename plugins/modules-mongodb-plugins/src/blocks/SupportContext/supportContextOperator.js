import buildSnapshot from "./buildSnapshot.js";
import { installRecorder } from "./recorder.js";

// Runs when the page's client operators load, so an app that reports through
// its agent, with no SupportContext block on the page, still keeps the tab's
// errors from the start.
if (typeof window !== "undefined") installRecorder(window);

// `_support_context: true`: the page id and the SupportContext snapshot (browser,
// viewport, screen, locale, time zone and the tab's last 20 errors), read when
// the block holding it evaluates. Null outside a browser.
function _support_context({ globals, pageId }) {
  const win = globals?.window;
  if (!win) return null;
  return {
    page: pageId ?? null,
    ...buildSnapshot(win, installRecorder(win)),
  };
}

// It reads the browser and the recorder live, which change with no state
// update to report it, so the block holding it evaluates on every pass.
_support_context.tracking = { kind: "volatile" };

export default _support_context;
