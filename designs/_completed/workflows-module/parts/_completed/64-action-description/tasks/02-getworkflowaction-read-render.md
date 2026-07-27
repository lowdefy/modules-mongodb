# Task 2: Engine — GetWorkflowAction renders the authored `description` at read time

## Context

After Task 1, the runtime workflows config carries the authored `description` markdown string on each `actionConfig` (alongside `required_after_close`). This task makes the detail-page read method return it.

`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` builds a curated envelope for the action detail/check pages. Today its `description` key is sourced from the **action doc** (`action.description ?? null`, line ~257) — the deleted editable field. Part 64 flips the source to the **rendered authored config field**: `actionConfig.description`, nunjucks-templated at read time.

Key design decisions (from the contract and "Why read-time render"):

- **Read-time render, never write-time.** `description` is config with no transition that would re-render it; rendering on every read sidesteps staleness entirely. (Contrast `message`, which the envelope still reads pre-materialised from `action[app_name].message`.)
- **Render primitive:** the shared `parseNunjucks(string, vars)` (`../../shared/render/parseNunjucks.js`) — the same primitive `renderStatusMap` reaches through `renderTree`. `renderStatusMap` itself is **not** the entry point (its signature is `{ cell, plannedActionDoc, mergedMetadata }` and it renders cells, not a lone string).
- **Render context shape:** the same shape `renderStatusMap` builds for its ctx — `{ ...action, ...(action.metadata ?? {}) }`. This makes `{{ key }}` and reference fields interpolate for instanced actions.
- **Autoescaping is on** (`parseNunjucks` builds via `nunjucksFunction`, which escapes by default) — leave it on. Interpolated scalars containing `&`/`<`/`>` become HTML entities that round-trip safely through the client `Markdown` block. Do **not** add a `| safe` filter.
- The envelope key stays named `description`, so every client binding (`current_action.description`, `action.description`) is unchanged in name — only the source flips.

`actionConfig` is already resolved in the handler (line ~156, used for `required_after_close`, `allow_not_required`, `form_meta`). `action` (the loaded doc) and `action.metadata` are in scope.

## Task

In `GetWorkflowAction.js`:

1. Import the render primitive at the top: `import parseNunjucks from "../../shared/render/parseNunjucks.js";`. (The handler imports neither `parseNunjucks` nor `renderStatusMap` today — this is a genuinely new import + render step.)
2. Build the render context and rendered string near where the other display fields are computed (the block around `const message = …` / `const required_after_close = …`, line ~244):
   ```js
   const descriptionCtx = { ...action, ...(action.metadata ?? {}) };
   const description =
     actionConfig.description != null
       ? parseNunjucks(actionConfig.description, descriptionCtx)
       : null;
   ```
3. In the returned envelope object, change the `description` line from `description: action.description ?? null,` to `description,` (use the rendered local). Return `null` when `actionConfig.description` is unset.
4. Update the JSDoc envelope-shape comment block at the top of the file if it characterises `description` as a doc field — it should read as the rendered authored config body.

**Tests** — `GetWorkflowAction.test.js`:

5. Update any existing assertion that expects `description` to come from the action doc.
6. Add an assertion that `description` is sourced from config and **renders templates**: e.g. an `actionConfig.description` of `"Reference: {{ key }}."` with an action doc `key: "ABC"` yields envelope `description: "Reference: ABC."`; and that an action whose config has no `description` returns `description: null`. Follow the existing test's harness for stubbing `workflowsConfig` / the action doc.

## Acceptance Criteria

- `GetWorkflowAction.js` imports `parseNunjucks` and no longer reads `action.description`.
- The envelope `description` is `parseNunjucks(actionConfig.description, { ...action, ...(action.metadata ?? {}) })` when `actionConfig.description != null`, else `null`.
- No `| safe` filter is introduced; autoescaping stays on (default).
- `GetWorkflowAction.test.js` asserts config-sourced, template-rendered `description` and the `null`-when-unset case; `pnpm test` passes for that file (`npx jest GetWorkflowAction`).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — modify — import `parseNunjucks`; render `actionConfig.description` at read time; return it as the envelope `description`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.test.js` — modify — assert config-sourced, templated `description`; drop doc-sourced expectations.

## Notes

- Depends on Task 1: without `description` in `ACTION_FIELDS`, `actionConfig.description` is always undefined and the envelope would always return `null`.
- The render context deliberately mirrors `renderStatusMap`'s ctx so authored templates behave identically to status-map cell templates.
