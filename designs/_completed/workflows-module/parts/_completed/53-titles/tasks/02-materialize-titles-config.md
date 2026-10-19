# Task 2: Materialize titles in `makeWorkflowsConfig`

## Context

`modules/workflows/resolvers/makeWorkflowsConfig.js` is the build-time resolver that validates each workflow's YAML and projects it into the runtime `workflowsConfig` consumed by the WorkflowAPI connection. This task makes it resolve and write a guaranteed-present `title` for the workflow, each action, and each group — so every config-reading surface (overview/entity-workflows resolvers, action-page generation) just reads `title` with no runtime fallback. This is the design's "one correct way": default the title once at build, not at each read site.

Current relevant structure (`makeWorkflowsConfig.js`):

- `ACTION_FIELDS` (line 16) — the list of action fields picked onto the runtime action config. **`title` is not in it.**
- `WORKFLOW_FIELDS` (line 28) — includes `'title'` already, but the field is only carried through if the author set it; there is no default.
- `pick(source, fields)` (line 96) — copies present fields.
- `makeWorkflowsConfig(_, vars)` (line 630) — destructures `{ workflows }` from `vars`, maps each workflow: validates, builds `actions` via `pick(action, ACTION_FIELDS)` (+ `allow_not_required` default + `form_meta`), and returns `{ ...pick(workflow, WORKFLOW_FIELDS), actions }`. `action_groups` is copied verbatim by `pick` — there is **no group normalization** today.

The acronym set comes from a new `vars.title_acronyms` (an array, wired in task 4); read it here with a default of `[]` and merge it into the helper's base set.

## Task

Resolution rule for every title: **explicit `title` wins; else derive via `humanizeSlug`; materialized at build.**

1. **Import the helper** from task 1: `import { humanizeSlug } from './humanizeSlug.js';` (match the export style chosen in task 1).

2. **Read and merge acronyms.** In `makeWorkflowsConfig(_, vars)`, read `const { workflows, title_acronyms = [] } = vars;`. Pass `title_acronyms` into every `humanizeSlug(slug, title_acronyms)` call so build-time defaulting uses the merged set.

3. **Workflow title default.** When projecting the workflow output, set `title` to `workflow.title ?? humanizeSlug(workflow.type, title_acronyms)`. (`WORKFLOW_FIELDS` already lists `title`; the explicit assignment must override the picked value when absent — e.g. build the output object then set `.title`.)

4. **Action title default.** Add `'title'` to `ACTION_FIELDS` so an explicit action `title` is carried through, then default it: after `pick(action, ACTION_FIELDS)`, set `picked.title = action.title ?? humanizeSlug(action.type, title_acronyms)`.

5. **Group title default (group normalization).** `action_groups` is currently copied verbatim. Replace that with a normalization step: map each group to `{ ...group, title: group.title ?? humanizeSlug(group.id, title_acronyms) }`. Precedence is the design's **2-tier rule at the resolver: `group.title ?? humanizeSlug(group.id)`** — the resolver cannot (and need not) distinguish an enum-supplied title from an author override; both arrive inline as `group.title` because the shared `enums/action_groups.yaml` is `_ref`'d into the workflow YAML upstream. A group with neither gets the derived label. Make sure the normalized `action_groups` array lands on the workflow output (don't let the plain `pick` overwrite it).

6. **Validate `title` is a string when present.** In the validators, hard-error (via `fail(workflow.type, ...)`) if a workflow `title`, action `title`, or group `title` is present but not a string. Put the action check in `validateAction`, the group check alongside `validateGroupOnComplete` (or in the group loop), and the workflow check in `validateWorkflow`. Match the existing error-message style (`action "${action.type}" title must be a string ...`).

## Acceptance Criteria

- The runtime config returned by `makeWorkflowsConfig` carries a non-empty string `title` on every workflow, every action, and every group — derived from the slug when not explicitly authored.
- An explicit `title:` on a workflow / action / group is preserved verbatim (override wins).
- A group with neither an enum-supplied nor author `title` gets `humanizeSlug(id)`.
- A non-string `title` (e.g. a number or object) on any of the three throws a clear build error.
- `title_acronyms` from `vars` is merged into the humanizer for all three defaults; absent, it defaults to `[]` and the base set is used.
- `makeWorkflowsConfig.test.js` is extended to cover: derived workflow/action/group titles, explicit-override precedence, the group 2-tier rule, acronym merge, and the non-string validation errors. Tests pass.

## Files

- `modules/workflows/resolvers/makeWorkflowsConfig.js` — modify — import `humanizeSlug`; read+merge `title_acronyms`; add `'title'` to `ACTION_FIELDS`; default workflow/action/group titles; normalize `action_groups`; validate `title` is a string.
- `modules/workflows/resolvers/makeWorkflowsConfig.test.js` — modify — add coverage for the above.

## Notes

- `WORKFLOW_FIELDS` already contains `'title'`; do **not** remove it. The default just fills the gap when the author omits it.
- Don't touch `status_map`, lifecycle, or status enum titles — those are curated and out of scope (design non-goals).
- The runtime denormalization of these titles onto persisted docs is task 5; this task only writes them onto the in-memory `workflowsConfig`.
