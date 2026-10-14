import {
  CLAIM_PREFIX,
  claimBatch,
  claimNotice,
  readSetting,
  settingKey,
  writeSetting,
} from "./claimNotice.js";

const memoryStorage = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return {
    map,
    get length() {
      return map.size;
    },
    key: (i) => [...map.keys()][i] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
};

// Runs each request's callback only after the one before it has finished, as
// the browser's exclusive Web Locks do.
const serialLocks = () => {
  let tail = Promise.resolve();
  return {
    request: (name, fn) => {
      const run = tail.then(() => fn({ name }));
      tail = run.catch(() => {});
      return run;
    },
  };
};

test("the first claim of a notification wins and every later one is refused", async () => {
  const storage = memoryStorage();
  expect(await claimNotice("n1", { storage, now: 1000 })).toBe(true);
  expect(await claimNotice("n1", { storage, now: 2000 })).toBe(false);
  expect(storage.getItem(`${CLAIM_PREFIX}n1`)).toBe("1000");
});

test("two tabs claiming the same notification together play it once", async () => {
  const storage = memoryStorage();
  const locks = serialLocks();
  const results = await Promise.all([
    claimNotice("n1", { storage, locks }),
    claimNotice("n1", { storage, locks }),
  ]);
  expect(results.sort()).toEqual([false, true]);
});

test("claims older than a week are dropped, newer ones and other keys kept", async () => {
  const week = 7 * 24 * 60 * 60 * 1000;
  const now = 10 * week;
  const storage = memoryStorage({
    [`${CLAIM_PREFIX}old`]: String(now - week - 1),
    [`${CLAIM_PREFIX}recent`]: String(now - 1000),
    "app:menu-collapsed": "1",
  });
  await claimNotice("new", { storage, now });
  expect([...storage.map.keys()].sort()).toEqual([
    "app:menu-collapsed",
    `${CLAIM_PREFIX}new`,
    `${CLAIM_PREFIX}recent`,
  ]);
});

test("a visible tab wins a notification over a hidden tab that received it first", async () => {
  const storage = memoryStorage();
  const locks = serialLocks();
  const hidden = claimNotice("n1", {
    storage,
    locks,
    hidden: true,
    hiddenDelayMs: 20,
  });
  const visible = claimNotice("n1", { storage, locks });
  expect(await Promise.all([hidden, visible])).toEqual([false, true]);
});

test("a hidden tab still claims a notification no visible tab took", async () => {
  expect(
    await claimNotice("n1", {
      storage: memoryStorage(),
      hidden: true,
      hiddenDelayMs: 5,
    }),
  ).toBe(true);
});

test("a notification with no id is never claimed", async () => {
  expect(await claimNotice(null, { storage: memoryStorage() })).toBe(false);
});

test("with no storage, or storage that refuses writes, the tab plays", async () => {
  expect(await claimNotice("n1", {})).toBe(true);
  const refusing = memoryStorage();
  refusing.setItem = () => {
    throw new Error("QuotaExceededError");
  };
  expect(await claimNotice("n1", { storage: refusing })).toBe(true);
});

test("a batch plays when this tab claims any of its notifications", async () => {
  const storage = memoryStorage();
  expect(await claimBatch(["a", "b"], { storage })).toBe(true);
  expect(await claimBatch(["a", "b"], { storage })).toBe(false);
  expect(await claimBatch(["b", "c"], { storage })).toBe(true);
  expect(await claimBatch([], { storage })).toBe(false);
  expect(await claimBatch(null, { storage })).toBe(false);
});

test("the sound setting is off until it is turned on, per app", () => {
  const storage = memoryStorage();
  const key = settingKey("demo");
  expect(key).not.toBe(settingKey("other"));
  expect(readSetting(storage, key)).toBe(false);
  writeSetting(storage, key, true);
  expect(readSetting(storage, key)).toBe(true);
  expect(readSetting(storage, settingKey("other"))).toBe(false);
  writeSetting(storage, key, false);
  expect(readSetting(storage, key)).toBe(false);
  expect(readSetting(null, key)).toBe(false);
});
