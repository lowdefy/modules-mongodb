#!/usr/bin/env node
// Grant a user an app role in the pinned demo org — the first-admin bootstrap.
//
// Why this exists: under `pinned` + invite-only, nobody can sign in without a
// member row, but there's no admin to grant one (chicken-and-egg). So:
//   1. Sign up + verify email through the UI (creates the auth identity — we do
//      NOT reimplement BetterAuth's password hashing here).
//   2. Run this to insert the `user-members` row carrying the `user-admin` app role.
//   3. Log in — the hard wall now admits you, and the user-admin console opens.
//
// It inserts ONLY the membership; it never touches credentials. The engine's
// mongo adapter keys every auth collection on UUID-string ids (the pinned org row
// is a UUID), so the member row's own `_id` is a UUID string too, and the
// `user_id` / `organization_id` references are copied verbatim from the rows they
// point at.
//
// COLUMN SHAPE — the stored member columns are snake_case, and app roles are an
// ARRAY, matching every native read (get_all_members, close_row, the page-role
// gate). Two role-shaped fields exist and must not be conflated:
//   - `app_roles` — array of app catalog roles (e.g. `user-admin`). THIS is what
//     the console page gate (`auth.pages.roles.user-admin: [user-admin/**]`) and
//     UpdateMemberRoles read. The role granted here goes here.
//   - `role` — BetterAuth's org-authority tier (owner | admin | member), a
//     separate axis (see Phase 5 / org-authority). Bootstrapped to `member`, the
//     no-authority default; app-role access does not need an org tier above it.
//
// Usage (from scripts/auth-testing/):
//   node bootstrap-admin.mjs <email> [appRole]
//   pnpm bootstrap-admin sam@example.com            # appRole defaults to user-admin
//   pnpm bootstrap-admin sam@example.com admin      # grant a different catalog app role
//
// Env:
//   MONGODB_URI      default mongodb://localhost:27017/demo-auth-test
//   DEMO_ORG_SLUG    default "demo" (matches auth.organizations.org in lowdefy.yaml)

import { randomUUID } from 'node:crypto';

import { MongoClient } from 'mongodb';
import { DEFAULT_URI, dbNameFromUri, escapeRegExp, die } from './_shared.mjs';

const email = process.argv[2];
const appRole = process.argv[3] || 'user-admin';
const orgSlug = process.env.DEMO_ORG_SLUG || 'demo';
const uri = process.env.MONGODB_URI || DEFAULT_URI;

if (!email || email.startsWith('-')) {
  die('usage: node bootstrap-admin.mjs <email> [appRole]');
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
  const existing = await members.findOne({ user_id: user._id, organization_id: org._id });

  if (existing) {
    const current = Array.isArray(existing.app_roles) ? existing.app_roles.filter(Boolean) : [];
    if (current.includes(appRole)) {
      console.log(
        `\n✓ ${email} already holds app role "${appRole}" in org "${orgSlug}" — nothing to do.\n`,
      );
    } else {
      const merged = [...current, appRole];
      await members.updateOne({ _id: existing._id }, { $set: { app_roles: merged } });
      console.log(
        `\n✓ Added app role "${appRole}" to ${email} in org "${orgSlug}".\n` +
          `  app_roles now: ${merged.join(', ')}\n`,
      );
    }
  } else {
    const memberDoc = {
      _id: randomUUID(), // UUID string — the engine's adapter keys every collection on these
      user_id: user._id, // matches users._id
      organization_id: org._id, // matches user-organizations._id (_organization:id)
      app_roles: [appRole], // array of app catalog roles — what the page gate reads
      role: 'member', // org-authority tier (owner|admin|member); no-authority default
      created_at: new Date(), // read as `signed_up` on the members list
    };
    await members.insertOne(memberDoc);
    console.log(
      `\n✓ Created membership: ${email} → org "${orgSlug}" with app role "${appRole}".\n` +
        `  member _id: ${memberDoc._id}\n`,
    );
  }

  if (user.email_verified !== true) {
    console.log(
      `⚠ Heads-up: this user's email is not verified yet. With ` +
        `requireEmailVerification on, sign-in stays blocked (EMAIL_NOT_VERIFIED) ` +
        `until you complete the verify-email flow.\n`,
    );
  }
} finally {
  await client.close();
}
