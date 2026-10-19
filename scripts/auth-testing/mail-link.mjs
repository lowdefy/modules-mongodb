#!/usr/bin/env node
// Pull the actionable link out of the latest email Mailpit caught.
//
// The auth flows (verify-email, password reset, invitation/accept, magic-link)
// all email a one-time URL. Rather than click through the Mailpit web UI, this
// reads the JSON API and prints the link — so email-gated flows can be scripted.
//
// Usage (from scripts/auth-testing/):
//   node mail-link.mjs                          # link from the newest message
//   node mail-link.mjs --to alice@example.com   # newest message to that recipient
//   node mail-link.mjs --json                   # raw message meta + every link found
//
// Env:
//   MAILPIT_URL   default http://localhost:8025

import { die } from './_shared.mjs';

const base = (process.env.MAILPIT_URL || 'http://localhost:8025').replace(/\/$/, '');
const args = process.argv.slice(2);
const asJson = args.includes('--json');
const toIdx = args.indexOf('--to');
const toFilter = toIdx !== -1 ? args[toIdx + 1]?.toLowerCase() : null;

// Auth links to surface first, most-specific first.
const KEYWORDS = ['token=', '/api/auth', 'verify', 'reset-password', 'accept', 'invitation', 'magic'];

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#38;/g, '&')
    .replace(/&#x2f;/gi, '/')
    .replace(/&#47;/g, '/')
    .replace(/&quot;/g, '"');
}

function extractLinks(text) {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s"'<>)\]]+/g) || [];
  return matches.map((m) => decodeEntities(m).replace(/[.,);]+$/, ''));
}

function rank(link) {
  const l = link.toLowerCase();
  const i = KEYWORDS.findIndex((k) => l.includes(k));
  return i === -1 ? KEYWORDS.length : i;
}

async function getJson(path) {
  let res;
  try {
    res = await fetch(`${base}${path}`);
  } catch {
    die(`Can't reach Mailpit at ${base}. Is the container up? (docker compose ps)`);
  }
  if (!res.ok) die(`Mailpit API ${path} returned ${res.status} ${res.statusText}`);
  return res.json();
}

const list = await getJson('/api/v1/messages?limit=50');
let messages = list.messages || [];
if (toFilter) {
  messages = messages.filter((m) => (m.To || []).some((t) => t.Address?.toLowerCase() === toFilter));
}
if (messages.length === 0) {
  die(toFilter ? `No messages to "${toFilter}" in the inbox.` : 'The Mailpit inbox is empty.');
}

const summary = messages[0]; // newest first
const msg = await getJson(`/api/v1/message/${summary.ID}`);

const links = [...new Set([...extractLinks(msg.Text), ...extractLinks(msg.HTML)])].sort(
  (a, b) => rank(a) - rank(b),
);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        id: msg.ID,
        subject: msg.Subject,
        to: (msg.To || []).map((t) => t.Address),
        from: msg.From?.Address,
        date: msg.Date,
        links,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const to = (msg.To || []).map((t) => t.Address).join(', ');
console.log(`\n✉  "${msg.Subject}"  →  ${to}`);
if (links.length === 0) {
  console.log('   (no links found in this message)\n');
  process.exit(0);
}
console.log(`\n${links[0]}\n`);
if (links.length > 1) {
  console.log('   other links in this message:');
  for (const l of links.slice(1)) console.log(`   · ${l}`);
  console.log('');
}
