import { nunjucksFunction } from "@lowdefy/nunjucks";

function parseNunjucks(fileContent, vars) {
  const template = nunjucksFunction(fileContent);
  return template(vars);
}

export default parseNunjucks;
