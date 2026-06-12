// Boots mongodb-memory-server (single-node replica set) on the port configured
// by `configureMdb(...)` in playwright.config.js, before any test runs.
export { default } from '@lowdefy/community-plugin-e2e-mdb/setup';
