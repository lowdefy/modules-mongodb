import { createHmac } from "node:crypto";

import SupportWebhook from "./SupportWebhook.js";
import SupportWebhookVerify, {
  verifySignature,
} from "./SupportWebhookVerify.js";

const SECRET = "whsec_current";
const OLD_SECRET = "whsec_previous";
const BODY = JSON.stringify({
  event: "ticket.message",
  at: "2026-10-07T09:00:00.000Z",
  delivery_id: "d-1",
  user_id: "u-1",
  ticket: { id: "t-1", version: 3 },
});
const NOW = Date.UTC(2026, 9, 7, 9, 0, 0);
const NOW_SECONDS = String(Math.floor(NOW / 1000));

const sign = (secret, timestamp, body) =>
  `sha256=${createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex")}`;

const check = (overrides = {}) =>
  verifySignature({
    secret: SECRET,
    rawBody: BODY,
    timestamp: NOW_SECONDS,
    signature: sign(SECRET, NOW_SECONDS, BODY),
    now: NOW,
    ...overrides,
  });

describe("verifySignature", () => {
  test("one valid signature passes", () => {
    expect(check()).toBe(true);
  });

  test("passes when only the second of two signatures matches", () => {
    const signature = [
      sign(OLD_SECRET, NOW_SECONDS, BODY),
      sign(SECRET, NOW_SECONDS, BODY),
    ].join(",");
    expect(check({ signature })).toBe(true);
  });

  test("passes with a space after the comma", () => {
    const signature = `${sign(OLD_SECRET, NOW_SECONDS, BODY)}, ${sign(SECRET, NOW_SECONDS, BODY)}`;
    expect(check({ signature })).toBe(true);
  });

  test("fails when no signature matches", () => {
    const signature = [
      sign(OLD_SECRET, NOW_SECONDS, BODY),
      sign("whsec_other", NOW_SECONDS, BODY),
    ].join(",");
    expect(check({ signature })).toBe(false);
  });

  test("fails when the body changed by one byte", () => {
    expect(check({ rawBody: BODY.replace("t-1", "t-2") })).toBe(false);
    expect(check({ rawBody: `${BODY} ` })).toBe(false);
  });

  test("fails when the signature was made for another timestamp", () => {
    const earlier = String(Number(NOW_SECONDS) - 10);
    expect(check({ timestamp: earlier })).toBe(false);
  });

  test("passes at exactly 300 seconds and fails at 301", () => {
    const at300 = String(Number(NOW_SECONDS) - 300);
    const at301 = String(Number(NOW_SECONDS) - 301);
    expect(
      check({ timestamp: at300, signature: sign(SECRET, at300, BODY) }),
    ).toBe(true);
    expect(
      check({ timestamp: at301, signature: sign(SECRET, at301, BODY) }),
    ).toBe(false);
  });

  test("fails on a missing or non-numeric timestamp", () => {
    for (const timestamp of [undefined, null, "", "abc", "12.5", "-5", " 1"]) {
      expect(
        check({ timestamp, signature: sign(SECRET, String(timestamp), BODY) }),
      ).toBe(false);
    }
  });

  test("fails on a missing signature header", () => {
    for (const signature of [undefined, null, ""]) {
      expect(check({ signature })).toBe(false);
    }
  });

  test("fails on an entry without sha256=", () => {
    const hex = sign(SECRET, NOW_SECONDS, BODY).slice("sha256=".length);
    expect(check({ signature: hex })).toBe(false);
    expect(check({ signature: `sha1=${hex}` })).toBe(false);
  });

  test("fails on odd-length, wrong-length or non-hex values without throwing", () => {
    const hex = sign(SECRET, NOW_SECONDS, BODY).slice("sha256=".length);
    for (const value of [
      hex.slice(1),
      hex.slice(2),
      `${hex}00`,
      "",
      "zz".repeat(32),
    ]) {
      expect(() => check({ signature: `sha256=${value}` })).not.toThrow();
      expect(check({ signature: `sha256=${value}` })).toBe(false);
    }
  });

  test("fails on a missing body", () => {
    expect(check({ rawBody: undefined })).toBe(false);
    expect(check({ rawBody: null })).toBe(false);
  });

  test("fails on an empty or missing secret", () => {
    for (const secret of [undefined, null, ""]) {
      expect(check({ secret, signature: sign("", NOW_SECONDS, BODY) })).toBe(
        false,
      );
    }
  });
});

describe("SupportWebhookVerify", () => {
  test("returns { verified: true } for a delivery signed now", async () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    await expect(
      SupportWebhookVerify({
        connection: { secret: SECRET },
        request: {
          rawBody: BODY,
          timestamp,
          signature: sign(SECRET, timestamp, BODY),
        },
      }),
    ).resolves.toEqual({ verified: true });
  });

  test("returns { verified: false } rather than throwing on empty input", async () => {
    await expect(
      SupportWebhookVerify({ connection: {}, request: {} }),
    ).resolves.toEqual({ verified: false });
    await expect(SupportWebhookVerify({})).resolves.toEqual({
      verified: false,
    });
  });

  test("is registered on the SupportWebhook connection", () => {
    expect(SupportWebhook.requests.SupportWebhookVerify).toBe(
      SupportWebhookVerify,
    );
    expect(SupportWebhook.meta).toEqual({ tenant: false });
  });
});
