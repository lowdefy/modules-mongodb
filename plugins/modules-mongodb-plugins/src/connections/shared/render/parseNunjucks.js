import { nunjucksFunction } from '@lowdefy/nunjucks';

/**
 * Renders a single Nunjucks template string against a vars context.
 * Moved here from src/blocks/ContactSelector/ as the shared render primitive
 * for engine display rendering (Part 30 D13). Still used by ContactSelector.
 */
function parseNunjucks(fileContent, vars) {
  const template = nunjucksFunction(fileContent);
  return template(vars);
}

export default parseNunjucks;
