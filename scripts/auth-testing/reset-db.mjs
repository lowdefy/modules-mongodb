#!/usr/bin/env node
// Clear the test database to a fresh data slate between runs.
//
// Deletes every document from every collection but KEEPS the collections and
// their indexes — so the partial-unique indexes (user-contacts.lowercase_email,
// users.profile.contactId) survive and you don't have to recreate them. This is
// gentler than `docker compose down -v` (which wipes the volume, indexes and all).
//
// GUARDED: refuses to run unless the connection is local (localhost/127.0.0.1)
// AND the database name is the expected test DB. It structurally cannot touch a
// remote Atlas cluster or a non-test database.
//
// Usage (from scripts/auth-testing/):
//   node reset-db.mjs            # clear all data in the test DB
//   node reset-db.mjs --dry-run  # report what would be cleared, change nothing
//
// Env:
//   MONGODB_URI     default mongodb://localhost:27017/demo-auth-test
//   RESET_DB_ALLOW  the DB name this script is allowed to clear (default demo-auth-test)
//
// After a reset, restart the dev server (so the engine re-ensures the pinned org),
// then re-run bootstrap-admin.

import { MongoClient } from 'mongodb';
import { DEFAULT_URI, dbNameFromUri, isLocalUri, die } from './_shared.mjs';

const dryRun = process.argv.includes('--dry-run');
const uri = process.env.MONGODB_URI || DEFAULT_URI;
const allowedDb = process.env.RESET_DB_ALLOW || 'demo-auth-test';
const dbName = dbNameFromUri(uri) || 'demo-auth-test';

// --- safety guards -------------------------------------------------------------
if (!isLocalUri(uri)) {
  die(
    `Refusing to reset a non-local database.\n` +
      `  MONGODB_URI must point at localhost/127.0.0.1 — got a remote host.\n` +
      `  This guard exists so the reset can never reach a real cluster.`,
  );
}
if (dbName !== allowedDb) {
  die(
    `Refusing to reset database "${dbName}" — only "${allowedDb}" is allowed.\n` +
      `  If this really is your throwaway test DB, set RESET_DB_ALLOW="${dbName}".`,
  );
}
// -------------------------------------------------------------------------------

const client = new MongoClient(uri);

try {
  await client.connect();
  const db = client.db(dbName);
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();

  if (collections.length === 0) {
    console.log(`\n(nothing to do — "${dbName}" has no collections yet)\n`);
    process.exit(0);
  }

  console.log(`\n${dryRun ? 'DRY RUN — would clear' : 'Clearing'} data in "${dbName}":`);
  let total = 0;
  for (const { name } of collections) {
    const col = db.collection(name);
    const count = await col.countDocuments();
    total += count;
    if (dryRun) {
      console.log(`  · ${name.padEnd(22)} ${count} docs`);
    } else {
      const { deletedCount } = await col.deleteMany({});
      console.log(`  · ${name.padEnd(22)} ${deletedCount} deleted`);
    }
  }
  console.log(
    `\n${dryRun ? '✓ dry run complete —' : '✓ done —'} ${total} document(s) across ` +
      `${collections.length} collection(s). Indexes preserved.\n` +
      (dryRun ? '' : '  Restart the dev server to re-ensure the pinned org, then bootstrap-admin.\n'),
  );
} finally {
  await client.close();
}
