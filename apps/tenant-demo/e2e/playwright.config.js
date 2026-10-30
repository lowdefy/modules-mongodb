import configureMdb from "@lowdefy/community-plugin-e2e-mdb/config";
import { createConfig } from "@lowdefy/e2e-utils/config";
import { devices } from "@playwright/test";

// Set LOWDEFY_E2E_MONGODB_URI + LOWDEFY_SECRET_MONGODB_URI at config-eval time so the
// webServer (started before globalSetup) connects to the in-memory MongoMemoryServer.
configureMdb();

const config = createConfig({
  appDir: "./", // Resolved relative to cwd (where pnpm e2e runs)
  testDir: ".", // Tests are in same dir as config
  // Use a dedicated e2e port (NOT 3000) so the e2e server does not collide with
  // a running `lowdefy dev` server. With reuseExistingServer: true, sharing 3000
  // makes Playwright silently reuse the dev server — which lacks e2e cookie auth
  // and builds pages lazily — instead of building its own `--server e2e` server.
  port: 3103,
  // If your app needs environment variables (e.g., via infisical, dotenv-vault, aws-vault):
  // commandPrefix: 'infisical run --env=dev --path=/my-app --',
});

// createConfig (e2e-utils v5) does not forward globalSetup/globalTeardown, so set them
// on the returned config. globalSetup launches MongoMemoryServer (replica set, for
// transactions) on the port configureMdb() configured.
export default {
  ...config,
  globalSetup: "@lowdefy/community-plugin-e2e-mdb/setup",
  globalTeardown: "@lowdefy/community-plugin-e2e-mdb/teardown",
  // ONE worker, on purpose: every worker shares the single e2e server and the
  // single in-memory MongoDB, and the mdb fixture's per-test teardown wipes
  // EVERY collection in the shared database (not just the ones that test
  // touched — upstream bug in community-plugin-e2e-mdb). With parallel
  // workers, a short test finishing wipes a longer test's seeded data
  // mid-flight (this is exactly how tenant-isolation.spec.js flaked). Serial
  // workers make each teardown wipe land between tests, where every spec
  // re-seeds what it needs.
  workers: 1,
  // second-host runs the file link spec again on 127.0.0.1, a second host
  // name for the same server, as an app served on two domains is: links carry
  // no host, and each host has its own session cookie.
  projects: [
    ...config.projects,
    {
      name: "second-host",
      testMatch: "files/file-link.spec.js",
      use: { ...devices["Desktop Chrome"], baseURL: "http://127.0.0.1:3103" },
    },
  ],
  // `lowdefy build --server e2e` fails the auth config check unless NEXTAUTH_SECRET
  // is set. The e2e server uses cookie-based mock auth, so the value is build-only —
  // mirror the `ldf:b` script and respect a real secret if one is already exported.
  webServer: {
    ...config.webServer,
    // Lowdefy's e2e server serves no link endpoints; serve-link-endpoints.mjs
    // adds the production server's GET route between the build and the start.
    command: config.webServer.command.replace(
      " && ",
      " && node e2e/serve-link-endpoints.mjs && ",
    ),
    env: {
      ...process.env,
      NEXTAUTH_SECRET:
        process.env.NEXTAUTH_SECRET || "build-only-not-a-real-secret",
      // Presigning an S3 link or upload policy is computed locally, so the
      // files endpoint specs need only placeholder bucket secrets.
      LOWDEFY_SECRET_FILES_S3_ACCESS_KEY_ID:
        process.env.LOWDEFY_SECRET_FILES_S3_ACCESS_KEY_ID || "e2e-access-key",
      LOWDEFY_SECRET_FILES_S3_SECRET_ACCESS_KEY:
        process.env.LOWDEFY_SECRET_FILES_S3_SECRET_ACCESS_KEY ||
        "e2e-secret-key",
      LOWDEFY_SECRET_FILES_S3_BUCKET:
        process.env.LOWDEFY_SECRET_FILES_S3_BUCKET || "e2e-bucket",
      LOWDEFY_SECRET_FILES_S3_BUCKET_PUB:
        process.env.LOWDEFY_SECRET_FILES_S3_BUCKET_PUB || "e2e-bucket-pub",
      // The notifications bucket reads its region from this secret.
      LOWDEFY_SECRET_FILES_S3_REGION:
        process.env.LOWDEFY_SECRET_FILES_S3_REGION || "eu-west-1",
    },
  },
};
