#!/usr/bin/env node
// Create the module-required indexes on a fresh local test database.
//
// The modules never create their own indexes — index creation is a host-app
// concern (docs/user-account/reference/indexes.md). A fresh local DB (a new
// `demo-auth-test`, a new `modules-mongodb-tenant-demo`, or any DB after
// `docker compose down -v`) therefore has none of them, and the contact,
// members-filter and two-factor flows misbehave without them: no unique guard on
// the contact identity, and — because 2FA enable deletes-then-creates with no
// lock — a silent two-factor lockout (better-auth#10561). This creates all four
// idempotently so both apps start from a correct DB.
//
// One index set serves BOTH policies. The two `user-contacts` indexes use the
// compound `{organization_id, ...}` (tenant) shape; under `pinned` documents
// carry no `organization_id`, so the leading key indexes as null and the
// compound key degenerates to the single-field guarantee — the same shape works
// either way (docs/user-account/reference/indexes.md, "Policy note"). createIndex
// is idempotent, so re-running is safe.
//
// GUARDED: refuses a non-local host, like reset-db — it structurally cannot
// touch a remote Atlas cluster. (The QA Atlas indexes are provisioned
// separately; see README §8c.)
//
// Usage (from scripts/auth-testing/):
//   node ensure-indexes.mjs            # against $MONGODB_URI (default demo-auth-test)
//   MONGODB_URI="mongodb://localhost:27017/modules-mongodb-tenant-demo" node ensure-indexes.mjs
//   pnpm ensure-indexes
//
// Env:
//   MONGODB_URI   default mongodb://localhost:27017/demo-auth-test

import { MongoClient } from 'mongodb';
import { DEFAULT_URI, dbNameFromUri, isLocalUri, die } from './_shared.mjs';

const uri = process.env.MONGODB_URI || DEFAULT_URI;
const dbName = dbNameFromUri(uri) || 'demo-auth-test';

if (!isLocalUri(uri)) {
  die(
    `Refusing to create indexes on a non-local database.\n` +
      `  MONGODB_URI must point at localhost/127.0.0.1 — got a remote host.\n` +
      `  QA Atlas indexes are provisioned separately (README §8c).`,
  );
}

// The module-owned indexes (docs/user-account/reference/indexes.md). createIndex
// names the index off the key spec, so repeated runs converge on the same index.
const INDEXES = [
  {
    collection: 'user-contacts',
    keys: { organization_id: 1, lowercase_email: 1 },
    options: { unique: true, partialFilterExpression: { lowercase_email: { $exists: true } } },
  },
  {
    collection: 'user-contacts',
    keys: { organization_id: 1, user_id: 1 },
    options: { unique: true, partialFilterExpression: { user_id: { $exists: true } } },
  },
  {
    collection: 'user-members',
    keys: { organization_id: 1, app_roles: 1 },
    options: {},
  },
  {
    collection: 'user-two-factors',
    keys: { user_id: 1 },
    options: { unique: true },
  },
];

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);

  console.log(`\nEnsuring module indexes on "${dbName}":`);
  for (const { collection, keys, options } of INDEXES) {
    const name = await db.collection(collection).createIndex(keys, options);
    console.log(`  · ${collection.padEnd(18)} ${name}`);
  }
  console.log(`\n✓ done — ${INDEXES.length} index(es) ensured. Safe to re-run.\n`);
} finally {
  await client.close();
}
