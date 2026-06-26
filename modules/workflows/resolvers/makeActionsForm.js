// Five structural components own a sub-form slot. The library declares the
// slot as `blocks:`; authors write it as `form:` (per the action-authoring
// spec). The resolver renames `form:` → `blocks:` only for entries whose
// component is in this allowlist.
const STRUCTURAL_COMPONENTS = [
  "controlled_list",
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

function substituteEntry(entry, mode) {
  // Strip the viewOnly key on every entry — it's resolver metadata, never
  // a library-component var.
  const { viewOnly: _viewOnly, ...stripped } = entry ?? {};
  const component = stripped.component;

  // (1) no component: emit verbatim (raw Lowdefy block authored inline).
  if (!component) return stripped;

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
    // components (controlled_list / label) emit a wrapper id derived as
    // `${key}_label` plus an inner id of `${key}`. Five structural names
    // share this convention; for the others (section / box / file_upload)
    // the primary id is just `key`.
    if (typeof vars.key === "string") {
      recordId(vars.key, source, ids);
      if (componentName === "controlled_list" || componentName === "label") {
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
