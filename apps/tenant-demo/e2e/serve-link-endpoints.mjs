// Lowdefy's e2e server answers every GET on /api/endpoints/* with 405: unlike
// the production and dev servers, its route never calls runLinkEndpoint, so
// link endpoints (`link: true`) can't be opened in an e2e run. This adds the
// production server's GET branch to the built e2e server's route, after
// `lowdefy build --server e2e` writes it and before `lowdefy start` runs it.
// The routine, its auth and its answer all come from @lowdefy/api as shipped;
// only the route that calls it is added. The production server's noStore
// middleware is not, so the e2e answers carry no Cache-Control header.
//
// Delete this file, and its step in playwright.config.js, once the e2e server
// serves link endpoints itself: the script stops when the route already does.
import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const routePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../.lowdefy/server/src/routes/endpoints.js",
);
const source = readFileSync(routePath, "utf8");

if (source.includes("runLinkEndpoint")) {
  process.exit(0);
}

const importLine =
  "import { callEndpoint, parseRequestBody } from '@lowdefy/api';";
const methodCheck =
  "async function endpointsHandler(c) {\n  if (c.req.method !== 'POST') {";
if (!source.includes(importLine) || !source.includes(methodCheck)) {
  throw new Error(
    `${routePath} no longer has the shape serve-link-endpoints.mjs patches. Check whether the e2e server now serves link endpoints (a GET on a link endpoint answers 302), and delete this script if it does.`,
  );
}

const linkHandler = `async function linkHandler(c) {
  const context = c.get('lowdefyContext');
  const { status, location, body } = await runLinkEndpoint(context, {
    segments: getPathSegments(c, '/api/endpoints/'),
    query: c.req.query(),
  });
  if (status === 302) {
    return c.redirect(location, 302);
  }
  if (body === undefined || body === null) {
    return c.body(null, status);
  }
  return c.json(body, status);
}

async function endpointsHandler(c) {
  if (c.req.method === 'GET') {
    return linkHandler(c);
  }
  if (c.req.method !== 'POST') {`;

writeFileSync(
  routePath,
  source
    .replace(
      importLine,
      "import { callEndpoint, parseRequestBody, runLinkEndpoint } from '@lowdefy/api';",
    )
    .replace(methodCheck, linkHandler),
);
