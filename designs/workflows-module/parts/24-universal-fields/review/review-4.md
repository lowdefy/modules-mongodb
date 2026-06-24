# Review 4 — Revision 2 (current-state reconciliation) vs. the shipped engine

Revision 2 re-grounds the design on in-tree code after Parts 38/39/40/43/46/48/49 reshaped the
surfaces this part binds to. This review verifies the *new* Rev-2 claims against source; it does not
re-raise the Rev-1 findings the three prior reviews already closed.

Most of the re-grounding checks out and is worth recording as verified-sound:

- **Per-workflow endpoint shape** — `${workflow.type}-submit` is emitted per workflow type at
  `makeWorkflowApis.js:135` and `${workflow.type}-start` at `:174`, both dispatched by `action_id` /
  payload, exactly as the design's `{workflow_type}-update-fields` mirrors (design.md:104-106). ✓
- **`kind: check` coherence** — `ACTION_KINDS = ['form', 'check', 'tracker']`
  (`makeWorkflowsConfig.js:77`); every `kind: check` reference is live. ✓
- **`GetWorkflowAction` returns a single object** with an `allowed` per-verb map and a raw `assignees`
  id-array, no `assignee_docs` (`GetWorkflowAction.js:94-117`) — so the display bindings need no `.0.`
  and the `assignee_docs` amendment is a genuine, additive extension point. Rev-2's inversion of
  review-3 #5 is correct. ✓
- **`loadWorkflowState` discriminator / gate** — the helper keys submit on
  `actionId !== undefined && actionId !== null` (`loadWorkflowState.js:113`), `SIGNAL_VERBS` are arrays
  (`:17-24`, Part 49), and `gateAllows(actionConfig.access?.[currentApp]?.[verb], userRoles)` is the
  per-verb gate (`:217`, Part 34). The Rev-2 plan to split the discriminator on signal presence and
  gate a signal-less mode on the `edit` verb is sound. ✓
- **`commitPlan` / workflow-less plan** — `commitWorkflowAndActions` destructures `plan.workflow`
  unconditionally (`commitPlan.js:63`) and `buildCommitResult` reads `plan.workflow.doc._id` (`:157`),
  so a `workflow: null` plan throws today; the amendment is real. ✓
- **Part 48 event-overrides / Part 39 submit regex** — `planEventDispatch` takes
  `yamlEventOverrides` / `preHookEventOverrides` and merges via `mergeEventOverrides` (`:128-129,234`);
  the form-submit `Validate` is `^form\.` only (`edit.yaml.njk:305`) and the submit payload carries no
  `fields`. ✓
- **Check-surface endpoint concat** — the design's component snippet
  (`_string.concat: [{_module.id: true}, '/', <workflow_type>, '-update-fields']`) matches the shipped
  `-submit` precedent verbatim (`check-action-surface.yaml:337-342`, including the `_module.id` + `/`
  prefix). ✓

The findings below are the gaps that remain.

## Correctness

### 1. The kind-based guard, as specified, regresses cascade/auxiliary `fields` seeding on form-kind actions

> **Resolved.** Verified: `kickoff` is `kind: form` and the create-path spread seeds `description: 'spawned'` (`SubmitWorkflowAction.test.js`), so guarding both spreads on `kind: check` breaks it. Scoped the guard to the **update path (`:170`) only**; the **create/upsert path (`:162`) stays unconditional** (cascade/auxiliary seeding writes fields for any kind — it's initialization). Updated design.md ("Submit-planner guard" + `planActionTransition.js` Files-changed bullet) and task 06 (Context, steps 2–4, acceptance criteria, test cases). Added the `kickoff` upsert as the named regression guard.

This is the load-bearing finding. design.md:160 and :221 specify the submit-planner guard as:

> "the planner writes `assignees` / `due_date` / `description` only for `kind: check` … For `kind: form`
> the planner never touches them" — narrow "the generic, kind-agnostic `...payload.fields` passthrough
> (`:162,:170`)".

But `...payload.fields` serves a **second master** the design doesn't account for: engine-internal
action composition. The `actions:` upsert/activate path seeds field values onto **newly-created** action
docs of any kind, through the **create path's** spread (`planActionTransition.js:162`). This is proven
in-tree:

`SubmitWorkflowAction.test.js:557-572` spawns a `kickoff` action via a pre-hook
`actions: [{ type: 'kickoff', key: 'k1', signal: 'activate', upsert: true, fields: { description: 'spawned' } }]`
and asserts `expect(spawned.description).toBe('spawned')`. And `kickoff` is **`kind: 'form'`**
(`SubmitWorkflowAction.test.js:65-66`).

So gating the **whole** `...payload.fields` spread on `kind === 'check'` — at both `:162` and `:170` as
the design says — would stop writing `description` on that form-kind upserted action and **break this
existing test**. The cascade/auxiliary seed is initialization, not the form-submit clobber the
decoupling targets.

The two spreads are not the same scenario:

- **`:170` (update path)** — an *existing* action transitioned by a *user submit* (`action_id` +
  `signal`, `source: 'user'`). This is the only place form submit could clobber universal fields, and
  the only place the guard needs to fire.
- **`:162` (create path)** — an *upserted* action seeded by the cascade/auxiliary composition
  (`source: 'cascade' | 'auxiliary'`, `upsert: true`). Legitimately writes `fields` for any kind.

**Fix:** scope the guard to the user-submit update path only — gate the `:170` spread on
`kind === 'check'`, and leave the `:162` create-path spread unconditional (or key on
`source === 'user'`). Net effect: form submit on an existing action writes no universal fields; check
submit writes them as today; cascade/auxiliary seeding of any kind keeps working. Update design.md:160
and :221 to say "narrow the **update-path** spread", not "the spread at `:162,:170`", and add the
test above as the regression guard the implementer must keep green.

## Stale references

### 2. `DEFAULT_TITLES` does not exist; the event-title plumbing described doesn't match shipped `planEventDispatch`

> **Resolved (auto).** Confirmed no `DEFAULT_TITLES` map exists; titles flow through the `titleTemplate` if/else chain (`planEventDispatch.js:156-185`) over `LIFECYCLE_TITLES` / `DEFAULT_SIGNAL_TITLES` / `ACTION_FALLBACK_TITLE`. Reworded design.md (Plan bullet + `planEventDispatch` Files-changed bullet) and task 01 to describe adding an `UpdateActionFields` branch to that chain (not a map entry), reusing `ACTION_FALLBACK_TITLE` (`'{{ user.profile.name }} updated {{ action.title }}'`). Fixed task 01's title copy from `{{ action.type }}` to `{{ action.title }}`.

design.md:152 and :220 (and task 1) instruct the new handler type to add "a `DEFAULT_TITLES` entry".
There is **no `DEFAULT_TITLES` map anywhere in source** (verified: `grep -rn DEFAULT_TITLES
plugins/.../src modules` → none). The shipped title machinery in
`shared/phases/planners/planEventDispatch.js` is:

- `LIFECYCLE_TITLES` (workflow-started/cancelled/closed) and `DEFAULT_SIGNAL_TITLES` (action-signal
  titles), plus an `ACTION_FALLBACK_TITLE = '{{ user.profile.name }} updated {{ action.title }}'`
  (`:47-48`);
- a `titleTemplate` variable assigned inside an `if / else if` chain keyed on
  `handlerType` / signal (`:156-185`), **not** a map looked up by handler type.

So adding `UpdateActionFields` is not "a `DEFAULT_TITLES` entry" — it is a new
`else if (handlerType === 'UpdateActionFields')` branch in that chain that sets
`eventType = 'action-fields-updated'`, `isActionEvent = true`, and `titleTemplate = <literal>`.
Conveniently, `ACTION_FALLBACK_TITLE` is already exactly `'{{ user.profile.name }} updated
{{ action.title }}'` and can be reused.

Two sub-issues to fix while there:

- **Wrong title variable.** Task 1 step (`tasks/01-…:16`) suggests
  `'{{ user.profile.name }} updated {{ action.type }} details'`. Every shipped title interpolates
  `{{ action.title }}` (the human title), never `{{ action.type }}` (the slug, e.g. `qualify`). Use
  `{{ action.title }}`.
- Reword design.md:152/:220 and task 1's "branches … each mapping to … a default Nunjucks title
  template (`DEFAULT_TITLES`)" to describe the actual `titleTemplate` if/else chain.

### 3. `api/get-entity-workflows.yaml:62-71` citation is stale — the cell now comes from the `GetEntityWorkflows` handler

> **Resolved (auto).** Verified `GetEntityWorkflows.js:91` is the authoritative read (`const message = action[app_name]?.message ?? null`). Repointed design.md:36 from `api/get-entity-workflows.yaml:62-71` to `GetEntityWorkflows.js:91`. Conclusion (re-render the cell on the action doc, no workflow write) unchanged.

The "re-render the cell, write only the action doc" rationale is **correct** (re-verified): the entity
card sources the rendered cell from the action doc's top-level field. But design.md:36 still cites
`api/get-entity-workflows.yaml:62-71` as the proof. That read path moved to the Part-46 plugin handler,
the same shift Rev-2 applied to `get_action` → `GetWorkflowAction` but missed here:
`GetEntityWorkflows.js:91` is now the authoritative line — `const message = action[app_name]?.message ?? null`.
The YAML file still exists but is no longer the binding source.

**Fix:** repoint design.md:36 at `GetEntityWorkflows.js:91` (and the action-doc field
`action[app_name].message`). The conclusion is unchanged — re-rendering the cell on the action doc is
sufficient.

## Smaller things

### 4. "writes the three named fields" vs "written exactly as today" — pick one

> **Resolved.** Same edit as #1: design.md:160 now states the rule as gating the **existing** `...payload.fields` spread (stripping the three universal keys from the bag unless `kind: check`), not enumerating three named `$set`s — so a `check` submit keeps its full bag and the two phrasings no longer conflict. Task 06 already filtered only the three keys (other keys pass through verbatim); its wording was aligned to the update-path-only scope.

design.md:160 says both (a) "the planner writes `assignees` / `due_date` / `description` only for
`kind: check`" and (b) "Check submit is unaffected: its `fields` payload is written **exactly as
today**." (a) reads as enumerating three named `$set`s; (b) is the full `...payload.fields` bag. An
implementer could read (a) and replace the spread with three explicit assignments, silently dropping any
other key a caller passes in `payload.fields`. The clean implementation — which also resolves #1 — is to
gate the **existing spread** on kind/source (`...(kind === 'check' ? payload.fields : {})` on the update
path), preserving the full bag for check. State it that way so the two sentences stop disagreeing.

### 5. Re-anchor the remaining `loadWorkflowState` line numbers

> **Resolved.** Re-verified against source: the submit discriminator is at `loadWorkflowState.js:110` (matching design.md, *not* `:113` as this finding claimed — left unchanged). The `:43-46` invariant ref had genuinely drifted (those lines are now the `gateAllows` helper body); repointed design.md:154 to the actual access-gate site `:216-219` (the `verbs.some(gateAllows…)` check that throws before reads return).

Two citations drifted under Parts 48/49 (the design already warns to re-anchor, so this is a
nudge, not a contradiction): the submit discriminator is at `loadWorkflowState.js:113`, not `:110`
(design.md:154); and the "load-gate-ahead-of-side-effects invariant" at `:43-46` (design.md:154, :222)
now points into the `gateAllows` array-check body, not the load gate. Verify the line refs when the
amendment lands.

## Summary

| # | Severity | Finding |
|---|----------|---------|
| 1 | High | Gating the whole `...payload.fields` spread on `kind: check` regresses cascade/auxiliary `fields` seeding on form-kind upserts (`SubmitWorkflowAction.test.js:557-572`, `kickoff` is `kind: form`). Scope the guard to the user-submit **update** path (`:170`); leave the create path (`:162`) unconditional. |
| 2 | Moderate | `DEFAULT_TITLES` doesn't exist; titles flow through a `titleTemplate` if/else chain + `LIFECYCLE_TITLES`/`DEFAULT_SIGNAL_TITLES`/`ACTION_FALLBACK_TITLE`. Add a handler-type branch, not a map entry; task 1's copy uses `{{ action.type }}` where the convention is `{{ action.title }}`. |
| 3 | Minor | `api/get-entity-workflows.yaml:62-71` cell-source citation is stale; the cell is now read by `GetEntityWorkflows.js:91` (`action[app_name].message`). Conclusion holds. |
| 4 | Minor | design.md:160's "three named fields" vs "exactly as today" phrasings conflict; gate the existing spread, don't enumerate. |
| 5 | Minor | `loadWorkflowState` line refs (`:110`, `:43-46`) drifted under Parts 48/49 — re-anchor (`:113`, gate moved). |

**Verified sound (no action):** the per-workflow endpoint shape, `kind: check` coherence,
`GetWorkflowAction` single-object envelope, the `loadWorkflowState` discriminator/gate split, the
workflow-less `commitPlan` amendment, the Part 48/39 reconciliations, and the check-surface endpoint
concat all match in-tree code.
</content>
</invoke>
