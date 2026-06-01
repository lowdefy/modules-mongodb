/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  testMatch: ["**/*.test.js"],
  transform: {
    "^.+\\.js$": [
      "@swc/jest",
      {
        swcrc: false,
        jsc: { parser: { syntax: "ecmascript" }, target: "es2022" },
        module: { type: "es6", noInterop: true },
      },
    ],
  },
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/apps/demo/\\.lowdefy/",
    "/apps/demo/e2e/",
  ],
  // Transform ESM deps under node_modules that ship raw `export` syntax
  // (community-plugin-mongodb and friends are dual ESM; @swc/jest re-compiles
  // them to CJS for the test runtime). pnpm encodes the org prefix as `+`
  // in the realpath (e.g. `@lowdefy+community-plugin-mongodb@3.0.0`), so we
  // match by package name anywhere on the path.
  transformIgnorePatterns: [
    "/node_modules/(?!.*(@lowdefy|@swc/helpers|@formatjs|intl-messageformat)).+\\.js$",
  ],
  testTimeout: 60000,
};

export default config;
