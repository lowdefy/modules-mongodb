import { test, expect } from "../fixtures.js";
import { COLLECTION, USER, record } from "./fixtures.js";

// Notification sounds: the viewer picks one on the User components page, and
// the page-wide player plays it for a popup notification. A fake AudioContext
// records each sound that plays: "chirp" for the synthesised chirp, "file" for
// a decoded sound file.

const SETTING_PREFIX = "lowdefy:notification-sound:";

async function fakeAudio(page) {
  await page.addInitScript(() => {
    window.__played = [];
    const param = () => ({
      setValueAtTime(value) {
        this.value = value;
      },
      exponentialRampToValueAtTime() {},
    });
    const node = (extra) => ({ connect: (next) => next, ...extra });
    window.AudioContext = class {
      state = "running";
      currentTime = 0;
      destination = node();
      resume() {
        return Promise.resolve();
      }
      createOscillator() {
        const frequency = param();
        return node({
          frequency,
          start: () => {
            if (frequency.value === 1318.5) window.__played.push("chirp");
          },
          stop() {},
        });
      }
      createGain() {
        return node({ gain: param() });
      }
      createBufferSource() {
        const source = node({
          start: () => window.__played.push(source.buffer.kind),
        });
        return source;
      }
      decodeAudioData(data) {
        return Promise.resolve({ kind: data.byteLength > 0 ? "file" : "" });
      }
    };
  });
}

const played = (page) => page.evaluate(() => window.__played);

// The app's sound setting and pick in localStorage, whatever the app's slug.
const stored = (page) =>
  page.evaluate((prefix) => {
    const entries = Object.entries(window.localStorage).filter(
      ([key]) => key.startsWith(prefix) && !key.includes(":claim:"),
    );
    return {
      setting: entries.find(([key]) => !key.endsWith(":sound"))?.[1] ?? null,
      sound: entries.find(([key]) => key.endsWith(":sound"))?.[1] ?? null,
    };
  }, SETTING_PREFIX);

async function openWithFeed(ldf, page, path) {
  let subscribed = false;
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      if (String(payload).includes("notifications-live")) subscribed = true;
    });
  });
  await ldf.goto(path);
  await expect.poll(() => subscribed).toBe(true);
}

async function popup(page, mdb, _id) {
  await mdb
    .collection(COLLECTION)
    .insertOne(
      record({ _id, type: "quote-approved", title: _id, popup: true }),
    );
  await expect(page.locator("#popup_notifications")).toContainText(_id, {
    timeout: 5000,
  });
}

const picker = (page) => page.locator("#notification_sound_picker");

test.beforeEach(async ({ mdb, ldf, page }) => {
  await mdb.collection(COLLECTION).deleteMany({});
  await ldf.user(USER);
  await fakeAudio(page);
});

test("the viewer picks a sound, hears it, and a popup notification plays it", async ({
  ldf,
  page,
  mdb,
}) => {
  await openWithFeed(ldf, page, "/user-components-demo");
  await expect(picker(page)).toContainText("Off");

  await picker(page).locator(".ant-select").click();
  const options = page.locator(".ant-select-item-option");
  await expect(options).toHaveCount(2);
  await expect(options.nth(1)).toContainText("A soft ring that fades out.");

  // Hearing a sound plays it without picking it.
  await page.getByRole("button", { name: "Hear Bell" }).click();
  await expect.poll(() => played(page)).toEqual(["file"]);
  expect(await stored(page)).toEqual({ setting: null, sound: null });

  await options.nth(1).click();
  await expect(picker(page)).toContainText("Bell");
  expect(await stored(page)).toEqual({ setting: "on", sound: "bell" });
  await expect.poll(() => played(page)).toEqual(["file", "file"]);

  await popup(page, mdb, "sound-1");
  await expect.poll(() => played(page)).toEqual(["file", "file", "file"]);

  // The inbox switch turns it off, and back on with a preview of the pick.
  await ldf.goto("/notifications/all");
  const toggle = page.locator("#notifications_sound_toggle_input");
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  expect(await stored(page)).toEqual({ setting: "off", sound: "bell" });
  await toggle.click();
  await expect.poll(() => played(page)).toEqual(["file"]);

  await toggle.click();
  await ldf.goto("/user-components-demo");
  await expect(picker(page)).toContainText("Off");
});

test("a pick the app no longer offers plays the first sound", async ({
  ldf,
  page,
  mdb,
}) => {
  await openWithFeed(ldf, page, "/user-components-demo");
  // Turn the sound on with the picker, then store a pick no sound has.
  await picker(page).locator(".ant-select").click();
  await page.locator(".ant-select-item-option").nth(1).click();
  await expect.poll(() => played(page)).toEqual(["file"]);
  await page.evaluate((prefix) => {
    const key = Object.keys(window.localStorage).find(
      (k) => k.startsWith(prefix) && k.endsWith(":sound"),
    );
    window.localStorage.setItem(key, "gong");
    window.__played = [];
  }, SETTING_PREFIX);

  await popup(page, mdb, "sound-2");
  await expect.poll(() => played(page)).toEqual(["chirp"]);
});

test("with the sound off a popup notification plays nothing", async ({
  ldf,
  page,
  mdb,
}) => {
  await openWithFeed(ldf, page, "/user-components-demo");
  await popup(page, mdb, "sound-3");
  await page.waitForTimeout(500);
  expect(await played(page)).toEqual([]);
});
