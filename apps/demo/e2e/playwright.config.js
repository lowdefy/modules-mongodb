import configureMdb from "@lowdefy/community-plugin-e2e-mdb/config";
import { createConfig } from "@lowdefy/e2e-utils/config";

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
  port: 3101,
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
  // `lowdefy build --server e2e` fails the auth config check unless NEXTAUTH_SECRET
  // is set. The e2e server uses cookie-based mock auth, so the value is build-only —
  // mirror the `ldf:b` script and respect a real secret if one is already exported.
  webServer: {
    ...config.webServer,
    env: {
      ...process.env,
      NEXTAUTH_SECRET:
        process.env.NEXTAUTH_SECRET || "build-only-not-a-real-secret",
    },
  },
};
