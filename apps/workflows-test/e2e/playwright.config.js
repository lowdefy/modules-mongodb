import configureMdb from "@lowdefy/community-plugin-e2e-mdb/config";
import { createConfig } from "@lowdefy/e2e-utils/config";

// Self-contained Mongo via mongodb-memory-server (binaries cached locally, so
// this works offline). The workflows engine uses transactions, so a replica
// set is required — `configureMdb` boots a single-node replica set by default,
// which satisfies that.
//
// This MUST run at config-eval time (not in globalSetup) so the env vars it
// sets are present when Playwright forks the `webServer` child — the served
// Lowdefy app reads MONGODB_URI from LOWDEFY_SECRET_MONGODB_URI at boot.
//
// Distinct port + db name from the demo's e2e Mongo so parallel local runs
// never collide. `configureMdb` sets LOWDEFY_E2E_MONGODB_URI (read by the
// `mdb` fixture's getMongoUri()) and LOWDEFY_E2E_SECRET_MONGODB_URI /
// LOWDEFY_SECRET_MONGODB_URI (read by the app's `_secret: MONGODB_URI`), all
// pointed at the same ephemeral server. The `globalSetup` re-export below boots
// the server on this port before any test runs.
//
// Override: set LOWDEFY_E2E_MONGODB_URI in the environment (see e2e/.env.e2e)
// to run against a real Mongo instead of the ephemeral memory server.
configureMdb({ port: 27118, databaseName: "workflows_test_e2e" });

const base = createConfig({
  appDir: "./", // Resolved relative to cwd (where pnpm e2e runs)
  testDir: ".", // Tests are in same dir as config
  port: 3001,
});

export default {
  ...base,
  globalSetup: "./global-setup.js",
  // The `mdb` fixture wipes ALL collections after every test, and every worker
  // shares the SAME ephemeral database (configureMdb sets one port + db name, and
  // the served app boots against a single MONGODB_URI). Under `fullyParallel`
  // that wipe races across workers — one test's teardown deletes another test's
  // in-flight data. Pin to a single worker so the shared DB has one writer.
  workers: 1,
  fullyParallel: false,
};
