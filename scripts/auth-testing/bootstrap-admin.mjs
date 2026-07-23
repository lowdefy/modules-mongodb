#!/usr/bin/env node
// Grant a user the admin role in the pinned demo org — the first-admin bootstrap.
//
// Why this exists: under `pinned` + invite-only, nobody can sign in without a
// member row, but there's no admin to grant one (chicken-and-egg). So:
//   1. Sign up + verify email through the UI (creates the auth identity — we do
//      NOT reimplement BetterAuth's password hashing here).
//   2. Run this to insert the `user-members` row with role `user-admin`.
//   3. Log in — the hard wall now admits you, and the user-admin console opens.
//
// It inserts ONLY the membership; it never touches credentials. The engine's
// mongo adapter keys every auth collection on UUID-string ids (the pinned org row
// is a UUID), so the member row's own `_id` is a UUID string too, and the userId /
// organizationId references are copied verbatim from the rows they point at.
// `role` is a comma-separated string, matching what UpdateMemberRoles writes.
//
// Usage (from scripts/auth-testing/):
//   node bootstrap-admin.mjs <email> [role]
//   pnpm bootstrap-admin sam@example.com            # role defaults to user-admin
//   pnpm bootstrap-admin sam@example.com admin      # grant a different catalog role
//
// Env:
//   MONGODB_URI      default mongodb://localhost:27017/demo-auth-test
//   DEMO_ORG_SLUG    default "demo" (matches auth.organizations.org in lowdefy.yaml)

import { randomUUID } from 'node:crypto';

import { MongoClient } from 'mongodb';
import { DEFAULT_URI, dbNameFromUri, escapeRegExp, die } from './_shared.mjs';

const email = process.argv[2];
const role = process.argv[3] || 'user-admin';
const orgSlug = process.env.DEMO_ORG_SLUG || 'demo';
const uri = process.env.MONGODB_URI || DEFAULT_URI;

if (!email || email.startsWith('-')) {
  die('usage: node bootstrap-admin.mjs <email> [role]');
}

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbNameFromUri(uri) || 'demo-auth-test');

  const org = await db.collection('user-organizations').findOne({ slug: orgSlug });
  if (!org) {
    die(
      `No organization with slug "${orgSlug}" in ${db.databaseName}.\n` +
        `  The engine ensures the pinned org at dev-server startup — start the app ` +
        `once (pnpm ldf:d) so it's created, then re-run this.`,
    );
  }

  const user = await db
    .collection('users')
    .findOne({ email: { $regex: `^${escapeRegExp(email)}$`, $options: 'i' } });
  if (!user) {
    die(
      `No user with email "${email}" in ${db.databaseName}.\n` +
        `  Sign up (and verify the email) through the app first, then re-run this.`,
    );
  }

  const members = db.collection('user-members');
  const existing = await members.findOne({ userId: user._id, organizationId: org._id });

  if (existing) {
    const current = String(existing.role || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (current.includes(role)) {
      console.log(`\n✓ ${email} already holds "${role}" in org "${orgSlug}" — nothing to do.\n`);
    } else {
      const merged = [...current, role];
      await members.updateOne({ _id: existing._id }, { $set: { role: merged.join(',') } });
      console.log(
        `\n✓ Added "${role}" to ${email} in org "${orgSlug}".\n  Roles now: ${merged.join(', ')}\n`,
      );
    }
  } else {
    const memberDoc = {
      _id: randomUUID(), // UUID string — the engine's adapter keys every collection on these
      userId: user._id, // matches users._id
      organizationId: org._id, // matches user-organizations._id (_organization:id)
      role, // CSV string; a single role has no commas
      createdAt: new Date(), // read as `signed_up` on the members list
    };
    await members.insertOne(memberDoc);
    console.log(
      `\n✓ Created membership: ${email} → org "${orgSlug}" with role "${role}".\n` +
        `  member _id: ${memberDoc._id}\n`,
    );
  }

  if (user.emailVerified !== true) {
    console.log(
      `⚠ Heads-up: this user's email is not verified yet. With ` +
        `requireEmailVerification on, sign-in stays blocked (EMAIL_NOT_VERIFIED) ` +
        `until you complete the verify-email flow.\n`,
    );
  }
} finally {
  await client.close();
}
