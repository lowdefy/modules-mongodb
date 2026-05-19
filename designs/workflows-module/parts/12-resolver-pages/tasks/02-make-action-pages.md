# Task 2: Write the `makeActionPages` resolver

## Context

`makeActionPages` is a Lowdefy `_ref` resolver that emits per-action page YAML at build time. It runs once per build, consumes the host app's `workflows_config` array plus the host's `app_name`, and returns an array of `{ id, definition }` page objects that the module-loading layer (part 2) merges into the app's page tree.

The resolver is invoked from `module.lowdefy.yaml` (task 3 wires this); for now you can drive it from a unit-test harness.

### Inputs the resolver receives

Lowdefy passes resolver vars as the second argument: `function makeActionPages(_, vars)`. The vars shape:

```js
{
  workflows: WorkflowYaml[],   // raw, with _ref already expanded by the framework
  app_name: string,            // host app's deployment name
}
```

The framework expands all nested `_ref`s in `vars.workflows` before the resolver runs (see `parts/04-workflow-config-schema/tasks/02-make-workflows-config.md` line 18 for the same pattern in part 4). The resolver sees a plain JS array of workflow objects.

### Input contract — design clarification

Part 12's design.md describes "two inputs" (normalized config from part 4 + raw `workflows_config` YAML). In practice **the resolver only needs raw YAML.** Part 4's normalized output is for the **engine** to read at runtime via the workflow-api connection — it's not load-bearing for page emission. At build time the resolver has the full YAML available and just plucks fields directly. The merge described in design.md:27 is a description of *which fields end up on the emitted page's `action_config` var*, not a runtime composition of two resolver outputs.

So: read engine-runtime fields (`type`, `kind`, `key`, `tracker`, `blocked_by`, `action_group`, `sort_order`, `required_after_close`, `access`, `status_map`) and build-time-only fields (`pages`, `form`, `form_review`, `form_error`, `hooks`, `interactions`, `event`) **from the same raw YAML object**.

### What the resolver emits

For each form action in each workflow, emit up to four pages — one per verb in `[edit, view, review, error]` — gated by the action's `access.{app_name}` verb list. The `error` verb has no extra opt-in beyond being in the access list (a recent simplification — see design.md:23). Tracker actions emit nothing. Task actions emit nothing (shared `task-*` pages handle them via part 17).

Each emitted page is a thin shell that `_ref`s the matching template at `templates/{verb}.yaml.njk` with these vars:

- `action_config` — a flat object merging engine-runtime fields with the verb-specific build-time fields. Specifically: `{ type, kind, key, tracker, blocked_by, action_group, sort_order, required_after_close, access, status_map, pages: action.pages, form: action.form, form_review: action.form_review, form_error: action.form_error, hooks: action.hooks, interactions: action.interactions, event: action.event }`.
- `workflow_type` — the workflow's `type` field.
- `entity_collection` — the workflow's `entity_collection` field (per part 21, this replaces the old `entity_type` scalar). Workflows missing `entity_collection` should fail loudly via part 4 / part 21's validation, not in this resolver.
- `page_ids` — a map from emitted verb to its full page id. **Only verbs actually emitted for this action have keys.** E.g. an action emitting only `-edit` and `-view` produces `page_ids: { edit: "{workflow_type}-{action_type}-edit", view: "{workflow_type}-{action_type}-view" }`. Templates guard sibling references with `_if page_ids.review is defined`.
- `maxWidth` and any other chrome knobs from `action.pages.{verb}` pass through verbatim (use object spread or a whitelist of well-known chrome keys — see "Chrome pass-through" below).

The shell carries **context only** — page-level `events.onInit`, `requests:`, and the `get_action` request `_ref` live inside the template (part 16), not the shell. Don't bake request ids into the emitted YAML.

### Page id format

`{workflow_type}-{action_type}-{verb}`. Example: workflow `onboarding`, action `qualify`, verb `edit` → page id `onboarding-qualify-edit`. The module-loading layer (part 2) automatically scopes this under the module entry id, so the final URL becomes `/{module-entry-id}/onboarding-qualify-edit`.

### Emitted page shape

Each entry in the returned array:

```js
{
  id: 'onboarding-qualify-edit',
  definition: {
    _ref: {
      path: 'templates/edit.yaml.njk',   // module-relative — Lowdefy resolves against the module's tree
      vars: {
        action_config: { /* see above */ },
        workflow_type: 'onboarding',
        entity_collection: 'leads-collection',
        page_ids: { edit: 'onboarding-qualify-edit', view: 'onboarding-qualify-view' },
        maxWidth: 1200,   // if action.pages.edit.maxWidth is set; omit otherwise
      },
    },
  },
}
```

### Build-time validation

Fail the build (throw with a precise path-prefixed message) when:

1. **`vars.app_name` is missing, `null`, or `""`.** Message: `makeActionPages: vars.app_name is required and must be non-empty (got: <value>).` Part 20's manifest already marks `app_name` as required; this check is defense in depth for value-level falsiness.

That's the only assert. No template-existence check (Lowdefy surfaces missing `_ref` paths on its own) and no page-id-collision check (the `{workflow_type}-{action_type}-{verb}` shape prevents collisions structurally).

### Chrome pass-through

`action.pages.{verb}` can carry author-supplied chrome (`title`, `requests`, `events`, `formHeader`, `formFooter`, `modals`, `maxWidth`, and for `error`: `buttons.submit.{title, modal}`). The template owns rendering these; the shell just forwards them. Spread the entire `action.pages.{verb}` object into the vars under a `pages_verb` key — or, equivalently, into `action_config.pages.{verb}` if you prefer keeping all per-verb chrome together. Either works as long as the template can find it; pick the shape that reads cleanest in the test fixtures. (Recommended: pass `action.pages.{verb}` through verbatim as a top-level `chrome` var — easier for templates to consume than digging through `action_config.pages`.)

## Task

Create two files:

### `modules/workflows/resolvers/makeActionPages.js`

Plain ES-module JS following the pattern from `modules/workflows/resolvers/makeWorkflowsConfig.js`. Suggested skeleton:

```js
const VERBS = ['edit', 'view', 'review', 'error'];

const ACTION_FIELDS_FOR_TEMPLATE = [
  'type', 'kind', 'key', 'tracker', 'blocked_by',
  'action_group', 'sort_order', 'required_after_close',
  'access', 'status_map',
  'pages', 'form', 'form_review', 'form_error',
  'hooks', 'interactions', 'event',
];

function fail(message) {
  throw new Error(`makeActionPages: ${message}`);
}

function pickActionConfig(action) {
  const picked = {};
  for (const key of ACTION_FIELDS_FOR_TEMPLATE) {
    if (key in action) picked[key] = action[key];
  }
  return picked;
}

function emitForAction(workflow, action, appName) {
  if (action.kind !== 'form') return [];

  const accessVerbs = action.access?.[appName] ?? [];
  const emittedVerbs = VERBS.filter((v) => accessVerbs.includes(v));
  if (emittedVerbs.length === 0) return [];

  const pageIds = Object.fromEntries(
    emittedVerbs.map((v) => [v, `${workflow.type}-${action.type}-${v}`])
  );

  const actionConfig = pickActionConfig(action);

  return emittedVerbs.map((verb) => ({
    id: pageIds[verb],
    definition: {
      _ref: {
        path: `templates/${verb}.yaml.njk`,
        vars: {
          action_config: actionConfig,
          workflow_type: workflow.type,
          entity_collection: workflow.entity_collection,
          page_ids: pageIds,
          chrome: action.pages?.[verb] ?? {},
        },
      },
    },
  }));
}

function makeActionPages(_, vars) {
  const { workflows, app_name: appName } = vars;

  if (!appName) {
    fail(`vars.app_name is required and must be non-empty (got: ${JSON.stringify(appName)}).`);
  }

  const pages = [];
  for (const workflow of workflows) {
    for (const action of workflow.actions ?? []) {
      pages.push(...emitForAction(workflow, action, appName));
    }
  }

  return pages;
}

export default makeActionPages;
```

Refine signatures, error messages, and the chrome-passthrough shape to match what the test fixture expects. Add JSDoc only if it pulls weight.

### `modules/workflows/resolvers/makeActionPages.test.js`

Self-contained test spec using Node's built-in test runner (no new test framework dependency). Use `node --test modules/workflows/resolvers/makeActionPages.test.js` to run.

The fixture is the worked-example onboarding workflow from `designs/workflows-module-concept/design.md` — four actions (`qualify`, `send-quote`, `schedule-followup`, `track-installation`) — but **inline the fixture in the test file** rather than depending on a separate YAML file. Tests live next to the resolver, fixtures live next to the tests.

Required test cases (mirrors design.md:63–68):

1. **`qualify` (form, `access: { my-team-app: [view, edit] }`) emits exactly `-edit` and `-view`.** Assert exactly two pages, ids `onboarding-qualify-edit` and `onboarding-qualify-view`, no others for this action.
2. **`error` verb gating mirrors the other verbs.** Adding `error` to `access.my-team-app` emits `onboarding-qualify-error`. Removing it does not. **No `pages.error` block required** (this is the post-design-change simplification — see design.md:23).
3. **`send-quote` (form, `access: { my-team-app: [view, edit, review] }`) emits `-edit`, `-view`, `-review`.** Three pages, no `-error`.
4. **`schedule-followup` (task) emits nothing**, even with `access: { my-team-app: [view, edit] }`.
5. **`track-installation` (tracker) emits nothing**, even with `access: { my-team-app: [view, edit, review] }` (tracker overrides verb list).
6. **`action_config` carries both normalized and build-time fields.** Assert that on an emitted page, `vars.action_config.access`, `vars.action_config.status_map`, *and* `vars.action_config.form` are all present.
7. **`page_ids` only contains emitted verbs.** For `qualify` emitting `-edit/-view` only, assert `Object.keys(vars.page_ids).sort()` deep-equals `['edit', 'view']` — no `review` or `error` key.
8. **`vars.app_name` validation.** Calling the resolver with `app_name: undefined`, `null`, and `""` all throw with a message matching `/app_name is required/`.

Use `node:test`'s `describe` / `it` / `assert.deepStrictEqual` / `assert.throws`. Keep the fixture inline as a JS literal — copy the minimum subset of the worked example needed to make each assertion meaningful.

## Acceptance Criteria

- `node --test modules/workflows/resolvers/makeActionPages.test.js` exits 0 with all 8 test cases passing.
- The resolver passes lint (matching whatever ESLint config `modules/workflows/resolvers/makeWorkflowsConfig.js` passes).
- `makeActionPages.js` is importable as ES module: `import makeActionPages from './makeActionPages.js'` works.
- Running the resolver against the worked-example fixture from `designs/workflows-module-concept/design.md` produces exactly the expected page set (six pages: `onboarding-qualify-edit/view`, `onboarding-send-quote-edit/view/review`, `onboarding-qualify-edit` per the verb-gating math).
- Each error message includes the `makeActionPages:` prefix and is precise enough to debug from build output alone.

## Files

- `modules/workflows/resolvers/makeActionPages.js` — create
- `modules/workflows/resolvers/makeActionPages.test.js` — create

## Notes

- **No new dependencies.** `node:test`, `node:assert`, `node:fs`, `node:path`, `node:url` are all built-in. No vitest / jest / mocha install.
- **Don't validate the workflow YAML itself.** Part 4's `makeWorkflowsConfig` does all workflow-config validation. The resolver assumes its input is well-formed and only adds its own resolver-specific checks (app_name presence, template existence, id collisions). If a malformed workflow YAML reaches this resolver, that's part 4's bug.
- **Per part 21**, the resolver passes `entity_collection` as a template var, not `entity_type`. If you find `entity_type` references anywhere, those are stale — part 21 owns the cleanup.
- The chrome pass-through shape (top-level `chrome` var vs. nested in `action_config.pages.{verb}`) is yours to pick — whichever reads cleaner against the placeholder templates and the part-16 contract. Just document the choice in a one-line code comment.
- **Don't add an "engine-runtime fields" vs "build-time fields" split internally.** Both come from the same raw YAML object. The split described in design.md:27 is about which fields end up *exposed to templates*, not about input plumbing.
