// Five structural components own a sub-form slot. The library declares the
// slot as `blocks:`; authors write it as `form:` (per the action-authoring
// spec). The resolver renames `form:` → `blocks:` only for entries whose
// component is in this allowlist.
const STRUCTURAL_COMPONENTS = [
  "controlled_list",
  "collapsible_list",
  "section",
  "box",
  "label",
  "file_upload",
];

// Library path used in the emitted _ref nodes — relative to the module
// file root (mirrors how this module's manifest references `enums/*.yaml`).
const FIELDS_DIR = "components/fields";

const VALID_MODES = ["edit", "view", "review", "error"];

function fail(message) {
  throw new Error(`makeActionsForm: ${message}`);
}

// True iff any entry in formArray (or any nested sub-form within a
// structural entry) carries viewOnly: true.
function formHasViewOnly(formArray) {
  if (!Array.isArray(formArray)) return false;
  for (const entry of formArray) {
    if (entry?.viewOnly === true) return true;
    if (
      STRUCTURAL_COMPONENTS.includes(entry?.component) &&
      formHasViewOnly(entry?.form)
    ) {
      return true;
    }
  }
  return false;
}

function validateMode(mode, form) {
  if (formHasViewOnly(form) && !mode) {
    fail(`'mode' var is required when any form entry has viewOnly: true`);
  }
  if (mode !== undefined && !VALID_MODES.includes(mode)) {
    fail(`invalid mode '${mode}' (expected one of: edit, view, review, error)`);
  }
}

// A raw entry (no `component:`) is a Lowdefy block authored inline, or emitted
// by a consumer-supplied field component file. It shares the library's
// authoring vocabulary rather than writing block keys directly:
//
//   - `key` names the block id. It is ALSO the only thing `form_meta` records
//     (makeWorkflowsConfig's METADATA_FIELDS), and GetWorkflowAction allowlists
//     the stored form_data slice by those keys — so an entry with a bare `id`
//     and no `key` saves its value but never prefills or renders. Mapping here
//     keeps one authored `key` feeding both the block tree and form_meta.
//   - `title` is metadata for the overview/review renderer only. The block's
//     own visible label stays the block's business (`properties.title` on the
//     antd input blocks) — not every block type accepts a title, so it can't
//     be injected generically.
//
// Neither is a valid block property (the framework's block schema is
// `additionalProperties: false`, requiring `id` + `type`), so both are mapped
// or dropped before the node reaches the page tree.
function substituteRawBlock(entry) {
  const { key, title: _title, ...block } = entry;
  if (key === undefined) return block;
  if (typeof key !== "string") {
    fail(`raw form block 'key' must be a string, received ${typeof key}.`);
  }
  if (block.id !== undefined) {
    fail(
      `raw form block cannot define both 'key' ('${key}') and 'id' ('${block.id}') — 'key' becomes the block id.`,
    );
  }
  return { id: key, ...block };
}

function substituteEntry(entry, mode) {
  // Strip the viewOnly key on every entry — it's resolver metadata, never
  // a library-component var.
  const { viewOnly: _viewOnly, ...stripped } = entry ?? {};
  const component = stripped.component;

  // (1) no component: a raw Lowdefy block, emitted with its authoring
  // vocabulary translated to block keys.
  if (!component) return substituteRawBlock(stripped);

  // (2) bare component: substitute via _ref to the library file. Unknown
  // names and missing required vars fail at the framework's _ref / _var
  // resolution step; the resolver doesn't pre-check.
  const isStructural = STRUCTURAL_COMPONENTS.includes(component);
  const { component: _name, form: subForm, ...authorVars } = stripped;

  const vars = isStructural
    ? { ...authorVars, blocks: walk(subForm, mode) }
    : authorVars;

  return {
    _ref: {
      path: `${FIELDS_DIR}/${component}.yaml`,
      key: "config",
      vars,
    },
  };
}

function walk(formArray, mode) {
  return (formArray ?? [])
    .filter((entry) => !(mode === "edit" && entry?.viewOnly === true))
    .map((entry) => substituteEntry(entry, mode));
}

function recordId(id, source, ids) {
  if (id === undefined || id === null) return;
  if (typeof id !== "string") return;
  if (ids.has(id)) {
    const prev = ids.get(id);
    fail(
      `duplicate block id '${id}' produced by components ${prev.component} and ${source.component} (keys: ${prev.key}, ${source.key}).`,
    );
  }
  ids.set(id, source);
}

function collectIdsFromNode(node, ids) {
  if (!node || typeof node !== "object") return;

  // Substituted library entry: derive ids from the library's id template.
  if (node._ref && typeof node._ref === "object") {
    const refPath = node._ref.path ?? "";
    const vars = node._ref.vars ?? {};
    const componentName = refPath
      .split("/")
      .pop()
      .replace(/\.yaml$/, "");
    const source = { component: componentName, key: vars.key ?? '"unnamed"' };

    // Primitive library components use { id: { _var: key } }. Structural
    // components (controlled_list / collapsible_list / label) emit a wrapper id
    // derived as `${key}_label` plus an inner id of `${key}`. For the others
    // (section / box / file_upload) the primary id is just `key`.
    if (typeof vars.key === "string") {
      recordId(vars.key, source, ids);
      if (
        componentName === "controlled_list" ||
        componentName === "collapsible_list" ||
        componentName === "label"
      ) {
        recordId(`${vars.key}_label`, source, ids);
      }
    }

    // Recurse into the sub-form blocks for structural components.
    if (Array.isArray(vars.blocks)) {
      for (const child of vars.blocks) collectIdsFromNode(child, ids);
    }
    return;
  }

  // Raw inline block (no _ref wrapper). Read its id directly and recurse.
  if (typeof node.id === "string") {
    recordId(node.id, { component: node.type ?? "raw", key: node.id }, ids);
  }
  if (Array.isArray(node.blocks)) {
    for (const child of node.blocks) collectIdsFromNode(child, ids);
  }
}

function checkIdCollisions(substituted) {
  const ids = new Map();
  for (const entry of substituted) collectIdsFromNode(entry, ids);
}

function makeActionsForm(_, vars) {
  if (!vars?.form) return [];
  validateMode(vars.mode, vars.form);
  const substituted = walk(vars.form, vars.mode);
  checkIdCollisions(substituted);
  return substituted;
}

export default makeActionsForm;
