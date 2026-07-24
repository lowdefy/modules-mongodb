import {
  ALLOWED_STAGES,
  COLLECTION_SCOPED_STAGES,
  DENIED_STAGES,
  DEFERRED_STAGES,
} from "./stageAllowlist.js";
import {
  ALLOWED_EXPRESSION_OPERATORS,
  DENIED_EXPRESSION_OPERATORS,
  ALLOWED_SYSTEM_VARIABLES,
} from "./expressionOperatorAllowlist.js";
import {
  ALLOWED_MATCH_OPERATORS,
  DENIED_MATCH_OPERATORS,
} from "./matchOperatorAllowlist.js";

const allSets = {
  ALLOWED_STAGES,
  COLLECTION_SCOPED_STAGES,
  DENIED_STAGES,
  DEFERRED_STAGES,
  ALLOWED_EXPRESSION_OPERATORS,
  DENIED_EXPRESSION_OPERATORS,
  ALLOWED_SYSTEM_VARIABLES,
  ALLOWED_MATCH_OPERATORS,
  DENIED_MATCH_OPERATORS,
};

test("every exported allowlist is a Set", () => {
  for (const [name, set] of Object.entries(allSets)) {
    expect(set instanceof Set).toBe(true);
    expect(set.size).toBeGreaterThan(0);
    expect(name).toBeTruthy();
  }
});

// Prototype keys resolve truthy through Object.prototype on a plain object, so a
// naive `obj[key]` / `key in obj` lookup would silently admit them. Set.has does
// not — assert none is a member of any allow set.
test("prototype-inherited keys are not members of any allowlist", () => {
  const dangerous = [
    "constructor",
    "__proto__",
    "prototype",
    "toString",
    "valueOf",
    "hasOwnProperty",
  ];
  for (const set of Object.values(allSets)) {
    for (const key of dangerous) {
      expect(set.has(key)).toBe(false);
    }
  }
});

test("$densify, $unionWith, $graphLookup are deferred, not allowed", () => {
  for (const stage of ["$densify", "$unionWith", "$graphLookup"]) {
    expect(DEFERRED_STAGES.has(stage)).toBe(true);
    expect(ALLOWED_STAGES.has(stage)).toBe(false);
    expect(COLLECTION_SCOPED_STAGES.has(stage)).toBe(false);
  }
});

test("$lookup is collection-scoped, not in the plain allow set", () => {
  expect(COLLECTION_SCOPED_STAGES.has("$lookup")).toBe(true);
  expect(ALLOWED_STAGES.has("$lookup")).toBe(false);
});

test("$where is denied in both the stage and query grammars", () => {
  expect(DENIED_STAGES.has("$where")).toBe(true);
  expect(DENIED_MATCH_OPERATORS.has("$where")).toBe(true);
  expect(ALLOWED_MATCH_OPERATORS.has("$where")).toBe(false);
});

test("$function and $accumulator are denied in both stage and expression grammars", () => {
  for (const op of ["$function", "$accumulator"]) {
    expect(DENIED_STAGES.has(op)).toBe(true);
    expect(DENIED_EXPRESSION_OPERATORS.has(op)).toBe(true);
    expect(ALLOWED_EXPRESSION_OPERATORS.has(op)).toBe(false);
  }
});

test("denied expression operators are never also allowed", () => {
  for (const op of DENIED_EXPRESSION_OPERATORS) {
    expect(ALLOWED_EXPRESSION_OPERATORS.has(op)).toBe(false);
  }
});

test("allowed system variables cover the fixed set and exclude infra vars", () => {
  for (const v of [
    "NOW",
    "ROOT",
    "CURRENT",
    "REMOVE",
    "DESCEND",
    "PRUNE",
    "KEEP",
  ]) {
    expect(ALLOWED_SYSTEM_VARIABLES.has(v)).toBe(true);
  }
  for (const v of ["USER_ROLES", "CLUSTER_TIME", "SEARCH_META"]) {
    expect(ALLOWED_SYSTEM_VARIABLES.has(v)).toBe(false);
  }
});

test("geo query operators are deferred (denied) in the match grammar", () => {
  for (const op of [
    "$near",
    "$nearSphere",
    "$geoWithin",
    "$geoIntersects",
    "$text",
  ]) {
    expect(DENIED_MATCH_OPERATORS.has(op)).toBe(true);
    expect(ALLOWED_MATCH_OPERATORS.has(op)).toBe(false);
  }
});
