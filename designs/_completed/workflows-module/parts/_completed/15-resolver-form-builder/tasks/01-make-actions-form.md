# Task 1: Write the `makeActionsForm` resolver

## Context

`makeActionsForm` is a Lowdefy `_ref` resolver invoked from inside Nunjucks page templates to substitute library-component references in an action's `form:` block into a fully-rendered Lowdefy block tree. Per part 15's design "Two emission paths" decision, this is the canonical path for `edit` / `view` / `review` / `error` page bodies — templates call this resolver at render time and pass in the `form` / `form_review` / `form_error` slice from part 12's `action_config` template var.

The 27 library components were shipped by part 14 at [modules/workflows/components/fields/](../../../../modules/workflows/components/fields/). Each is a plain YAML file with `vars:` (the author-facing parameter schema) and `config:` (the block-tree fragment to emit). Authors reference components by `component:` name in action `form:` blocks; this resolver dereferences each one, merges author-supplied vars into the component's `_var:` consumers, and emits the substituted tree. See [text_input.yaml](../../../../modules/workflows/components/fields/text_input.yaml) and [controlled_list.yaml](../../../../modules/workflows/components/fields/controlled_list.yaml) for representative shapes.

### Inputs the resolver receives

Lowdefy calls resolvers as `function makeActionsForm(_, vars)`. The vars shape this resolver expects:

```js
{
  form: FormEntry[],   // an action's form / form_review / form_error array
}
```

The caller (part 16's templates) passes one slice at a time — `{ form: action_config.form }` for the edit body, `{ form: action_config.form_review }` for the review body, etc. The resolver doesn't care which slice it is; it just walks the array. Empty / missing input returns `[]`.

### Library file loading

The resolver loads `components/fields/{component}.yaml` from disk at build time when it encounters a bare `component:` reference. Use `fs.readFileSync` + a YAML parser (`js-yaml` is already in the repo — confirm via `package.json` before adding). Cache loaded library files in a module-scoped Map keyed by component name to avoid re-reading per author entry. Path is module-relative — `path.resolve(import.meta.dirname, '../components/fields', `${component}.yaml`)` against the resolver's location.

### Substitution algorithm

For each entry in the input array:

1. **Has no `component:` field** → emit verbatim (raw Lowdefy block, e.g. a hand-rolled `{ id, type: Box, ... }`).
2. **`component:` contains `:`** (namespaced, e.g. `my-plugin:device_selector`) → emit verbatim — Lowdefy resolves the plugin component at runtime. Do not look up a library file.
3. **`component:` is a bare name** (no `:`):
   - Load `components/fields/{component}.yaml`. If missing → fail (see Build-time validation).
   - **Sub-form var name normalization:** if `component` is one of the structural-allowlist names — `controlled_list`, `section`, `box`, `label`, `file_upload` — rename the author's `form:` key to `blocks:` on the entry before merging vars. This bridges the spec's authoring vocabulary (`form:` for sub-forms) with the library's implementation vocabulary (`blocks:` for the sub-form slot).
   - **Recurse on the sub-form first.** If the entry now carries `blocks:` (post-rename) and `component` is in the structural allowlist, run `makeActionsForm` on `entry.blocks` before merging. The substituted sub-tree replaces `entry.blocks` for the merge step.
   - **Required-vars check:** for each declared `vars:` entry in the library file with `required: true`, verify the author supplied a value. If missing, fail with a precise message.
   - **Merge.** Walk the library file's `config:` tree; every operator subtree of the shape `{ _var: <name> }` or `{ _var: { key: <name>, default: <value> } }` is left in place — Lowdefy itself resolves these at build time when the component is included via this resolver's output. The author's vars are attached to the entry's substitution context so the resolved tree picks them up correctly.

Output: the array of substituted entries (preserving order). The shape is a normal Lowdefy block array — the page template inlines it directly.

> **Note on merge strategy:** the library YAML uses `_var: <name>` operators throughout (see [text_input.yaml:28-29](../../../../modules/workflows/components/fields/text_input.yaml)). The resolver does **not** need to substitute these manually — it returns the library file's `config:` subtree with the author's vars wrapped as a `_ref { vars }` payload, and Lowdefy's normal `_var` resolution picks them up at the next pass. The structural-component recursion (for nested `form:` arrays) is the only thing the resolver itself walks; primitive-component var consumption is left to Lowdefy.

### Sub-form var rename allowlist

The five components that own a sub-form slot:

| Component         | Author writes | Library declares |
| ----------------- | ------------- | ---------------- |
| `controlled_list` | `form:`       | `blocks:`        |
| `section`         | `form:`       | `blocks:`        |
| `box`             | `form:`       | `blocks:`        |
| `label`           | `form:`       | `blocks:`        |
| `file_upload`     | `form:`       | `blocks:`        |

For any other component, an author-side `form:` key has no special meaning — it'd just be an unknown var. The library's required-vars check (above) is the only protection; a bare-component entry with an unknown `form:` key on a non-allowlisted component is silently dropped at merge time (Lowdefy ignores unknown vars). That matches finding #6's "required-only" decision from the review.

### Build-time validation

Fail the build (throw with a precise path-prefixed message) when:

1. **Bare `component:` name doesn't match a library file.** A `component:` value with no `:` separator that doesn't resolve to `components/fields/{component}.yaml` fails with: `makeActionsForm: unknown component '<name>' — no file at components/fields/<name>.yaml.` Include any contextual key the resolver can read (e.g. the author's `key:` field if present) to help locate the offending entry.

2. **Required vars missing.** For each library component's `vars:` entry with `required: true`, the author must supply a value. Missing → fail with: `makeActionsForm: component '<name>' missing required var '<var>' (entry key: <key|"unnamed">).`

3. **Block id collisions within a single substituted form tree.** After substitution, walk the resulting tree and collect all `id` fields (including wrapper ids derived from `_string.concat`, e.g. `controlled_list`'s `{key}_label`). Duplicates fail with: `makeActionsForm: duplicate block id '<id>' produced by components <component_a> and <component_b> (keys: <key_a>, <key_b>).` Single-tree only — `form:` / `form_review:` cross-form collisions stay deferred to authors per the design's "Out of scope" bullet.

Namespaced `component:` names (containing `:`) **don't** trigger validation #1 — they pass through unchanged.

### Test fixtures

Five `makeActionsForm` unit tests are spelled out in design.md's "Verification" section. Mirror part 12's test structure ([makeActionPages.test.js](../../../../modules/workflows/resolvers/makeActionPages.test.js)): import the resolver, declare a few hand-rolled fixture forms inline, drive the resolver, assert on the output shape.

Required cases:

- **Flat form composes.** A `[{ component: text_input, key: contact_name, required: true }]` input emits a substituted `TextInput` block with the right id/required wired through.
- **Nested form section.** A `[{ component: controlled_list, key: form.devices, form: [{ component: label_value, key: form.devices.$._id }] }]` input — note the author's `form:` key on `controlled_list` — composes correctly. The resolver renames `form:` → `blocks:` on the `controlled_list` entry before substitution; the inner `label_value` is substituted recursively.
- **Unknown bare component fails.** A `[{ component: not_a_real_component, key: foo }]` input throws with the precise message and includes the offending name.
- **Namespaced component passes through.** A `[{ component: my-plugin:device_selector, key: device }]` input survives unchanged in the output array — the resolver does not look up a library file or fail.
- **Required vars missing fails.** A `[{ component: text_input }]` input (no `key:`) throws with the precise message naming the missing var.

## Task

Create two files:

### `modules/workflows/resolvers/makeActionsForm.js`

ES-module JS following the pattern from [makeActionPages.js](../../../../modules/workflows/resolvers/makeActionPages.js) and [makeWorkflowsConfig.js](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js):

- Default-export the resolver function.
- Single module-scoped Map cache for loaded library files.
- A `fail(message)` helper that throws with a `'makeActionsForm: '` prefix (mirror part 12's `fail()`).
- Constants at module top: `STRUCTURAL_COMPONENTS = ['controlled_list', 'section', 'box', 'label', 'file_upload']` and `FIELDS_DIR = path.resolve(import.meta.dirname, '../components/fields')`.

Suggested top-level shape:

```js
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

const STRUCTURAL_COMPONENTS = [
  "controlled_list",
  "section",
  "box",
  "label",
  "file_upload",
];
const FIELDS_DIR = path.resolve(import.meta.dirname, "../components/fields");
const componentCache = new Map();

function fail(message) {
  throw new Error(`makeActionsForm: ${message}`);
}

function loadComponent(name) {
  /* fs.readFileSync + js-yaml.load, cached */
}

function isNamespaced(component) {
  return typeof component === "string" && component.includes(":");
}

function substituteEntry(entry) {
  /* the per-entry switch from "Substitution algorithm" */
}

function walk(formArray) {
  return (formArray ?? []).map(substituteEntry);
}

function checkIdCollisions(substitutedTree) {
  /* recursive id-collection + duplicate detection */
}

function makeActionsForm(_, vars) {
  const substituted = walk(vars.form);
  checkIdCollisions(substituted);
  return substituted;
}

export default makeActionsForm;
```

The two non-obvious bits worth thinking through during implementation:

1. **Where the sub-form rename happens.** Inside `substituteEntry` for entries whose `component` is in `STRUCTURAL_COMPONENTS`: pluck `entry.form`, recurse, then pass the substituted result into the merge context under the `blocks` key (not `form`). The original entry's `form:` key is discarded after rename.

2. **The merge itself.** Per the substitution-algorithm note, the resolver does not manually substitute `_var:` operators — it returns the library file's `config:` subtree as a Lowdefy `_ref` payload with the author's vars attached. Concrete pattern (mirrors how part 12's emitted shells use `_ref` with vars):

   ```js
   return {
     _ref: {
       path: `components/fields/${component}.yaml`,
       vars: { ...authorVars, blocks: substitutedSubForm /* if structural */ },
     },
   };
   ```

   Caveat: confirm against Lowdefy's `_ref` semantics — if `_ref` at this site doesn't resolve `_var:` consumers inside the referenced `config:` subtree the way it would at manifest-include time, the resolver has to manually walk the library `config:` tree and substitute. Verify with a single test fixture before committing.

### `modules/workflows/resolvers/makeActionsForm.test.js`

Jest spec (the repo uses Jest per `package.json`'s `"test": "jest"` and the existing [makeWorkflowsConfig.test.js](../../../../modules/workflows/resolvers/makeWorkflowsConfig.test.js) / [makeActionPages.test.js](../../../../modules/workflows/resolvers/makeActionPages.test.js)). Use the same test style — `test('description', () => { ... })`, plain assertions via `expect`. Five required cases (see "Test fixtures" above).

## Acceptance Criteria

- `modules/workflows/resolvers/makeActionsForm.js` exists with the default-exported resolver function.
- The resolver reads `vars.form` (an array) and returns a substituted Lowdefy block-tree array.
- Empty / missing `vars.form` returns `[]` without throwing.
- Bare component names without a matching `components/fields/<name>.yaml` file fail the build with the precise message.
- Namespaced component names (containing `:`) pass through unchanged.
- The sub-form `form:` → `blocks:` rename runs on entries whose `component:` is in `['controlled_list', 'section', 'box', 'label', 'file_upload']`.
- Required-vars missing fail the build with the precise message naming the var.
- Block-id collisions inside the substituted tree fail the build with the offending ids and component names.
- `modules/workflows/resolvers/makeActionsForm.test.js` exists with the five required test cases passing under `pnpm test` (or `jest` directly).
- No new top-level dependencies beyond what's already in `package.json` (`js-yaml` should already be there from the part-4 / part-12 work — confirm before assuming).

## Files

- `modules/workflows/resolvers/makeActionsForm.js` — create — the resolver.
- `modules/workflows/resolvers/makeActionsForm.test.js` — create — the Jest spec.

## Notes

- **Don't touch the library files.** The `form:` → `blocks:` rename lives entirely in this resolver per finding #1 in [review-1.md](../review/review-1.md). The library YAML stays as the implementation truth; the spec's `form:` vocabulary stays as the authoring truth. Verified by [controlled_list.yaml:23-25](../../../../modules/workflows/components/fields/controlled_list.yaml) declaring `blocks:`.

- **No `form_error` defaulting.** Per the design's "No `form_error` defaulting" bullet, this resolver does not synthesize an absent `form_error:` from `form:`. The caller passes whatever slice it has; the resolver walks it as-is. Templates handle the absent case by defaulting to `[]`.

- **Recursion is JS-internal only.** This task ships the JS walker. The walker handles structural components with nested `form:` arrays by recursing into itself — plain JavaScript, independent of where the resolver is invoked from. Part 16 owns the template-scope `_ref: { resolver }` invocation.

- **No write to library `vars:` declarations.** The resolver only reads `required: true` to validate; it does not enforce `type:` or reject unknown vars (per finding #6's required-only decision in [review-1.md](../review/review-1.md)).

- **Per-action keying is a downstream concern.** This resolver receives one `form:` array slice at a time; it knows nothing about `action_type` or keyed actions. That part lives in `makeActionFormConfigs` (task 2).
