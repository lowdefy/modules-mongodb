import {
  ALLOWED_REGEX_FLAGS,
  MAX_ARRAY_LITERAL_LENGTH,
  MAX_EXPRESSION_DEPTH,
  MAX_FACET_BRANCHES,
  MAX_LOOKUP_COUNT,
  MAX_PIPELINE_BYTES,
  MAX_PIPELINE_NODES,
  MAX_PIPELINE_STAGES,
  MAX_REGEX_PATTERN_LENGTH,
  MAX_SAMPLE_SIZE,
  MAX_SUBPIPELINE_DEPTH,
  PIPELINE_RESULT_CAP,
} from "./constants.js";
import {
  ALLOWED_STAGES,
  COLLECTION_SCOPED_STAGES,
  DEFERRED_STAGES,
  DENIED_STAGES,
} from "./stageAllowlist.js";
import {
  ALLOWED_EXPRESSION_OPERATORS,
  ALLOWED_SYSTEM_VARIABLES,
  DENIED_EXPRESSION_OPERATORS,
} from "./expressionOperatorAllowlist.js";
import {
  ALLOWED_MATCH_OPERATORS,
  DENIED_MATCH_OPERATORS,
} from "./matchOperatorAllowlist.js";

/**
 * Validates an AI-authored read-only aggregation pipeline against the three
 * default-deny grammars (stages, expressions, `$match` query documents), the
 * collections catalog, and the resource caps — the single gate between
 * natural-language-derived pipelines and the database.
 *
 *   validatePipeline({ collection, pipeline, catalog, roles })
 *     → { collection, pipeline }   // freshly reconstructed
 *     // or throws Error with a message the model (or app author) can act on
 *
 * Reconstruct, don't forward: the walker returns a freshly built tree
 * containing only nodes it explicitly classified and approved. A subtree the
 * walker never visited cannot reach the database — a missed case fails closed
 * (rejected), never open (forwarded verbatim). Pure function: no I/O, no
 * driver imports, never executes anything.
 *
 * Input arrives on two paths — `JSON.parse` of chat tool input, and BSON
 * deserialization when a persisted report's pipeline is read back — so
 * non-plain scalar instances (`Date`, `ObjectId`) are treated as opaque leaf
 * values, and regexes (`RegExp` from either path) get the pattern/flag caps.
 *
 * For server-side JS (`$where`/`$function`/`$accumulator`) this validator is
 * the SOLE defense — the read-only principal does not stop eval.
 */

function fail(message) {
  throw new Error(`Invalid pipeline: ${message}`);
}

// Rejected wherever they appear: they resolve truthy through Object.prototype
// on naive membership checks, and assigning them during reconstruction would
// pollute prototypes. Membership on the allowlists is Set.has only.
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Query operators that take a query document (not a literal) at the top level.
const QUERY_LOGICAL_OPERATORS = new Set(["$and", "$or", "$nor"]);

// `let` / `as` variable names: MongoDB requires a lowercase first letter, and
// restricting to word characters keeps bound names trivially injection-free.
const VAR_NAME_REGEX = /^[a-z][a-zA-Z0-9_]*$/;

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function checkKey(key) {
  if (FORBIDDEN_KEYS.has(key)) {
    fail(`the key "${key}" is not allowed anywhere in a pipeline.`);
  }
}

function countNode(ctx) {
  ctx.state.nodes += 1;
  if (ctx.state.nodes > MAX_PIPELINE_NODES) {
    fail(`pipeline exceeds the maximum of ${MAX_PIPELINE_NODES} nodes.`);
  }
}

// Explicit depth guard: pathological nesting fails with a validation error,
// never a stack overflow (the recursion never outruns this counter).
function enterDepth(ctx) {
  const depth = ctx.depth + 1;
  if (depth > MAX_EXPRESSION_DEPTH) {
    fail(
      `pipeline nesting exceeds the maximum depth of ${MAX_EXPRESSION_DEPTH}.`,
    );
  }
  return { ...ctx, depth };
}

function checkArrayLength(array, what) {
  if (array.length > MAX_ARRAY_LITERAL_LENGTH) {
    fail(
      `${what} exceeds the maximum of ${MAX_ARRAY_LITERAL_LENGTH} elements.`,
    );
  }
}

function checkRegexFlags(flags) {
  if (typeof flags !== "string") fail("regex flags must be a string.");
  for (const flag of flags) {
    if (!ALLOWED_REGEX_FLAGS.includes(flag)) {
      fail(
        `the regex flag "${flag}" is not allowed. Allowed flags: "${ALLOWED_REGEX_FLAGS}".`,
      );
    }
  }
  return flags;
}

// A regex pattern the AI authored is raw and unescaped, so it gets hard caps
// (length, imsu-only flags) — maxTimeMS alone does not interrupt catastrophic
// backtracking. Accepts a string pattern or a RegExp instance (BSON path);
// returns a fresh value, never the input RegExp by reference.
function rebuildRegex(pattern, what) {
  if (typeof pattern === "string") {
    if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
      fail(
        `${what} pattern exceeds the maximum length of ${MAX_REGEX_PATTERN_LENGTH}.`,
      );
    }
    return pattern;
  }
  if (pattern instanceof RegExp) {
    if (pattern.source.length > MAX_REGEX_PATTERN_LENGTH) {
      fail(
        `${what} pattern exceeds the maximum length of ${MAX_REGEX_PATTERN_LENGTH}.`,
      );
    }
    return new RegExp(pattern.source, checkRegexFlags(pattern.flags));
  }
  fail(`${what} takes a string pattern or a regular expression.`);
}

// Catalog membership + role gate for the base collection and every
// `$lookup.from`. Enforcing each touched collection as it is encountered
// yields the union-of-roles rule: the caller must satisfy every non-empty
// roles list among the touched collections. Absent/empty roles = any
// authenticated user (role-gating is opt-in; declaring a collection at all is
// the act of exposure).
function checkCollectionAccess(name, ctx) {
  if (typeof name !== "string" || name === "") {
    fail("collection must be a non-empty string.");
  }
  checkKey(name);
  if (!Object.hasOwn(ctx.catalog, name)) {
    fail(
      `collection "${name}" is not in the collections catalog. ` +
        `Available collections: ${Object.keys(ctx.catalog).join(", ")}.`,
    );
  }
  const required = ctx.catalog[name]?.roles ?? [];
  if (required.length > 0 && !required.some((r) => ctx.userRoles.includes(r))) {
    fail(`you are not authorized to query collection "${name}".`);
  }
}

// ── Literal copiers ──────────────────────────────────────────────────────────

// `$literal` argument: opaque data MongoDB must not interpret. No grammar
// checks (data may legitimately look like `{ $where: … }`), but it still
// counts toward the node/depth/array caps, prototype keys are still rejected,
// and regexes still get their caps. Deep copy — never the input by reference.
function copyOpaqueLiteral(value, ctx) {
  countNode(ctx);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof RegExp) return rebuildRegex(value, "a literal regex");
  const inner = enterDepth(ctx);
  if (Array.isArray(value)) {
    checkArrayLength(value, "a literal array");
    return value.map((element) => copyOpaqueLiteral(element, inner));
  }
  if (!isPlainObject(value)) return value; // opaque scalar (Date, ObjectId, …)
  const out = {};
  for (const key of Object.keys(value)) {
    checkKey(key);
    out[key] = copyOpaqueLiteral(value[key], inner);
  }
  return out;
}

// Literal operand in the query grammar. The query grammar has no
// `$literal`-style escape marker, so `$`-shaped keys anywhere in a literal
// subtree are rejected fail-closed — `{ f: { a: { $where: "…" } } }` is pure
// data to MongoDB, but the false positive is accepted by design.
function copyQueryLiteral(value, ctx) {
  countNode(ctx);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof RegExp) return rebuildRegex(value, "a match regex");
  const inner = enterDepth(ctx);
  if (Array.isArray(value)) {
    checkArrayLength(value, "a literal array");
    return value.map((element) => copyQueryLiteral(element, inner));
  }
  if (!isPlainObject(value)) return value; // opaque scalar (Date, ObjectId, …)
  const out = {};
  for (const key of Object.keys(value)) {
    checkKey(key);
    if (key.startsWith("$")) {
      fail(
        `the key "${key}" is not allowed inside a literal match value ` +
          `(query literals cannot contain "$"-prefixed keys).`,
      );
    }
    out[key] = copyQueryLiteral(value[key], inner);
  }
  return out;
}

// ── Expression grammar (design §3) ──────────────────────────────────────────

// One generic recursive walk — there is no "unwalked" position. Every object
// key beginning with `$` must be an allowlisted expression operator; every
// string value is classified (literal / field path / `$$`-variable).
function walkExpression(node, ctx) {
  countNode(ctx);
  if (typeof node === "string") {
    if (node.startsWith("$$")) {
      const name = node.slice(2).split(".")[0];
      if (!ALLOWED_SYSTEM_VARIABLES.has(name) && !ctx.scope.has(name)) {
        fail(
          `the variable "$$${name}" is not a supported system variable ` +
            `and is not bound by an enclosing let.`,
        );
      }
    }
    return node; // field path ("$a.b") or plain literal — copied as-is
  }
  if (node === null || typeof node !== "object") return node;
  if (node instanceof RegExp) return rebuildRegex(node, "a regex expression");
  const inner = enterDepth(ctx);
  if (Array.isArray(node)) {
    checkArrayLength(node, "an expression array");
    return node.map((element) => walkExpression(element, inner));
  }
  if (!isPlainObject(node)) return node; // opaque scalar (Date, ObjectId, …)
  const keys = Object.keys(node);
  for (const key of keys) checkKey(key);
  if (!keys.some((key) => key.startsWith("$"))) {
    // Document of field → expression (e.g. a `$group` argument, a computed
    // `$project` subtree, `$switch` branches).
    const out = {};
    for (const key of keys) out[key] = walkExpression(node[key], inner);
    return out;
  }
  if (keys.length !== 1) {
    fail(
      `an operator expression must be a single-key object; found keys ` +
        `${keys.join(", ")}.`,
    );
  }
  const op = keys[0];
  if (DENIED_EXPRESSION_OPERATORS.has(op)) {
    fail(`the operator "${op}" is not allowed (server-side JavaScript).`);
  }
  if (!ALLOWED_EXPRESSION_OPERATORS.has(op)) {
    fail(`"${op}" is not an allowed aggregation expression operator.`);
  }
  const arg = node[op];
  if (op === "$literal") return { $literal: copyOpaqueLiteral(arg, inner) };
  if (op === "$let") return { $let: walkLet(arg, inner) };
  if (op === "$map" || op === "$filter") {
    return { [op]: walkMapFilter(op, arg, inner) };
  }
  if (op === "$reduce") return { $reduce: walkReduce(arg, inner) };
  if (op === "$regexMatch" || op === "$regexFind" || op === "$regexFindAll") {
    return { [op]: walkRegexExpression(op, arg, inner) };
  }
  return { [op]: walkExpression(arg, inner) };
}

// Names bound by `let` join the lexical `$$`-scope only inside the expression
// that binds them; the bound value-expressions themselves evaluate (and are
// walked) in the OUTER scope.
function bindVarName(name, scope, op) {
  checkKey(name);
  if (!VAR_NAME_REGEX.test(name)) {
    fail(`"${name}" is not a valid ${op} variable name.`);
  }
  scope.add(name);
}

function walkLet(arg, ctx) {
  if (!isPlainObject(arg) || !isPlainObject(arg.vars)) {
    fail("$let takes { vars: { name: expression }, in: expression }.");
  }
  for (const key of Object.keys(arg)) {
    if (key !== "vars" && key !== "in") fail(`"$let" does not take "${key}".`);
  }
  const out = { vars: {} };
  const scope = new Set(ctx.scope);
  for (const name of Object.keys(arg.vars)) {
    out.vars[name] = walkExpression(arg.vars[name], ctx); // outer scope
    bindVarName(name, scope, "$let");
  }
  out.in = walkExpression(arg.in, { ...ctx, scope });
  return out;
}

function walkMapFilter(op, arg, ctx) {
  if (!isPlainObject(arg)) fail(`${op} takes an options object.`);
  const bodyKey = op === "$map" ? "in" : "cond";
  const allowed =
    op === "$map" ? ["input", "as", "in"] : ["input", "as", "cond", "limit"];
  for (const key of Object.keys(arg)) {
    if (!allowed.includes(key)) fail(`"${op}" does not take "${key}".`);
  }
  const out = { input: walkExpression(arg.input, ctx) };
  const scope = new Set(ctx.scope);
  if (arg.as !== undefined) {
    if (typeof arg.as !== "string") fail(`${op}.as must be a string.`);
    out.as = arg.as;
    bindVarName(arg.as, scope, op);
  } else {
    scope.add("this"); // MongoDB's default binding
  }
  if (op === "$filter" && arg.limit !== undefined) {
    out.limit = walkExpression(arg.limit, ctx);
  }
  out[bodyKey] = walkExpression(arg[bodyKey], { ...ctx, scope });
  return out;
}

function walkReduce(arg, ctx) {
  if (!isPlainObject(arg)) {
    fail("$reduce takes { input, initialValue, in }.");
  }
  for (const key of Object.keys(arg)) {
    if (!["input", "initialValue", "in"].includes(key)) {
      fail(`"$reduce" does not take "${key}".`);
    }
  }
  const scope = new Set(ctx.scope);
  scope.add("value");
  scope.add("this");
  return {
    input: walkExpression(arg.input, ctx),
    initialValue: walkExpression(arg.initialValue, ctx),
    in: walkExpression(arg.in, { ...ctx, scope }),
  };
}

// The pattern must be a literal (string or regex): a "$field"-path pattern
// would be dynamic data the length cap cannot see, so it is rejected.
function walkRegexExpression(op, arg, ctx) {
  if (!isPlainObject(arg)) {
    fail(`${op} takes { input, regex, options? }.`);
  }
  for (const key of Object.keys(arg)) {
    if (!["input", "regex", "options"].includes(key)) {
      fail(`"${op}" does not take "${key}".`);
    }
  }
  if (typeof arg.regex === "string" && arg.regex.startsWith("$")) {
    fail(`${op}.regex must be a literal pattern, not a field path.`);
  }
  const out = {
    input: walkExpression(arg.input, ctx),
    regex: rebuildRegex(arg.regex, op),
  };
  if (arg.options !== undefined) out.options = checkRegexFlags(arg.options);
  return out;
}

// ── Query-document grammar (design §3b) ─────────────────────────────────────

// A `$match` argument. Top-level `$`-keys may only be the logical operators
// and `$expr`; everything else at the top level is a field key. `$elemMatch`
// operands pass `bareOperators` so `{ $gt: 5 }` (scalar-element form) is legal
// there and only there.
function walkQueryDoc(doc, ctx, { bareOperators = false } = {}) {
  countNode(ctx);
  if (!isPlainObject(doc)) fail("a query document must be an object.");
  const inner = enterDepth(ctx);
  const keys = Object.keys(doc);
  for (const key of keys) checkKey(key);
  if (
    bareOperators &&
    keys.length > 0 &&
    keys.every((key) => key.startsWith("$")) &&
    !keys.some((key) => QUERY_LOGICAL_OPERATORS.has(key) || key === "$expr")
  ) {
    return walkOperatorDocument(doc, inner);
  }
  const out = {};
  for (const key of keys) {
    const value = doc[key];
    if (key.startsWith("$")) {
      if (QUERY_LOGICAL_OPERATORS.has(key)) {
        if (!Array.isArray(value) || value.length === 0) {
          fail(`"${key}" takes a non-empty array of query documents.`);
        }
        checkArrayLength(value, `the "${key}" clause list`);
        out[key] = value.map((clause) => walkQueryDoc(clause, inner));
      } else if (key === "$expr") {
        out[key] = walkExpression(value, inner);
      } else if (DENIED_MATCH_OPERATORS.has(key)) {
        fail(`the query operator "${key}" is not allowed.`);
      } else {
        fail(`"${key}" is not allowed at the top level of a query document.`);
      }
    } else {
      out[key] = walkQueryFieldValue(value, inner);
    }
  }
  return out;
}

// The value under a field key: if ANY key of an object value starts with `$`,
// the object is an operator document and ALL keys must be allowlisted query
// operators; otherwise the value is a literal (document-equality match).
function walkQueryFieldValue(value, ctx) {
  if (value instanceof RegExp) {
    countNode(ctx);
    return rebuildRegex(value, "a match regex"); // implicit `{ field: /re/ }`
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    for (const key of keys) checkKey(key);
    if (keys.some((key) => key.startsWith("$"))) {
      countNode(ctx);
      return walkOperatorDocument(value, enterDepth(ctx));
    }
  }
  return copyQueryLiteral(value, ctx);
}

function walkOperatorDocument(opDoc, ctx) {
  const out = {};
  for (const op of Object.keys(opDoc)) {
    checkKey(op);
    if (!op.startsWith("$")) {
      fail(
        `an operator document cannot mix query operators and literal keys ` +
          `(found "${op}").`,
      );
    }
    if (DENIED_MATCH_OPERATORS.has(op)) {
      fail(`the query operator "${op}" is not allowed.`);
    }
    if (!ALLOWED_MATCH_OPERATORS.has(op)) {
      fail(`"${op}" is not an allowed query operator.`);
    }
    const operand = opDoc[op];
    if (op === "$expr" || QUERY_LOGICAL_OPERATORS.has(op)) {
      fail(`"${op}" is only allowed at the top level of a query document.`);
    } else if (op === "$in" || op === "$nin" || op === "$all") {
      if (!Array.isArray(operand)) fail(`"${op}" takes an array of values.`);
      checkArrayLength(operand, `the "${op}" value list`);
      countNode(ctx);
      out[op] = operand.map((element) => copyQueryLiteral(element, ctx));
    } else if (op === "$elemMatch") {
      out[op] = walkQueryDoc(operand, ctx, { bareOperators: true });
    } else if (op === "$not") {
      if (operand instanceof RegExp) {
        countNode(ctx);
        out[op] = rebuildRegex(operand, "a $not regex");
      } else if (
        isPlainObject(operand) &&
        Object.keys(operand).every((key) => key.startsWith("$"))
      ) {
        countNode(ctx);
        out[op] = walkOperatorDocument(operand, enterDepth(ctx));
      } else {
        fail(`"$not" takes an operator document or a regex.`);
      }
    } else if (op === "$regex") {
      countNode(ctx);
      out[op] = rebuildRegex(operand, "$regex");
    } else if (op === "$options") {
      countNode(ctx);
      out[op] = checkRegexFlags(operand);
    } else if (op === "$exists") {
      if (typeof operand !== "boolean") fail(`"$exists" takes a boolean.`);
      countNode(ctx);
      out[op] = operand;
    } else if (op === "$size") {
      if (!Number.isInteger(operand) || operand < 0) {
        fail(`"$size" takes a non-negative integer.`);
      }
      countNode(ctx);
      out[op] = operand;
    } else if (op === "$mod") {
      if (
        !Array.isArray(operand) ||
        operand.length !== 2 ||
        !operand.every((n) => typeof n === "number" && Number.isFinite(n))
      ) {
        fail(`"$mod" takes [divisor, remainder] numbers.`);
      }
      countNode(ctx);
      out[op] = [...operand];
    } else if (op === "$type") {
      const types = Array.isArray(operand) ? operand : [operand];
      checkArrayLength(types, `the "$type" list`);
      for (const t of types) {
        if (typeof t !== "string" && !Number.isInteger(t)) {
          fail(`"$type" takes a BSON type string/number or an array of them.`);
        }
      }
      countNode(ctx);
      out[op] = Array.isArray(operand) ? [...operand] : operand;
    } else {
      // Comparison operators ($eq/$ne/$gt/$gte/$lt/$lte): literal operand.
      out[op] = copyQueryLiteral(operand, ctx);
    }
  }
  return out;
}

// ── Stage grammar (design §1–§2) ─────────────────────────────────────────────

function checkInteger(name, value, min) {
  if (!Number.isInteger(value) || value < min) {
    fail(`"${name}" takes an integer of at least ${min}.`);
  }
  return value;
}

function checkFieldName(name, what) {
  if (typeof name !== "string" || name === "") {
    fail(`${what} must be a non-empty string.`);
  }
  checkKey(name);
  if (name.startsWith("$")) {
    fail(`${what} cannot start with "$".`);
  }
  return name;
}

function walkSortSpec(arg, ctx, what = "$sort") {
  countNode(ctx);
  if (!isPlainObject(arg) || Object.keys(arg).length === 0) {
    fail(`${what} takes an object of { field: 1 | -1 }.`);
  }
  const out = {};
  for (const key of Object.keys(arg)) {
    checkFieldName(key, `a ${what} field`);
    if (arg[key] !== 1 && arg[key] !== -1) {
      fail(
        `${what} directions must be 1 or -1 (found "${arg[key]}" on "${key}").`,
      );
    }
    out[key] = arg[key];
  }
  return out;
}

function walkUnwind(arg, ctx) {
  countNode(ctx);
  if (typeof arg === "string") {
    if (!arg.startsWith("$") || arg.startsWith("$$")) {
      fail(`$unwind takes a "$field" path.`);
    }
    return arg;
  }
  if (!isPlainObject(arg)) {
    fail("$unwind takes a string field path or an options object.");
  }
  const out = {};
  for (const key of Object.keys(arg)) {
    if (key === "path") {
      if (
        typeof arg.path !== "string" ||
        !arg.path.startsWith("$") ||
        arg.path.startsWith("$$")
      ) {
        fail(`$unwind.path must be a "$field" path.`);
      }
      out.path = arg.path;
    } else if (key === "includeArrayIndex") {
      out.includeArrayIndex = checkFieldName(
        arg.includeArrayIndex,
        "$unwind.includeArrayIndex",
      );
    } else if (key === "preserveNullAndEmptyArrays") {
      if (typeof arg.preserveNullAndEmptyArrays !== "boolean") {
        fail("$unwind.preserveNullAndEmptyArrays must be a boolean.");
      }
      out.preserveNullAndEmptyArrays = arg.preserveNullAndEmptyArrays;
    } else {
      fail(`"$unwind" does not take "${key}".`);
    }
  }
  if (out.path === undefined) fail("$unwind requires a path.");
  return out;
}

function walkFacet(arg, ctx) {
  countNode(ctx);
  if (!isPlainObject(arg) || Object.keys(arg).length === 0) {
    fail("$facet takes an object of named branch pipelines.");
  }
  const branches = Object.keys(arg);
  if (branches.length > MAX_FACET_BRANCHES) {
    fail(`$facet allows at most ${MAX_FACET_BRANCHES} branches.`);
  }
  const out = {};
  for (const branch of branches) {
    checkFieldName(branch, "a $facet branch name");
    if (!Array.isArray(arg[branch])) {
      fail(`$facet branch "${branch}" must be an array of stages.`);
    }
    // Same collection as the enclosing pipeline; each branch gets its own
    // trailing result cap (the top-level cap does not bound in-document
    // branch arrays).
    out[branch] = validateSubPipeline(
      arg[branch],
      { ...ctx, subDepth: ctx.subDepth + 1 },
      { appendCap: true },
    );
  }
  return out;
}

function walkLookup(arg, ctx) {
  countNode(ctx);
  if (!isPlainObject(arg)) fail("$lookup takes an options object.");
  ctx.state.lookups += 1;
  if (ctx.state.lookups > MAX_LOOKUP_COUNT) {
    fail(`pipeline allows at most ${MAX_LOOKUP_COUNT} $lookup stages.`);
  }
  for (const key of Object.keys(arg)) {
    if (
      !["from", "localField", "foreignField", "let", "as", "pipeline"].includes(
        key,
      )
    ) {
      fail(`"$lookup" does not take "${key}".`);
    }
  }
  // `from` must be a string — an object/array here is a type-confusion probe
  // (and the `from`-less form only pairs with the denied `$documents`).
  if (typeof arg.from !== "string") {
    fail("$lookup.from must be a catalog-declared collection name string.");
  }
  checkCollectionAccess(arg.from, ctx);
  const out = { from: arg.from };
  if ((arg.localField === undefined) !== (arg.foreignField === undefined)) {
    fail("$lookup takes localField and foreignField together.");
  }
  if (arg.localField !== undefined) {
    out.localField = checkFieldName(arg.localField, "$lookup.localField");
    out.foreignField = checkFieldName(arg.foreignField, "$lookup.foreignField");
  }
  // `let` value-expressions evaluate in the OUTER collection's scope; the
  // names they bind are consumed by the inner pipeline's `$expr`.
  const scope = new Set(ctx.scope);
  if (arg.let !== undefined) {
    if (!isPlainObject(arg.let)) {
      fail("$lookup.let must be an object of { name: expression }.");
    }
    if (arg.pipeline === undefined) {
      fail("$lookup.let requires a pipeline.");
    }
    out.let = {};
    for (const name of Object.keys(arg.let)) {
      out.let[name] = walkExpression(arg.let[name], ctx); // outer scope
      bindVarName(name, scope, "$lookup.let");
    }
  }
  if (arg.pipeline !== undefined) {
    if (!Array.isArray(arg.pipeline)) {
      fail("$lookup.pipeline must be an array of stages.");
    }
    // Full validation recurses with the joined collection as base. No result
    // cap is appended here — the design caps the top level and $facet
    // branches only.
    out.pipeline = validateSubPipeline(
      arg.pipeline,
      { ...ctx, collection: arg.from, scope, subDepth: ctx.subDepth + 1 },
      { appendCap: false },
    );
  }
  if (out.localField === undefined && out.pipeline === undefined) {
    fail("$lookup requires localField/foreignField or a pipeline.");
  }
  out.as = checkFieldName(arg.as, "$lookup.as");
  return out;
}

// `$setWindowFields.output` values are the one legal mixed-key shape: exactly
// one `$`-operator key plus an optional `window` key — so they get their own
// walk instead of the single-key expression rule.
function walkSetWindowFields(arg, ctx) {
  countNode(ctx);
  if (!isPlainObject(arg) || !isPlainObject(arg.output)) {
    fail("$setWindowFields takes { partitionBy?, sortBy?, output }.");
  }
  const out = {};
  for (const key of Object.keys(arg)) {
    if (key === "partitionBy") {
      out.partitionBy = walkExpression(arg.partitionBy, ctx);
    } else if (key === "sortBy") {
      out.sortBy = walkSortSpec(arg.sortBy, ctx, "$setWindowFields.sortBy");
    } else if (key === "output") {
      out.output = {};
      for (const field of Object.keys(arg.output)) {
        checkFieldName(field, "a $setWindowFields.output field");
        out.output[field] = walkWindowOutput(arg.output[field], ctx);
      }
    } else {
      fail(`"$setWindowFields" does not take "${key}".`);
    }
  }
  return out;
}

function walkWindowOutput(value, ctx) {
  countNode(ctx);
  if (!isPlainObject(value)) {
    fail("each $setWindowFields.output field takes { $operator: …, window? }.");
  }
  const keys = Object.keys(value);
  for (const key of keys) checkKey(key);
  const operatorKeys = keys.filter((key) => key.startsWith("$"));
  if (
    operatorKeys.length !== 1 ||
    keys.length > (keys.includes("window") ? 2 : 1)
  ) {
    fail(
      "each $setWindowFields.output field takes exactly one window operator " +
        "and an optional window.",
    );
  }
  const op = operatorKeys[0];
  if (DENIED_EXPRESSION_OPERATORS.has(op)) {
    fail(`the operator "${op}" is not allowed (server-side JavaScript).`);
  }
  if (!ALLOWED_EXPRESSION_OPERATORS.has(op)) {
    fail(`"${op}" is not an allowed window operator.`);
  }
  const inner = enterDepth(ctx);
  const out = { [op]: walkExpression(value[op], inner) };
  if (value.window !== undefined)
    out.window = walkWindowSpec(value.window, inner);
  return out;
}

function walkWindowSpec(window, ctx) {
  countNode(ctx);
  if (!isPlainObject(window)) fail("window must be an object.");
  const out = {};
  for (const key of Object.keys(window)) {
    if (key === "documents" || key === "range") {
      const bounds = window[key];
      if (
        !Array.isArray(bounds) ||
        bounds.length !== 2 ||
        !bounds.every(
          (b) => typeof b === "number" || b === "unbounded" || b === "current",
        )
      ) {
        fail(`window.${key} takes [lower, upper] bounds.`);
      }
      out[key] = [...bounds];
    } else if (key === "unit") {
      if (typeof window.unit !== "string")
        fail("window.unit must be a string.");
      out.unit = window.unit;
    } else {
      fail(`"window" does not take "${key}".`);
    }
  }
  return out;
}

// Stages whose argument the generic expression walk covers: the argument is a
// document of field → expression (or a bare expression), and the walk's
// invariants (allowlists, prototype-key rejection, `$$`-var classification,
// caps) hold at every position. Structural server rules (e.g. `$bucket`
// requires `boundaries`) are left to the server — no security surface there.
const EXPRESSION_ARG_STAGES = new Set([
  "$addFields",
  "$bucket",
  "$bucketAuto",
  "$fill",
  "$group",
  "$project",
  "$redact",
  "$replaceRoot",
  "$replaceWith",
  "$set",
  "$sortByCount",
]);

// Per-stage argument-type contract (design §1) — checked before any walk.
const OBJECT_ARG_STAGES = new Set([
  "$addFields",
  "$bucket",
  "$bucketAuto",
  "$facet",
  "$fill",
  "$group",
  "$lookup",
  "$match",
  "$project",
  "$replaceRoot",
  "$set",
  "$setWindowFields",
]);

function validateStage(stage, ctx) {
  countNode(ctx);
  if (!isPlainObject(stage)) {
    fail("each pipeline stage must be a single-key object.");
  }
  const keys = Object.keys(stage);
  if (keys.length !== 1) {
    fail(
      `each pipeline stage must have exactly one key; found ` +
        `${keys.length === 0 ? "an empty stage" : keys.join(", ")}.`,
    );
  }
  const name = keys[0];
  checkKey(name);
  if (DENIED_STAGES.has(name)) {
    fail(`the stage "${name}" is not allowed.`);
  }
  if (DEFERRED_STAGES.has(name)) {
    fail(`the stage "${name}" is not enabled.`);
  }
  if (!ALLOWED_STAGES.has(name) && !COLLECTION_SCOPED_STAGES.has(name)) {
    fail(`"${name}" is not an allowed pipeline stage.`);
  }
  ctx.state.stages += 1;
  if (ctx.state.stages > MAX_PIPELINE_STAGES) {
    fail(
      `pipeline exceeds the maximum of ${MAX_PIPELINE_STAGES} stages ` +
        `(counting $facet branches and $lookup sub-pipelines).`,
    );
  }
  const arg = stage[name];
  if (OBJECT_ARG_STAGES.has(name) && !isPlainObject(arg)) {
    fail(`"${name}" takes an object.`);
  }
  const inner = enterDepth(ctx);
  switch (name) {
    case "$limit":
      return { $limit: checkInteger("$limit", arg, 1) };
    case "$skip":
      return { $skip: checkInteger("$skip", arg, 0) };
    case "$sample": {
      if (!isPlainObject(arg) || Object.keys(arg).join(",") !== "size") {
        fail("$sample takes { size: number }.");
      }
      const size = checkInteger("$sample.size", arg.size, 1);
      if (size > MAX_SAMPLE_SIZE) {
        fail(`$sample.size allows at most ${MAX_SAMPLE_SIZE}.`);
      }
      return { $sample: { size } };
    }
    case "$count": {
      const field = checkFieldName(arg, "$count");
      if (field.includes(".")) fail(`$count cannot contain ".".`);
      return { $count: field };
    }
    case "$unset": {
      const paths = Array.isArray(arg) ? arg : [arg];
      checkArrayLength(paths, "the $unset list");
      const rebuilt = paths.map((path) =>
        checkFieldName(path, "an $unset path"),
      );
      return { $unset: Array.isArray(arg) ? rebuilt : rebuilt[0] };
    }
    case "$sort":
      return { $sort: walkSortSpec(arg, inner) };
    case "$unwind":
      return { $unwind: walkUnwind(arg, inner) };
    case "$match":
      return { $match: walkQueryDoc(arg, inner) };
    case "$facet":
      return { $facet: walkFacet(arg, inner) };
    case "$lookup":
      return { $lookup: walkLookup(arg, inner) };
    case "$setWindowFields":
      return { $setWindowFields: walkSetWindowFields(arg, inner) };
    default:
      if (!EXPRESSION_ARG_STAGES.has(name)) {
        // Unreachable while the stage sets and this switch agree; fails
        // closed if they ever drift.
        fail(`"${name}" has no argument grammar.`);
      }
      return { [name]: walkExpression(arg, inner) };
  }
}

function validateSubPipeline(stages, ctx, { appendCap }) {
  if (ctx.subDepth > MAX_SUBPIPELINE_DEPTH) {
    fail(
      `pipelines may nest at most ${MAX_SUBPIPELINE_DEPTH} levels of ` +
        `sub-pipelines.`,
    );
  }
  const out = stages.map((stage) => validateStage(stage, ctx));
  if (appendCap) {
    // Unconditional trailing cap — an agent-supplied $limit is never trusted
    // to be the bound (appending only-if-absent would let `$limit: 100000`
    // defeat the cap; a redundant trailing $limit is harmless).
    out.push({ $limit: PIPELINE_RESULT_CAP });
  }
  return out;
}

function validatePipeline({ collection, pipeline, catalog, roles }) {
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    fail("no collections catalog is configured.");
  }
  if (!Array.isArray(pipeline)) {
    fail("pipeline must be an array of stages.");
  }
  // Serialized-size cap doubles as the cycle/pathological-nesting pre-check:
  // JSON.stringify throws (catchably) on circular or absurdly deep input
  // before the walker ever recurses.
  let serialized;
  try {
    serialized = JSON.stringify(pipeline);
  } catch {
    fail("pipeline is circular, too deeply nested, or not serializable.");
  }
  if (serialized.length > MAX_PIPELINE_BYTES) {
    fail(
      `pipeline exceeds the maximum serialized size of ${MAX_PIPELINE_BYTES} bytes.`,
    );
  }
  const ctx = {
    state: { nodes: 0, stages: 0, lookups: 0 },
    catalog,
    userRoles: Array.isArray(roles) ? roles : [],
    scope: new Set(),
    depth: 0,
    subDepth: 0,
    collection,
  };
  checkCollectionAccess(collection, ctx);
  return {
    collection,
    pipeline: validateSubPipeline(pipeline, ctx, { appendCap: true }),
  };
}

export default validatePipeline;
