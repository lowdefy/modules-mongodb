# Task 2: Write the `makeActionFormConfigs` resolver

## Context

`makeActionFormConfigs` is a Lowdefy `_ref` resolver invoked once at build time (from `module.lowdefy.yaml`, wired by task 4) to emit `global.action_form_configs` — a per-action **metadata** map. Templates and overview pages (part 17's `workflow-overview`) read this map to render read-only summary views without re-parsing authored YAML.

Per part 15's design "Two emission paths" decision, `action_form_configs` carries **metadata only** — never substituted block trees. The form body itself comes through the other emission path (`makeActionsForm` invoked from inside templates via `_ref: { resolver }`).

The resolver does not load library files from disk. It walks the authored YAML and emits a tree of field-shape descriptors that's enough for part 17 to pick a renderer per node.

### Inputs the resolver receives

Lowdefy calls resolvers as `function makeActionFormConfigs(_, vars)`. The vars shape this resolver expects:

```js
{
  workflows: WorkflowYaml[],   // raw, with _ref already expanded by the framework
}
```

The framework expands all nested `_ref`s in `vars.workflows` before the resolver runs — same pattern as `makeActionPages` ([makeActionPages.js:72-88](../../../../modules/workflows/resolvers/makeActionPages.js)) and `makeWorkflowsConfig`. The resolver sees a plain JS array of workflow objects. No `app_name` is needed — this output is global across all apps the module is composed into.

### Input contract

Read everything from the single raw `vars.workflows` array. Engine-runtime fields (`type`, `kind`, `key`, etc.) and build-time-only fields (`form`, `form_review`, `form_error`) all live on the same raw action object — same shape part 12 reads. Part 4's `makeWorkflowsConfig` narrows the YAML for engine-runtime consumption; **this resolver does not consume part 4's output** — both resolvers read the same raw YAML for their own purposes.

### What the resolver emits

A single object keyed by `action_type`. Only **form actions** (`action.kind === 'form'`) get an entry — task and tracker actions are skipped (no `form:` to describe).

```js
{
  'qualify': {
    form: [
      { component: 'text_input', key: 'contact_name', required: true, title: 'Contact name' },
      { component: 'text_area', key: 'notes', title: 'Notes' },
    ],
  },
  'send-quote': {
    form: [
      { component: 'number', key: 'quote_total', required: true },
    ],
    form_review: [
      { component: 'text_area', key: 'approve_notes' },
    ],
  },
  'proof-of-installation': {
    form: [
      {
        component: 'controlled_list',
        key: 'form.devices',
        required: true,
        title: 'Devices',
        form: [
          { component: 'label_value', key: 'form.devices.$._id', title: 'Device Number' },
          { component: 'date_range_selector', key: 'form.devices.$.warranty', required: true, title: 'Warranty' },
        ],
      },
    ],
  },
}
```

**Keyed actions** (those declaring `key:` on the action) get **one entry per `action_type`**, not per instance. Per-instance keys vary at runtime — they don't affect the schema, so they don't appear in this map. See finding #4 / #12 in [review-1.md](../review/review-1.md).

### Metadata node shape

Each field node in the metadata tree carries:

| Field       | Type                       | When present                                   |
| ----------- | -------------------------- | ---------------------------------------------- |
| `component` | string                     | Always — the author's `component:` name verbatim (`text_input`, `controlled_list`, `my-plugin:device_selector`, …). |
| `key`       | string                     | When the authored entry declared one.          |
| `required`  | boolean                    | Always — defaults to `false`.                  |
| `title`     | string                     | When the authored entry declared one.          |
| `validate`  | array                      | When the authored entry declared validate rules. |
| `form`      | recursive array of nodes   | Only for structural components — see below.    |

**Structural components** that nest a sub-form (and therefore carry a nested `form:` in the metadata):

- `controlled_list`, `section`, `box`, `label`, `file_upload`

These match the allowlist task 1's `makeActionsForm` uses for the sub-form rename. The metadata tree mirrors the authoring vocabulary: authors write `form:` for sub-forms; the metadata emits `form:` for sub-forms.

**Entries without `component:`** (raw Lowdefy blocks the author wrote inline) get emitted as a passthrough node `{ component: null, ... }` carrying whatever `key`/`title` they happened to have. Part 17 falls back to a generic JSON render for these.

**No special handling for namespaced components.** A `component: my-plugin:device_selector` entry emits `{ component: 'my-plugin:device_selector', key: ..., ... }` — part 17's renderer is free to recognize the plugin namespace or fall back to a generic view.

### No `form_error` defaulting

Per the design's "No `form_error` defaulting" bullet, the resolver does not synthesize an absent `form_error:` from `form:`. If the author declared `form_error:`, the entry's metadata carries it; if not, the entry doesn't carry `form_error` at all. Matches v0's behaviour at [`dist/workflows-module/ui/current_workflow_utils/templates/error.yaml.njk:134-137`](../../../../../dist/workflows-module/ui/current_workflow_utils/templates/error.yaml.njk).

### Build-time validation

Same posture as `makeActionPages` ([makeActionPages.js:34-36](../../../../modules/workflows/resolvers/makeActionPages.js)): minimal. No defensive checks for hypothetical framework misbehaviour. The resolver assumes `vars.workflows` is a plain array of workflow objects with their `_ref`s expanded.

No validation pass is required in this resolver — `makeWorkflowsConfig` (part 4) is the single place that validates workflow-config invariants. This resolver just walks and emits.

### Test fixtures

Three `makeActionFormConfigs` unit tests are spelled out in design.md's "Verification" section. Mirror part 12's test structure ([makeActionPages.test.js](../../../../modules/workflows/resolvers/makeActionPages.test.js)).

Required cases:

- **Worked-example shape.** A workflow with mixed `text_input` / `text_area` / `controlled_list` actions produces the expected `{ form, form_review?, form_error? }` shape per `action_type`, with the structural component carrying a nested `form:` array.
- **`form_error:` absent.** An action with `form:` declared but no `form_error:` produces a metadata entry that does **not** carry a `form_error` key (no resolver-side defaulting to `form:`).
- **Keyed action.** A workflow with a `key: '$device_id'` action produces exactly one metadata entry under the action's `action_type` — no per-instance entries.

## Task

Create two files:

### `modules/workflows/resolvers/makeActionFormConfigs.js`

ES-module JS following the pattern from [makeActionPages.js](../../../../modules/workflows/resolvers/makeActionPages.js):

- Default-export the resolver function.
- Constants at module top: `STRUCTURAL_COMPONENTS = ['controlled_list', 'section', 'box', 'label', 'file_upload']` (same allowlist task 1 uses).
- A `pick` helper that returns only the metadata fields present on the authored entry (mirror the `pick` helper at [makeActionPages.js:26-32](../../../../modules/workflows/resolvers/makeActionPages.js)).

Suggested top-level shape:

```js
const STRUCTURAL_COMPONENTS = ['controlled_list', 'section', 'box', 'label', 'file_upload'];

const METADATA_FIELDS = ['component', 'key', 'required', 'title', 'validate'];

function pickMetadata(entry) {
  // Pick METADATA_FIELDS from entry; default required to false if absent.
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
```

### `modules/workflows/resolvers/makeActionFormConfigs.test.js`

Jest spec mirroring the style of [makeActionPages.test.js](../../../../modules/workflows/resolvers/makeActionPages.test.js). Declare a small fixture workflow inline; drive the resolver; assert on the output object's shape. Three required cases (see "Test fixtures" above).

## Acceptance Criteria

- `modules/workflows/resolvers/makeActionFormConfigs.js` exists with the default-exported resolver function.
- The resolver reads `vars.workflows` (an array of workflow objects) and returns an object keyed by `action_type`.
- Only form actions (`action.kind === 'form'`) appear in the output. Task and tracker actions are skipped.
- Each entry carries `form`; carries `form_review` only when the author declared it; carries `form_error` only when the author declared it.
- Each metadata node carries `component`, `key`, `required`, `title`, `validate` (each present only when the authored entry had a value, except `required` which defaults to `false`). Structural components additionally carry a nested `form:` array.
- Keyed actions produce exactly one metadata entry per `action_type` (no per-instance keys).
- `modules/workflows/resolvers/makeActionFormConfigs.test.js` exists with the three required test cases passing under `pnpm test`.

## Files

- `modules/workflows/resolvers/makeActionFormConfigs.js` — create — the resolver.
- `modules/workflows/resolvers/makeActionFormConfigs.test.js` — create — the Jest spec.

## Notes

- **No library-file I/O.** Unlike `makeActionsForm` (task 1), this resolver doesn't read `components/fields/*.yaml`. It walks the authored YAML and copies the relevant fields onto each metadata node. The library is task 1's concern.

- **Structural-component allowlist must match task 1.** Both resolvers share the same five-component allowlist for sub-form recursion. If task 1 and task 2 land in parallel and the allowlist diverges, the form body and the metadata tree describe different shapes for the same action. Keep the constant identical across both files.

- **Per-action keying — design's solid note.** The design's "What's solid" parenthetical in [review-1.md](../review/review-1.md) explicitly resolved that this map is keyed by `action_type` only — never `action_type.key`. The keyed-action test is the safety net.

- **No `app_name` filtering.** This output is global across all apps the module is composed into. The output is loaded into `_global.action_form_configs` via the manifest wiring in task 4; pages in any app deployment can read it.
