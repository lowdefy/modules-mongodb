import configureMdb from '@lowdefy/community-plugin-e2e-mdb/config';
import { createConfig } from '@lowdefy/e2e-utils/config';

// Set LOWDEFY_E2E_MONGODB_URI + LOWDEFY_SECRET_MONGODB_URI at config-eval time so the
// webServer (started before globalSetup) connects to the in-memory MongoMemoryServer.
configureMdb();

const config = createConfig({
  appDir: './', // Resolved relative to cwd (where pnpm e2e runs)
  testDir: '.', // Tests are in same dir as config
  port: 3000,
  // If your app needs environment variables (e.g., via infisical, dotenv-vault, aws-vault):
  // commandPrefix: 'infisical run --env=dev --path=/my-app --',
});

// createConfig (e2e-utils v5) does not forward globalSetup/globalTeardown, so set them
// on the returned config. globalSetup launches MongoMemoryServer (replica set, for
// transactions) on the port configureMdb() configured.
export default {
  ...config,
  globalSetup: '@lowdefy/community-plugin-e2e-mdb/setup',
  globalTeardown: '@lowdefy/community-plugin-e2e-mdb/teardown',
};
