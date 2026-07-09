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
