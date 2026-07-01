# Task 10: Rewrite `_global:` consumer sites to use component refs

## Context

After task 9, the workflows module has no `global:` block — `action_form_configs` is declared as a component, and the two enums (`action_statuses`, `workflow_lifecycle_stages`) were already components on disk. But the shipped pages still consume those names via `_global: <name>` syntax, which reads from the runtime global state register and will get `undefined` after task 9 deletes the `global:` block.

This task rewrites every `_global:` read site inside the workflows module to use the build-time component ref idiom (`_ref: { module: workflows, component: <id> }`). The touched files are owned by parts 17 / 18 / 25; per repo convention ("[Review changes touching implemented parts](memory:feedback_review_implemented_parts.md)"), the small follow-up change folds into 20a rather than spinning out a new part.

### Call-site shapes on disk

Two distinct patterns are in use today.

**Pattern 1 — `_js` param.** Pass the full enum object as a static param into a `_js` block; the JS does the indexing. Example at `pages/task-edit.yaml:146`:

```yaml
options:
  _js:
    params:
      - _global: action_statuses
      - _request: get_action.status.0.stage
    body: |
      const [statuses, currentStage] = params;
      ...
```

This is a clean drop-in: `_global: action_statuses` → `_ref: { module: workflows, component: action_statuses }`. The component ref resolves at build time to the merged enum object (`_build.object.assign` of the shipped enum + the display-overrides var); the `_js` block doesn't care which operator produced its param.

**Pattern 2 — `_global` with `_string.concat` building a runtime key.** Indexed access where the index isn't known until render time. Example at `pages/task-view.yaml:72–95`:

```yaml
color:
  _global:
    _string.concat:
      - action_statuses.
      - _request: get_action.status.0.stage
      - .color
```

This pattern reads `action_statuses.<runtime-stage>.color` from the global register at render time. A direct `_ref: { module: workflows, component: action_statuses }` swap doesn't work — the build-time ref returns the whole object, not an indexed field. Rewrite each such site to **pattern 1** (`_js` block with the full enum as a param + the runtime key as a second param; the `_js` body does the indexing).

## Task

For every `_global:` site listed below, apply the matching rewrite.

### Pattern 1 sites (clean swap)

| File                                     | Line | Current                      | New                                                         |
| ---------------------------------------- | ---- | ---------------------------- | ----------------------------------------------------------- |
| `modules/workflows/pages/task-edit.yaml` | 146  | `- _global: action_statuses` | `- _ref: { module: workflows, component: action_statuses }` |

### Pattern 2 sites (rewrite to `_js`-with-params)

For each site, replace the `_global: { _string.concat: [<enum-name>., <runtime-key>, .<field>] }` operator with a `_js` block:

```yaml
_js:
  params:
    - _ref: { module: workflows, component: <enum-name> }
    - <runtime-key-operator> # e.g. _request: get_action.status.0.stage
  body: |
    const [enumObj, key] = params;
    return enumObj?.[key]?.<field>;
```

The exact `<runtime-key-operator>` varies by site (see existing `_string.concat` content for the operator). Preserve the original `<field>` name (e.g. `.color`, `.titleColor`, `.borderColor`, `.message`, `.title`).

Sites to rewrite:

| File                                                | Lines | Enum name                   | Field(s) read                                   |
| --------------------------------------------------- | ----- | --------------------------- | ----------------------------------------------- |
| `modules/workflows/pages/task-view.yaml`            | 74    | `action_statuses`           | `.color`                                        |
| `modules/workflows/pages/task-view.yaml`            | 81    | `action_statuses`           | `.titleColor`                                   |
| `modules/workflows/pages/task-view.yaml`            | 87    | `action_statuses`           | `.borderColor`                                  |
| `modules/workflows/pages/task-view.yaml`            | 93    | `action_statuses`           | (read context — re-check during implementation) |
| `modules/workflows/pages/task-view.yaml`            | 137   | `action_statuses`           | (re-check)                                      |
| `modules/workflows/pages/task-view.yaml`            | 143   | `action_statuses`           | (re-check)                                      |
| `modules/workflows/pages/task-review.yaml`          | 109   | `action_statuses`           | (re-check)                                      |
| `modules/workflows/pages/task-review.yaml`          | 115   | `action_statuses`           | (re-check)                                      |
| `modules/workflows/pages/workflow-overview.yaml`    | 131   | `action_statuses`           | (re-check)                                      |
| `modules/workflows/pages/workflow-overview.yaml`    | 137   | `action_statuses`           | (re-check)                                      |
| `modules/workflows/pages/workflow-overview.yaml`    | 244   | `action_form_configs`       | (re-check — likely `.form` or `.form_review`)   |
| `modules/workflows/pages/workflow-overview.yaml`    | 249   | `action_form_configs`       | (re-check)                                      |
| `modules/workflows/pages/group-overview.yaml`       | 243   | `action_statuses`           | (re-check)                                      |
| `modules/workflows/pages/group-overview.yaml`       | 249   | `action_statuses`           | (re-check)                                      |
| `modules/workflows/pages/group-overview.yaml`       | 356   | `action_form_configs`       | (re-check)                                      |
| `modules/workflows/pages/group-overview.yaml`       | 361   | `action_form_configs`       | (re-check)                                      |
| `modules/workflows/components/workflow-header.yaml` | 80    | `workflow_lifecycle_stages` | (re-check)                                      |
| `modules/workflows/components/workflow-header.yaml` | 86    | `workflow_lifecycle_stages` | (re-check)                                      |

Verify each site's exact `_string.concat` shape during implementation — the line numbers are anchors, not contracts (file edits during task 9 may shift them).

### Stale comment cleanup

`modules/workflows/pages/group-overview.yaml` line 13 carries a header comment listing dependencies, including `#   - global.action_form_configs                 (part 15)`. Rewrite that line to drop the `global.` prefix:

```
#   - component action_form_configs              (part 15)
```

Check the other shared pages (`task-edit`, `task-view`, `task-review`, `workflow-overview`) for similar header-comment references and rewrite consistently.

## Acceptance Criteria

- `git grep -n "_global:" modules/workflows/` returns no matches inside `pages/` or `components/`. (A `_global:` ref outside the workflows module — e.g. in an app's own pages — is fine and out of scope.)
- Every rewritten site renders the same field value at runtime as before. Smoke-check by running the demo (task 6 onward must be in place) and visiting `lead-view`, `workflow-overview`, `group-overview` — the action status badges, lifecycle badge, and form_data data-view all render with the same colors / labels / form fields as before.
- The pattern-1 swap on `task-edit.yaml:146` passes the status-selector smoke test: the status selector still lists filtered options correctly given the action's current stage.
- No stale `# global.` references in page header comments.
- `apps/demo` build succeeds after this task lands.
- Playwright spec from task 8 still passes against the rewritten pages.

## Files

- `modules/workflows/pages/task-edit.yaml` — **modify** (1 site)
- `modules/workflows/pages/task-view.yaml` — **modify** (6 sites)
- `modules/workflows/pages/task-review.yaml` — **modify** (2 sites)
- `modules/workflows/pages/workflow-overview.yaml` — **modify** (4 sites + header comment)
- `modules/workflows/pages/group-overview.yaml` — **modify** (4 sites + header comment line 13)
- `modules/workflows/components/workflow-header.yaml` — **modify** (2 sites)

## Notes

- Task 9 must land first (the manifest declares `action_form_configs` as a component, which is what task 10 references).
- Pair task 9 and task 10 in the same PR if at all possible — the intermediate state (manifest moved, consumers not yet rewritten) produces a working build but a broken runtime (`_global: action_statuses` returns `undefined`, status badges and the like collapse).
- The `_js`-with-params rewrite for pattern-2 sites changes the operator stack from one runtime op (`_global` with `_string.concat`) to one runtime op (`_js`). Performance impact is negligible (Lowdefy's `_js` is V8 / Node; the body is a single lookup); readability arguably improves since the indexing is explicit.
- For pattern-2 sites that read multiple fields off the same enum entry (e.g. `task-view.yaml` lines 74/81/87/93 all read `action_statuses[stage].{color,titleColor,borderColor,content}`), consider authoring a single shared `_state` initialiser via `onMount` `SetState` that captures the resolved enum entry once, e.g. `_state.status_display = enum[currentStage]`. The four downstream reads then become `_state: status_display.color` etc. If easier than four `_js` rewrites, prefer it — leaves the call sites cleaner. This is the same outcome the original `_global` runtime indexing achieved; the difference is that the materialised state value is fed by a build-time component ref instead of by an app-side global wiring.
- Update each page's design-md cross-reference if any explicitly mentions `_global:`. Searches to run after the rewrite: `git grep -n "_global: action_" designs/workflows-module/parts/_completed/{17,18,25}/` — flag any narrative drift in completed-part designs but **do not edit the completed-part design files** (historical record).
- The `apps/demo` `.lowdefy/server/lowdefy-build/...` HTML build artefacts (`apps/demo/.lowdefy/server/lowdefy-build/tailwind/workflows%2F*.html`) carry stale `action_statuses.` / `workflow_lifecycle_stages.null.*` strings. These are build outputs, not source — they regenerate on the next `pnpm ldf:b` run. Don't hand-edit.
