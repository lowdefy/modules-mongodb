// Build-time metadata emitter for part 17's workflow-overview cards.
// Walks vars.workflows once and emits a per-action-type metadata tree
// (component / key / required / title / validate, with recursive form on
// structural components). Substituted block trees are not in scope here —
// templates render the form body via makeActionsForm at template-render time.

const STRUCTURAL_COMPONENTS = [
  'controlled_list',
  'section',
  'box',
  'label',
  'file_upload',
];

const METADATA_FIELDS = ['component', 'key', 'required', 'title', 'validate'];

function pickMetadata(entry) {
  const node = {};
  for (const field of METADATA_FIELDS) {
    if (field in entry) node[field] = entry[field];
  }
  if (!('required' in node)) node.required = false;
  return node;
}

function toMetadataNode(entry) {
  const node = pickMetadata(entry);
  if (entry.component && STRUCTURAL_COMPONENTS.includes(entry.component)) {
    node.form = (entry.form ?? []).map(toMetadataNode);
  }
  return node;
}

function describeForm(formArray) {
  return (formArray ?? []).map(toMetadataNode);
}

function makeActionFormConfigs(_, vars) {
  const { workflows } = vars;
  const out = {};
  for (const workflow of workflows) {
    for (const action of workflow.actions ?? []) {
      if (action.kind !== 'form') continue;
      const entry = { form: describeForm(action.form) };
      if (action.form_review) entry.form_review = describeForm(action.form_review);
      if (action.form_error) entry.form_error = describeForm(action.form_error);
      out[action.type] = entry;
    }
  }
  return out;
}

export default makeActionFormConfigs;
