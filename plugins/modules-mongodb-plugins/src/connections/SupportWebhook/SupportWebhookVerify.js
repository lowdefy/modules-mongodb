/**
 * SupportWebhookVerify — passes a delivery when any `sha256=<hex>` entry in
 * the Pelican-Signature header is the HMAC-SHA256 of "{timestamp}.{rawBody}"
 * with the connection's secret, and the Pelican-Timestamp (Unix seconds) is
 * within five minutes of now, either side. Pelican sends one entry per live secret, so a
 * rotated secret keeps verifying while the old one is still listed.
 *
 * Never throws on bad input: a malformed or missing header is a failed
 * verification, which the webhook gate answers with 401.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_AGE_SECONDS = 300;

const HEX_SHA256 = /^[0-9a-f]{64}$/i;

export function verifySignature({
  secret,
  rawBody,
  timestamp,
  signature,
  now,
}) {
  if (typeof secret !== "string" || secret.length === 0) return false;
  if (typeof rawBody !== "string") return false;
  if (typeof timestamp !== "string" || !/^\d+$/.test(timestamp)) return false;
  if (typeof signature !== "string" || signature.length === 0) return false;

  const age = Math.floor(now / 1000) - Number(timestamp);
  if (Math.abs(age) > MAX_AGE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest();

  let matched = false;
  for (const entry of signature.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed.startsWith("sha256=")) continue;
    const hex = trimmed.slice("sha256=".length);
    if (!HEX_SHA256.test(hex)) continue;
    if (timingSafeEqual(Buffer.from(hex, "hex"), expected)) {
      matched = true;
    }
  }
  return matched;
}

async function SupportWebhookVerify({ connection, request }) {
  return {
    verified: verifySignature({
      secret: connection?.secret,
      rawBody: request?.rawBody,
      timestamp: request?.timestamp,
      signature: request?.signature,
      now: Date.now(),
    }),
  };
}

SupportWebhookVerify.schema = {
  type: "object",
  properties: {
    rawBody: {
      type: ["string", "null"],
      description: "The exact request body text (_payload: rawBody).",
    },
    timestamp: {
      type: ["string", "null"],
      description:
        "The Pelican-Timestamp header, Unix seconds (_payload: headers.pelican-timestamp).",
    },
    signature: {
      type: ["string", "null"],
      description:
        "The Pelican-Signature header: comma-separated sha256=<hex> entries (_payload: headers.pelican-signature).",
    },
  },
};

SupportWebhookVerify.meta = { checkRead: false, checkWrite: false };

export default SupportWebhookVerify;
