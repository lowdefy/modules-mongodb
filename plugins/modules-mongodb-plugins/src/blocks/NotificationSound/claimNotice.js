// A notification chirps once across every tab and reload: the first tab to
// claim its id in localStorage plays it. The claim runs under a Web Lock of the
// same name, so two tabs receiving the notification together cannot both claim
// it. A hidden tab waits `hiddenDelayMs` before it claims, so a tab the viewer
// is looking at wins. Claims older than a week are dropped.
export const CLAIM_PREFIX = "lowdefy:notification-sound:claim:";
export const HIDDEN_DELAY_MS = 1500;
const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function pruneClaims(storage, now) {
  const stale = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (
      key &&
      key.startsWith(CLAIM_PREFIX) &&
      now - Number(storage.getItem(key)) > CLAIM_TTL_MS
    ) {
      stale.push(key);
    }
  }
  stale.forEach((key) => storage.removeItem(key));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function claimNotice(
  id,
  { storage, locks, hidden = false, hiddenDelayMs = HIDDEN_DELAY_MS, now } = {},
) {
  if (!id) return false;
  if (!storage) return true;
  if (hidden && hiddenDelayMs > 0) await sleep(hiddenDelayMs);
  const at = now ?? Date.now();
  const key = `${CLAIM_PREFIX}${id}`;
  const claim = () => {
    try {
      if (storage.getItem(key) !== null) return false;
      pruneClaims(storage, at);
      storage.setItem(key, String(at));
    } catch {
      // Storage refused (full, or blocked): play in this tab.
    }
    return true;
  };
  if (!locks) return claim();
  return locks.request(key, claim);
}

// True when any id in the batch is claimed by this tab. Every id is claimed,
// so a later tab or reload refuses the whole batch. A hidden tab waits once
// for the batch, not once per id.
export async function claimBatch(ids, env = {}) {
  const list = Array.isArray(ids) ? ids : [];
  if (list.length === 0) return false;
  const { hidden = false, hiddenDelayMs = HIDDEN_DELAY_MS } = env;
  if (hidden && hiddenDelayMs > 0) await sleep(hiddenDelayMs);
  let won = false;
  for (const id of list) {
    if (await claimNotice(id, { ...env, hidden: false })) won = true;
  }
  return won;
}

// The localStorage key holding one app's sound setting, "on" or "off".
export const settingKey = (app) => `lowdefy:notification-sound:${app || "app"}`;

export function readSetting(storage, key) {
  try {
    return storage?.getItem(key) === "on";
  } catch {
    return false;
  }
}

export function writeSetting(storage, key, on) {
  try {
    storage?.setItem(key, on ? "on" : "off");
  } catch {
    // Storage refused: the setting holds for this page only.
  }
}

// The localStorage key holding one app's sound pick, a sound id.
export const soundKey = (app) => `${settingKey(app)}:sound`;

export function readSound(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeSound(storage, key, id) {
  try {
    storage?.setItem(key, id);
  } catch {
    // Storage refused: the pick holds for this page only.
  }
}
