// Shared caps and grammar for the reporting analytics engine. These are the
// validation caps from the ai-chat-reporting design's security model — specs
// exceeding a cap fail validation with a message the model can act on.

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1000;
export const MAX_SECTIONS = 12;
export const MAX_LABEL_LENGTH = 200;
export const MAX_MARKDOWN_LENGTH = 5000;
export const MAX_DATA_PARTS_SPECS = 8;
export const MAX_SELECT = 10;
export const MAX_MEASURES = 10;
export const MAX_FILTERS = 20;
export const MAX_SORT = 5;
export const MAX_IN_VALUES = 100;
export const MAX_FILTER_OPTIONS = 50;

// Dataset / dimension / measure ids are plain identifiers (no '$', no '.').
// They are the AI-facing allowlist keys and the output-column names — the AI
// only ever names these ids, never a raw field path.
export const ID_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

// Optional author-declared field path a dimension/measure maps to (defaults to
// its id). Dotted paths reach embedded sub-documents (e.g. `entity.id`,
// `created.user.name`). This is safe because the path comes from the trusted
// build-time dictionary, never from the AI: no '$', no leading digit, no empty
// or '..' segments — so it cannot inject an operator or escape the field path.
export const PATH_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)*$/;

// Granularities a date dimension may declare via `bucket`, compiled to a
// $dateTrunc inside the existing $group (no new pipeline stage). Enables time
// series without pre-bucketed string fields.
export const DATE_BUCKETS = ["year", "month", "week", "day"];

export const CHART_TYPES = ["bar", "line", "pie"];
export const FILTER_CONTROLS = ["select", "daterange"];

export const AGGREGATIONS = ["sum", "avg", "min", "max", "count"];

// Optional display format a measure can declare in the data dictionary. Drives
// how the report renderer formats the measure's values (KPI Statistic, table
// cells). `currency` renders with a symbol and two decimals; the default
// (unset) renders as a grouped decimal.
export const MEASURE_FORMATS = ["currency"];

// Number display defaults for the report renderer. Currency is USD/`$` — the
// single concrete need today; a dictionary-level locale/currency override can
// be added when a second currency actually appears.
export const REPORT_LOCALE = "en-US";
export const REPORT_CURRENCY = "USD";
export const REPORT_CURRENCY_SYMBOL = "$";
export const REPORT_DECIMALS = 2;

// Allowed filter operators per dimension/measure type.
export const OPS_BY_TYPE = {
  string: ["eq", "neq", "in", "nin", "contains"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "in", "nin"],
  date: ["eq", "neq", "gt", "gte", "lt", "lte"],
  boolean: ["eq", "neq"],
};

// ---------------------------------------------------------------------------
// Open query engine resource caps (design §6).
//
// These bound AI-authored raw aggregation pipelines validated by
// validatePipeline.js. They protect both the database (memory, cardinality,
// scan cost) and the validator's own recursion (a deeply nested tree can
// overflow the walker before any structural cap is consulted). The three
// allowlists (stageAllowlist / expressionOperatorAllowlist /
// matchOperatorAllowlist) decide WHAT is allowed; these caps decide HOW MUCH.
// ---------------------------------------------------------------------------

// Max total pipeline stages, counted INCLUDING stages inside `$facet` branches
// and `$lookup` sub-pipelines (not just top-level).
export const MAX_PIPELINE_STAGES = 50;

// Max nesting depth of sub-pipelines (`$lookup.pipeline`, `$facet` branches).
export const MAX_SUBPIPELINE_DEPTH = 5;

// Max number of `$lookup` stages anywhere in the pipeline (bounds join fan-out
// and uncorrelated-lookup cartesian products).
export const MAX_LOOKUP_COUNT = 10;

// Max number of branches in a single `$facet` stage.
export const MAX_FACET_BRANCHES = 10;

// Max nesting depth of a single expression tree. An explicit depth guard so the
// recursive expression walker fails with a validation error, never a Node stack
// overflow (e.g. a 100k-deep `$and` under `$expr`).
export const MAX_EXPRESSION_DEPTH = 100;

// Max total classified nodes across the whole pipeline (validator self-protection
// against a broad-but-shallow tree that evades the depth guard).
export const MAX_PIPELINE_NODES = 10000;

// Max length of an array literal in an expression (`$in`/`$nin`/`$all` operands,
// `$range` output shape, etc.). Carries forward today's MAX_IN_VALUES, which is
// otherwise dropped in the new model.
export const MAX_ARRAY_LITERAL_LENGTH = MAX_IN_VALUES;

// Max serialized (JSON) size of the pipeline in bytes — bounds a payload padded
// with large `$literal` blobs, which the walker does not recurse into but must
// still account for.
export const MAX_PIPELINE_BYTES = 100000;

// Max length of a regex pattern string (`$regex` and the expression forms
// `$regexMatch`/`$regexFind`/`$regexFindAll`). A hard cap because `maxTimeMS` is
// a weak backstop against catastrophic backtracking (design §3b).
export const MAX_REGEX_PATTERN_LENGTH = 200;

// Regex flags accepted on `$regex`/`$options` and the expression regex forms.
// Anything outside this set — notably `x`/verbose — is rejected (design §3b).
export const ALLOWED_REGEX_FLAGS = "imsu";

// Cap on `$sample.size` — `$sample` on a large collection without a suitable
// index is a blocking scan (design §6).
export const MAX_SAMPLE_SIZE = 1000;

// The unconditionally appended trailing `$limit`. The engine always appends this
// as the final top-level stage (and to every `$facet` branch), never trusting an
// agent-supplied limit to be the bound (design §6). Matches today's MAX_LIMIT.
export const PIPELINE_RESULT_CAP = 1000;
