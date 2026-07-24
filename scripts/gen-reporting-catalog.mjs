/*
  Copyright 2020-2026 Lowdefy, Inc

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
*/

/**
 * gen-reporting-catalog.mjs — draft a reporting collections catalog from a
 * live database, for a human to curate and check in.
 *
 * WHAT THIS IS
 *   An operator-run scaffolding tool. It is NEVER a runtime path: the reporting
 *   engine reads the *curated, committed* catalog (module var `catalog`), never
 *   this draft. Generation only lowers the cost of the first draft across many
 *   collections; a human still owns the trusted artifact.
 *
 * WHAT IT DOES
 *   1. Connects with the reporting read-only principal (the same credential the
 *      engine queries with — see task 9's provisioning), lists collections and
 *      views, and $samples a bounded number of documents from each.
 *   2. Infers per-field types (union of observed BSON types), flattens sub-
 *      documents one level into dotted paths, notes arrays, and detects
 *      low-cardinality string fields as candidate enums (with observed values).
 *   3. Optionally asks a model (via the reporting AI gateway — one key, one
 *      access path) to draft per-field descriptions, confirm enum candidates,
 *      propose display hints (money-shaped fields -> `format: currency`), and
 *      infer relationships from field naming. The model NEVER drafts `roles`.
 *   4. Emits catalog YAML with EVERY collection entry COMMENTED OUT.
 *
 * FAIL-CLOSED CONVENTION (why every entry is commented out)
 *   The catalog is the confidentiality/authorization boundary. An ACTIVE entry
 *   with empty/absent `roles` is queryable by ANY AUTHENTICATED USER, so
 *   declaring a collection must be a deliberate human act. Uncommenting an entry
 *   is that act. An unedited draft checked in declares nothing. `roles` is
 *   emitted only as an empty placeholder for the curator to fill — it is never
 *   AI-drafted.
 *
 * DRIFT DETECTION (why ordering is deterministic)
 *   Collections, fields, relationships and enum values are all emitted in sorted
 *   order, so re-running against a drifted schema produces a draft that diffs
 *   cleanly against the curated file — the diff doubles as schema-drift
 *   detection. (Descriptions come from the model and may vary run-to-run; the
 *   model is called at temperature 0 to keep that churn low. `$sample` is
 *   itself random, so rarely-present fields and observed enum values can flicker
 *   between runs — inherent to sampling, not a structural change.)
 *
 * GRACEFUL DEGRADATION
 *   - Empty / unsampleable collection: a stub entry is still emitted (commented).
 *   - Model call fails or no gateway key: a type-inference-only draft is emitted
 *     (empty descriptions, no relationships) with a warning. The script always
 *     produces useful output without the model.
 *
 * ENV VARS (read like other standalone scripts, from LOWDEFY_SECRET_<NAME>)
 *   LOWDEFY_SECRET_REPORTING_DATA_MONGODB_URI  (required)
 *       MongoDB URI of the read-only reporting principal. Falls back to a plain
 *       REPORTING_DATA_MONGODB_URI export. This is the SAME secret the module's
 *       reporting-data connection reads (`_secret: REPORTING_DATA_MONGODB_URI`).
 *   LOWDEFY_SECRET_AI_GATEWAY_API_KEY          (optional)
 *       AI gateway API key. Falls back to AI_GATEWAY_API_KEY (the name the
 *       gateway SDK itself reads). Absent -> type-inference-only draft.
 *   AI_GATEWAY_BASE_URL                        (optional)
 *       Override the gateway base URL (default the Vercel AI Gateway, OpenAI-
 *       compatible endpoint). Mirrors the ai connection's `baseURL` property.
 *   REPORTING_MODEL                            (optional)
 *       Gateway model id (provider/model), default anthropic/claude-sonnet-4.5,
 *       matching the reporting module's `model` var default. Overridden by --model.
 *
 * USAGE
 *   node scripts/gen-reporting-catalog.mjs [options]
 *     --db <name>       Database to sample (default: the db in the URI).
 *     --out <path>      Output file (default: ./reporting-catalog.draft.yaml).
 *     --sample <n>      Documents to $sample per collection (default: 100).
 *     --model <id>      Gateway model id (default: $REPORTING_MODEL or the
 *                       module default).
 *     --no-model        Skip the model call; emit a type-inference-only draft.
 *     --help            Print this usage and exit.
 *
 * The drafting prompt is kept inline in this file (visible and reviewable). This
 * script only ever reads from the database.
 */

import { MongoClient } from "mongodb";
import yaml from "js-yaml";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";

// ── Tunables ─────────────────────────────────────────────────────────────────
export const DEFAULT_SAMPLE_SIZE = 100;
export const DEFAULT_OUT = "reporting-catalog.draft.yaml";
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4.5";
export const DEFAULT_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1";
// A string field is a candidate enum when its distinct values are few and it is
// not effectively an identifier (distinct values well below the observed count).
const ENUM_MAX_DISTINCT = 12;
const ENUM_MIN_OBSERVED = 5;
const ENUM_MAX_DISTINCT_RATIO = 0.5;
// Redaction caps for values sent to the model.
const MODEL_EXAMPLES_PER_FIELD = 3;
const MODEL_STRING_TRUNCATE = 40;

// The catalog field type vocabulary (task 4's shape).
const CATALOG_TYPES = ["string", "number", "boolean", "date", "object", "array"];

// ── Arg parsing ──────────────────────────────────────────────────────────────
export function parseArgs(argv) {
  const args = {
    db: undefined,
    out: DEFAULT_OUT,
    sampleSize: DEFAULT_SAMPLE_SIZE,
    model: process.env.REPORTING_MODEL || DEFAULT_MODEL,
    useModel: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    switch (a) {
      case "--db":
        args.db = argv[(i += 1)];
        break;
      case "--out":
        args.out = argv[(i += 1)];
        break;
      case "--sample":
        args.sampleSize = Number(argv[(i += 1)]);
        break;
      case "--model":
        args.model = argv[(i += 1)];
        break;
      case "--no-model":
        args.useModel = false;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  if (!Number.isFinite(args.sampleSize) || args.sampleSize < 1) {
    throw new Error(`--sample must be a positive integer, got: ${args.sampleSize}`);
  }
  return args;
}

// ── Type inference ───────────────────────────────────────────────────────────
function isBson(v) {
  return v != null && typeof v === "object" && typeof v._bsontype === "string";
}

function isPlainObject(v) {
  return (
    v != null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    !(v instanceof Date) &&
    !isBson(v)
  );
}

/** Map any sampled value to one of the catalog field types. */
export function catalogTypeOf(v) {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return "array";
  if (v instanceof Date) return "date";
  if (isBson(v)) {
    switch (v._bsontype) {
      case "ObjectId":
      case "ObjectID":
      case "UUID":
      case "Binary":
        return "string";
      case "Decimal128":
      case "Double":
      case "Int32":
      case "Long":
        return "number";
      case "Timestamp":
        return "date";
      default:
        return "string";
    }
  }
  switch (typeof v) {
    case "number":
    case "bigint":
      return "number";
    case "boolean":
      return "boolean";
    case "string":
      return "string";
    case "object":
      return "object";
    default:
      return "string";
  }
}

function truncate(str) {
  return str.length > MODEL_STRING_TRUNCATE
    ? `${str.slice(0, MODEL_STRING_TRUNCATE)}…`
    : str;
}

/** A compact, redacted example value for the model prompt. */
function redactExample(v) {
  const t = catalogTypeOf(v);
  if (t === "string") return truncate(String(v));
  if (t === "array") return "[array]";
  if (t === "object") return "{object}";
  if (t === "date") return "<date>";
  if (t === "number" || t === "boolean") return v;
  return null;
}

/**
 * Infer a per-collection field map from sampled documents. Sub-documents are
 * flattened exactly one level into dotted paths; arrays are noted as `array`
 * and not descended into. Returns:
 *   { fields: { [path]: { type, types:[...], values?:[...], examples:[...] } } }
 */
export function inferSchemaFromSample(docs) {
  // path -> { typeCounts: Map, present: n, strings: Set|null, examples: [] }
  const paths = new Map();

  const record = (path, value) => {
    let e = paths.get(path);
    if (!e) {
      e = { typeCounts: new Map(), present: 0, strings: new Set(), examples: [] };
      paths.set(path, e);
    }
    const t = catalogTypeOf(value);
    if (t === null) return; // null/undefined observed — ignore for typing
    e.present += 1;
    e.typeCounts.set(t, (e.typeCounts.get(t) || 0) + 1);
    if (t === "string" && e.strings) {
      if (e.strings.size <= ENUM_MAX_DISTINCT + 1) e.strings.add(value);
    } else if (t !== "string") {
      e.strings = null; // mixed types — not a clean string enum
    }
    if (e.examples.length < MODEL_EXAMPLES_PER_FIELD) {
      const ex = redactExample(value);
      if (ex !== null && !e.examples.includes(ex)) e.examples.push(ex);
    }
  };

  // depth 0 = top level; recurse one level into sub-documents (depth < 1).
  const walk = (obj, prefix, depth) => {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (isPlainObject(v) && depth < 1) {
        walk(v, path, depth + 1);
      } else {
        record(path, v);
      }
    }
  };

  for (const doc of docs) walk(doc, "", 0);

  const fields = {};
  for (const [path, e] of paths) {
    const types = [...e.typeCounts.keys()].sort(
      (a, b) => CATALOG_TYPES.indexOf(a) - CATALOG_TYPES.indexOf(b)
    );
    const type = types.length === 1 ? types[0] : types.join(" | ");
    const field = { type, types, examples: e.examples };
    // Enum candidate: purely string, low-cardinality, not identifier-like.
    if (
      e.strings &&
      types.length === 1 &&
      types[0] === "string" &&
      e.strings.size >= 1 &&
      e.strings.size <= ENUM_MAX_DISTINCT &&
      e.present >= ENUM_MIN_OBSERVED &&
      e.strings.size <= e.present * ENUM_MAX_DISTINCT_RATIO
    ) {
      field.values = [...e.strings].sort();
    }
    fields[path] = field;
  }
  return { fields };
}

// ── Model drafting (AI gateway, OpenAI-compatible endpoint) ──────────────────
const DRAFTING_SYSTEM_PROMPT = `You draft a data catalog for a MongoDB reporting engine. You receive, per collection, its inferred fields with types, a few redacted example values, and candidate enum values. You return JSON only.

For each collection draft:
- A concise "description" of what the collection holds (prompt material for a query-authoring agent).
- Per field, a concise "description".
- "values": for a field that is genuinely a fixed enumeration, echo its enum values (use the provided candidates; drop any that are clearly free text such as ids, names, emails, urls, free-form notes).
- Display hints for MONEY fields only: when a numeric field's name/values indicate currency (total, amount, price, cost, revenue, subtotal, balance, fee, salary, …), set "format":"currency" and "decimals":2 (add "currency"/"locale" only if you are confident).
- "relationships": when a field name references another collection (e.g. company_id -> companies, workflow_id -> workflows, *_ids arrays), add { "field", "collection", "foreignField" } where "collection" MUST be one of the provided collection names and "foreignField" is usually "_id".

Rules:
- NEVER output "roles" — role gating is decided by a human, never drafted.
- Do not invent fields or collections that were not provided.
- Keep descriptions short (one line). No markdown.

Output shape:
{ "collections": { "<name>": { "description": "...", "fields": { "<path>": { "description": "...", "values"?: [...], "format"?: "currency", "currency"?: "USD", "locale"?: "en-US", "decimals"?: 2 } }, "relationships"?: [ { "field": "...", "collection": "...", "foreignField": "..." } ] } } }`;

/** Build the redacted per-collection payload sent to the model. */
export function buildModelInput(inferred, collectionNames) {
  const collections = {};
  for (const name of [...collectionNames].sort()) {
    const info = inferred[name];
    if (!info) continue;
    const fields = {};
    for (const path of Object.keys(info.fields).sort()) {
      const f = info.fields[path];
      const entry = { type: f.type, examples: f.examples };
      if (f.values) entry.enumCandidate = f.values;
      fields[path] = entry;
    }
    collections[name] = { fields };
  }
  return { collectionNames: [...collectionNames].sort(), collections };
}

/** Pull a JSON object out of a model text response, tolerating code fences. */
export function extractJson(text) {
  if (typeof text !== "string") return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callModel({ apiKey, baseURL, model, input }) {
  const res = await fetch(`${baseURL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: DRAFTING_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(input) },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  const parsed = extractJson(content);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("model response was not parseable JSON");
  }
  return parsed.collections || parsed;
}

// ── Merge inference + model draft into catalog entries ───────────────────────
/**
 * Build the final (ordered) catalog entry object for one collection. `roles` is
 * always an empty placeholder — never AI-drafted. Relationships whose target is
 * not a known collection are dropped (hallucination guard).
 */
export function buildCatalogEntry({ inferred, draft, collectionNames }) {
  const known = new Set(collectionNames);
  const draftFields = (draft && draft.fields) || {};

  const entry = {};
  entry.roles = []; // placeholder for the curator; empty = any authenticated user
  entry.description = (draft && typeof draft.description === "string" ? draft.description : "").trim();

  const fields = {};
  for (const path of Object.keys(inferred.fields).sort()) {
    const inf = inferred.fields[path];
    const d = draftFields[path] || {};
    const field = {};
    field.type = inf.type;
    field.description = typeof d.description === "string" ? d.description.trim() : "";
    // Enum values: model's confirmation wins; else the inference candidate.
    const values = Array.isArray(d.values) && d.values.length ? d.values : inf.values;
    if (values && values.length) field.values = [...values].sort();
    // Display hints — prompt material only, copied verbatim from the model.
    if (d.format === "currency" || d.format === "decimal") field.format = d.format;
    if (typeof d.currency === "string") field.currency = d.currency;
    if (typeof d.locale === "string") field.locale = d.locale;
    if (Number.isFinite(d.decimals)) field.decimals = d.decimals;
    fields[path] = field;
  }
  entry.fields = fields;

  // Relationships — from the model, filtered to known collections, sorted.
  const rels = Array.isArray(draft && draft.relationships) ? draft.relationships : [];
  const relationships = rels
    .filter(
      (r) =>
        r &&
        typeof r.field === "string" &&
        typeof r.collection === "string" &&
        known.has(r.collection)
    )
    .map((r) => ({
      field: r.field,
      collection: r.collection,
      foreignField: typeof r.foreignField === "string" ? r.foreignField : "_id",
    }))
    .sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));
  if (relationships.length) entry.relationships = relationships;

  return entry;
}

// ── YAML emission ────────────────────────────────────────────────────────────
/** Prefix every line of `text` with a YAML comment marker. */
export function commentBlock(text) {
  return text
    .replace(/\n+$/, "")
    .split("\n")
    .map((line) => (line.length ? `# ${line}` : "#"))
    .join("\n");
}

function header({ dbName, sampleSize, model, modelUsed, generatedCount }) {
  const lines = [
    "Reporting collections catalog — AI-DRAFTED, HUMAN-CURATED (DO NOT ship as-is).",
    "",
    `Generated by scripts/gen-reporting-catalog.mjs from database "${dbName}"`,
    `($sample ${sampleSize} docs/collection; ${generatedCount} collections).`,
    modelUsed
      ? `Descriptions/hints/relationships drafted by model "${model}" (temperature 0).`
      : "MODEL SKIPPED — type-inference-only draft (descriptions empty, no relationships).",
    "",
    "This is scaffolding, NEVER a runtime path: the reporting engine reads the",
    "curated `catalog` module var, not this file. Copy the entries you want into",
    "your curated catalog and review every one.",
    "",
    "FAIL-CLOSED: every collection entry below is COMMENTED OUT. The catalog is the",
    "confidentiality/authorization boundary — an ACTIVE entry with empty/absent",
    "`roles` is queryable by ANY AUTHENTICATED USER. Uncommenting an entry is your",
    "deliberate act of declaring (exposing) that collection. An unedited draft",
    "checked in declares nothing.",
    "",
    "`roles` is emitted as an empty placeholder only — it is NEVER AI-drafted. Fill",
    "it with a string[] of allowed roles to gate a collection; leave it empty to",
    "expose the collection to any authenticated user.",
    "",
    "Enum `values` are CANDIDATES (low-cardinality string fields); display hints",
    "(`format`/`currency`/`locale`/`decimals`) are prompt material for the agent,",
    "never enforced. Verify both.",
    "",
    "Deterministic ordering (collections, fields, relationships, values all sorted)",
    "means re-running against a drifted schema diffs cleanly against your curated",
    "file — the diff doubles as schema-drift detection.",
    "",
    "See the reporting `catalog` var reference (docs/reporting/reference/vars.md)",
    "and docs/reporting/how-to/complex-data.md for the full catalog shape.",
  ];
  return lines.map((l) => (l.length ? `# ${l}` : "#")).join("\n");
}

/** Render the full draft YAML document. */
export function renderCatalogYaml({ entries, meta }) {
  const dumpOpts = { lineWidth: 80, noRefs: true, sortKeys: false };
  const blocks = [header(meta), ""];
  for (const name of Object.keys(entries).sort()) {
    const { entry, note } = entries[name];
    const banner = `── ${name} ──${note ? ` (${note})` : ""}`;
    const body = yaml.dump({ [name]: entry }, dumpOpts);
    blocks.push(`# ${banner}`);
    blocks.push(commentBlock(body));
    blocks.push("");
  }
  return `${blocks.join("\n").replace(/\n+$/, "")}\n`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
function usage() {
  return [
    "gen-reporting-catalog.mjs — draft a reporting collections catalog for curation.",
    "",
    "Usage: node scripts/gen-reporting-catalog.mjs [options]",
    "  --db <name>     Database to sample (default: the db in the URI).",
    `  --out <path>    Output file (default: ${DEFAULT_OUT}).`,
    `  --sample <n>    Docs to $sample per collection (default: ${DEFAULT_SAMPLE_SIZE}).`,
    `  --model <id>    Gateway model id (default: $REPORTING_MODEL or ${DEFAULT_MODEL}).`,
    "  --no-model      Skip the model call; emit a type-inference-only draft.",
    "  --help          Print this usage and exit.",
    "",
    "Env:",
    "  LOWDEFY_SECRET_REPORTING_DATA_MONGODB_URI  (required) read-only Mongo URI",
    "  LOWDEFY_SECRET_AI_GATEWAY_API_KEY          (optional) AI gateway key",
    "  AI_GATEWAY_BASE_URL                        (optional) gateway base URL",
    "  REPORTING_MODEL                            (optional) gateway model id",
    "",
    "Emits catalog YAML with every collection entry COMMENTED OUT (fail-closed).",
    "Operator-run scaffolding — never a runtime path. Reads only; never writes the DB.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const uri =
    process.env.LOWDEFY_SECRET_REPORTING_DATA_MONGODB_URI ||
    process.env.REPORTING_DATA_MONGODB_URI;
  if (!uri) {
    console.error(
      "No Mongo URI found. Set LOWDEFY_SECRET_REPORTING_DATA_MONGODB_URI (the " +
        "read-only reporting principal — the same secret the reporting-data " +
        "connection reads). A plain REPORTING_DATA_MONGODB_URI export also works."
    );
    process.exit(1);
  }

  const apiKey =
    process.env.LOWDEFY_SECRET_AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY;
  const baseURL = process.env.AI_GATEWAY_BASE_URL || DEFAULT_GATEWAY_BASE_URL;
  const wantModel = args.useModel && !!apiKey;
  if (args.useModel && !apiKey) {
    console.warn(
      "No AI gateway key (LOWDEFY_SECRET_AI_GATEWAY_API_KEY) — emitting a " +
        "type-inference-only draft."
    );
  }

  const client = new MongoClient(uri);
  let inferred = {};
  let notes = {};
  let dbName;
  try {
    await client.connect();
    const db = args.db ? client.db(args.db) : client.db();
    dbName = db.databaseName;
    console.error(`Sampling "${dbName}" ($sample ${args.sampleSize} per collection)…`);

    const infos = await db.listCollections().toArray();
    const collections = infos
      .filter((c) => !c.name.startsWith("system."))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    for (const c of infos.length ? collections : []) {
      let docs = [];
      try {
        docs = await db
          .collection(c.name)
          .aggregate([{ $sample: { size: args.sampleSize } }], { allowDiskUse: true })
          .toArray();
      } catch (err) {
        console.warn(`  ${c.name}: sample failed (${err.message}) — stub entry.`);
      }
      inferred[c.name] = inferSchemaFromSample(docs);
      if (docs.length === 0) notes[c.name] = "empty or unsampleable";
      else if (c.type === "view") notes[c.name] = "view";
      console.error(
        `  ${c.name}: ${docs.length} sampled, ${
          Object.keys(inferred[c.name].fields).length
        } fields`
      );
    }
  } finally {
    await client.close();
  }

  const collectionNames = Object.keys(inferred).sort();

  // Model drafting (graceful on failure).
  let draft = {};
  let modelUsed = false;
  if (wantModel && collectionNames.length) {
    try {
      console.error(`Drafting descriptions with "${args.model}"…`);
      const input = buildModelInput(inferred, collectionNames);
      draft = await callModel({ apiKey, baseURL, model: args.model, input });
      modelUsed = true;
    } catch (err) {
      console.warn(
        `Model drafting failed (${err.message}) — emitting type-inference-only draft.`
      );
      draft = {};
    }
  }

  // Build ordered, commented entries.
  const entries = {};
  for (const name of collectionNames) {
    entries[name] = {
      entry: buildCatalogEntry({
        inferred: inferred[name],
        draft: draft[name],
        collectionNames,
      }),
      note: notes[name],
    };
  }

  const out = renderCatalogYaml({
    entries,
    meta: {
      dbName,
      sampleSize: args.sampleSize,
      model: args.model,
      modelUsed,
      generatedCount: collectionNames.length,
    },
  });
  writeFileSync(args.out, out);
  console.error(
    `Wrote ${collectionNames.length} commented collection entr${
      collectionNames.length === 1 ? "y" : "ies"
    } to ${args.out}. Review and curate before use.`
  );
}

// Only run when invoked directly (so helpers are importable for tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
