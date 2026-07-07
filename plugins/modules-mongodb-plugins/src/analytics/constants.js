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

// Dataset / dimension / measure ids double as Mongo field paths in compiled
// pipelines. Restricting them to plain identifiers (no '$', no '.') removes
// the operator- and path-injection surface entirely.
export const ID_REGEX = /^[a-zA-Z][a-zA-Z0-9_]*$/;

export const CHART_TYPES = ['bar', 'line', 'pie'];
export const FILTER_CONTROLS = ['select', 'daterange'];

export const AGGREGATIONS = ['sum', 'avg', 'min', 'max', 'count'];

// Allowed filter operators per dimension/measure type.
export const OPS_BY_TYPE = {
  string: ['eq', 'neq', 'in', 'nin', 'contains'],
  number: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'nin'],
  date: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
  boolean: ['eq', 'neq'],
};
