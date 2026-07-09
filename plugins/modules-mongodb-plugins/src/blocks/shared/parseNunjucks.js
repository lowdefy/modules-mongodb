import { nunjucksFunction } from "@lowdefy/nunjucks";

/**
 * Renders a single Nunjucks template string against a vars context.
 * Client-side copy for blocks (ContactSelector). The server-side engine's
 * render primitive lives in @lowdefy/mongodb-workflows-sdk — duplicated here
 * (4 lines) rather than pulling a server SDK into the client block bundle
 * (workflows-sdk-split design).
 */
function parseNunjucks(fileContent, vars) {
  const template = nunjucksFunction(fileContent);
  return template(vars);
}

export default parseNunjucks;
