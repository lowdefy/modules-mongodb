// Keeps the browser tab's recent errors for support tickets: console.error
// calls, uncaught errors and unhandled promise rejections. Nothing leaves the
// browser; SupportContext reads the entries when a ticket is sent.

export const GLOBAL_KEY = "__lowdefySupportRecorder";
export const MAX_ENTRIES = 20;
export const MAX_CHARS = 2000;

const truncate = (text) =>
  text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS - 1)}…` : text;

const isError = (value) =>
  value instanceof Error ||
  (value !== null &&
    typeof value === "object" &&
    typeof value.message === "string" &&
    typeof value.stack === "string");

const toText = (value) => {
  if (typeof value === "string") return value;
  if (isError(value)) return value.message;
  if (value === undefined) return "undefined";
  if (typeof value === "function")
    return `[function ${value.name || "anonymous"}]`;
  if (value !== null && typeof value === "object") {
    try {
      const json = JSON.stringify(value);
      if (json !== undefined) return truncate(json);
    } catch {
      // Circular or otherwise unserialisable: fall through to String.
    }
  }
  try {
    return String(value);
  } catch {
    return "[unprintable]";
  }
};

// One message from a call's arguments, with the stack of the first Error
// among them.
export const flatten = (args) => {
  const list = Array.isArray(args) ? args : [args];
  const message = truncate(list.map(toText).join(" "));
  const error = list.find(isError);
  return error?.stack
    ? { message, stack: truncate(String(error.stack)) }
    : { message };
};

export const createRecorder = ({ now = () => new Date() } = {}) => {
  const entries = [];
  const record = (kind, args) => {
    entries.push({ at: now().toISOString(), kind, ...flatten(args) });
    if (entries.length > MAX_ENTRIES)
      entries.splice(0, entries.length - MAX_ENTRIES);
  };
  return {
    record,
    entries: () => entries.map((entry) => ({ ...entry })),
  };
};

// Installs the recorder once per tab. A second call returns the first one.
export const installRecorder = (win) => {
  if (!win) return null;
  if (win[GLOBAL_KEY]) return win[GLOBAL_KEY];
  const recorder = createRecorder();
  const console = win.console;
  if (console && typeof console.error === "function") {
    const original = console.error;
    console.error = function supportRecorderConsoleError(...args) {
      try {
        recorder.record("console", args);
      } catch {
        // Recording never stands in the way of the log.
      }
      return original.apply(this, args);
    };
  }
  win.addEventListener?.("error", (event) => {
    const error = event?.error;
    recorder.record(
      "error",
      error !== undefined && error !== null
        ? [error]
        : [event?.message ?? "Unknown error"],
    );
  });
  win.addEventListener?.("unhandledrejection", (event) => {
    recorder.record("rejection", [event?.reason]);
  });
  Object.defineProperty(win, GLOBAL_KEY, {
    value: recorder,
    configurable: false,
    enumerable: false,
    writable: false,
  });
  return recorder;
};
