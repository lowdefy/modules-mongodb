# Rename `kind: simple` → `kind: check`

The workflow-action kind currently spelled `simple` is renamed to `check`. `simple` was an interim name (it replaced `task` in [Part 35](../35-rename-task-kind-to-simple/design.md) to free "task" for the future tasks module); "simple" describes the implementation, not the thing, and carries a faint "trivial" connotation that undersells an action with assignees, a deadline, dependencies, and downstream state effects. Like Part 35, this is a vocabulary swap — no behavioural change, no data migration (the module is pre-production).

> **Scope change (Part 38 review-14 #1).** This part originally also renamed the three shared pages `simple-*` → `action-*`. That half was pulled forward into [Part 38 task 18](../38-engine-rebuild/tasks/18-display-surface-renames.md), which renames them once, to the final ids **`workflow-action-view` / `workflow-action-edit` / `workflow-action-review`** — the domain noun keeps kind names out of routes (this part's original rationale), and the `workflow-` prefix keeps the pages inside Part 34 D10's fixed-page glob (`{entry_id}/workflow-*`), so no new reserved type name is needed. This part is now a pure vocabulary sweep: **the kind rename touches no page id, file path, or route.** Open Question 1 (fold the page move into Part 40?) is resolved by the same decision — the pages moved earlier still, into Part 38.

## Proposed change

1. **Rename the kind value `simple` → `check`** across the config-schema validator (`ACTION_KINDS`), the engine FSM kind tables and resolver branches, the `ActionKind` typedef, the demo `workflow_config`, tests, and the README/concept terminology. The mental model is "check off": you _fill in_ a form, you _check off_ a check.
2. **Record the tasks-module page boundary**: adhoc tasks get their own `/tasks/*` pages in the future tasks module; the shared read-only detail surface is reused as a **component** (`_ref`), never as a cross-module shared page. Captured in [tasks-module-plan](../../../../workflows-module-concept/tasks-module-plan/design.md); no code here.
3. **Sequence as a discrete part after [Part 40](../40-simple-action-surfaces/design.md)** — so the sweep runs once against a stable tree, modelled on Part 35.

## Why `check` (not `simple`)

The five kinds all answer one question: **where does the action's resolution come from?**

- `form` — from structured input captured in-app
- `tracker` — from a child workflow completing (it subscribes)
- `custom` — from app-defined logic ([Part 28](designs/workflows-module/parts/28-custom-action-kind/design.md))
- `external` — from an external system driving it (planned)
- `check` — **from a human just declaring "I did the thing"**

`check` earns its place by pairing against `form`: a form _captures input_, a check _captures nothing — you mark it off_. That contrast — input-surface vs no-input-surface — is exactly the differentiator the taxonomy hinges on. The honest situation is that the single best word is _task_, which was deliberately spent on the adhoc concept (Part 35); `check` is the strongest remaining word that names the _surface_ rather than the implementation.

Rejected alternatives (this round):

- `simple` (incumbent) — describes the implementation ("the easy case"), not the thing; faint "trivial/dumb" connotation undersells an action with assignees, deadline, dependencies, and downstream effects.
- `job` — matches the prose ("a job a user should do") but collides with the software sense of a background/cron job, awkward next to `external` (system-driven).
- `checkbox` — implies a _binary_ done/not-done. These move through `action-required → in-progress → done`, plus `not-required` — four states, not a checkbox. `check` (the _act_ of checking off) doesn't misdescribe the surface.
- `check-off` / `checkoff` — disambiguates but breaks the one-word `kind:` pattern (`form` / `tracker` / `custom` / `external`) and reads clunky.
- `manual` / `step` / `status` / `user_task` / `mark` — all rejected in Part 35 for reasons that still hold (undifferentiated, misleading, or verbose).

**The one cost:** "check" has a second reading — _inspect / verify_ ("check the work") — and the access model already has a `review` verb. So within this system there's a nearby "verify" concept a `check` action could blur into. In practice the to-do reading ("check it off the list", next to `form`) dominates, and — crucially — the shared pages are route-anchored on `workflow-action-*` (Part 38 task 18), so the kind name never reaches a user-facing surface. It lives purely as an internal discriminator in `kind:` data and engine branches, plus the authoring grammar (`kind: check` in `workflow_config`).

## Interaction with the tasks module

Two questions settled here so the tasks-module design inherits the boundary rather than re-deriving it:

- **Tasks get their own view/edit pages — in their own module.** Adhoc tasks ship in a separate `tasks` module, scoped `/tasks/view`, `/tasks/edit`. No collision with `/workflows/workflow-action-*`. Separate page sets is _correct_, not duplication, because the write models genuinely differ: workflow `check` actions edit via nullary signal buttons → the engine resolver API (FSM resolves the target status); tasks edit via direct status writes → `update-task`. Different write paths ⇒ different edit pages.
- **The read view is a shared component, not a shared page.** The detail shape (header, universal fields, status history, comments) is identical across both streams, so the reuse is a `_ref`'d component (the way `workflow-action-view` already renders the shipped `universal-fields` component), not a cross-module page dependency. Shared collection → shared rendering, without coupling the modules.
- **External actions have no surface.** `kind: external` is system-driven with no user-facing page; it has no edit/review. If one ever needs a read view, the generic `workflow-action-view` renders it — which is the argument _for_ the generic page name over the kind name.

## Sequencing — a discrete part after Part 40

This does not thread into the in-flight designs. The kind value is referenced across almost the entire active cluster — Part 38 (engine FSM tables, render layer), Part 40 (the simple-action surface rewrite), and Parts 24 / 33 / 39 / 42 (`kind` comments and prose). Editing those mid-flight would create a window where some shipped tasks say `simple` and new ones say `check` — half-renamed is the bad state.

Instead, modelled on Part 35: a single mechanical "vocabulary, zero behaviour" sweep, reviewable as exactly that. The slot is **after Part 40 lands** — Part 40 is the last part that touches the simple-kind surfaces, so the sweep hits a stable tree once and isn't re-churned. Active parts continue using `simple` until then; `_completed/` parts stay frozen as historical record (as Part 35 left the `task`-era parts). The page ids are already final (`workflow-action-*`, Part 38 task 18) and are untouched by this sweep.

The same carry-forward caveat Part 35 raised still binds: **this must land before the first real app onboards a workflow config**, or `kind: simple` becomes a customer-data rename instead of a code one.

## Surfaces changed

Exact files and line numbers are deliberately not enumerated — Parts 38/39/40 are reshaping this tree, so the concrete sites resolve against the post-40 state at task-breakdown time. The _surfaces_ are stable:

**Kind value (`simple` → `check`)**

- Config-schema validator — `ACTION_KINDS` and the unknown-kind error wording (`modules/workflows/resolvers/makeWorkflowsConfig.js`).
- Engine — the per-kind FSM tables and any `kind === 'simple'` resolver branches introduced/relocated by Part 38 (today: `resolveTargetStatus.js` and the kind tables; Part 38 may move these).
- `ActionKind` JSDoc typedef (`plugins/.../connections/shared/types.js`).
- Demo `workflow_config` — the action files declaring `kind: simple`.
- Tests — fixtures seeding `kind: "simple"` and strict-string assertions on validator error wording.
- README + remaining concept-doc terminology (`form / simple / tracker` → `form / check / tracker`).

## Out of scope

- **Page ids and routes.** Renamed once to `workflow-action-*` by [Part 38 task 18](../38-engine-rebuild/tasks/18-display-surface-renames.md) (review-14 #1); this sweep doesn't touch them.
- **Anything tasks-module-specific.** The tasks module's manifest, `create-task` / `update-task` APIs, kanban/gantt views, and doc-level access model remain deferred to the tasks-module implementation design. This part only renames the kind; the tasks-page boundary note is a constraint, not an implementation.
- **Behaviour of the `check` kind.** Pure vocabulary. Status semantics, page composition, endpoint emission, hook surface, and access-model treatment for the kind formerly known as `simple` are unchanged.
- **Data migration.** None — pre-production; no host app's `actions` collection holds `kind: "simple"` docs written by shipped code.
- **`actions` collection schema.** The nullability constraints (no required `workflow_id` / `type` / `entity_id` / `entity_collection`) are already true and stay true; no schema change.
- **Reserving `kind: simple` as a rejected validator value.** As in Part 35, the generic "unknown kind" error already rejects `simple` once `ACTION_KINDS` flips; a bespoke "use `kind: check`" hint is a nice-to-have, not committed here.

## Open questions

None. (Open Question 1 — fold the page-ID move into Part 40? — was resolved by Part 38 review-14 #1: the page renames were pulled forward into Part 38 task 18 as `workflow-action-*`, and this part carries only the kind sweep.)

## Related

- The decision that moved the page renames out of this part: [Part 38 review-14 #1](../38-engine-rebuild/review/review-14.md) → [Part 38 task 18](../38-engine-rebuild/tasks/18-display-surface-renames.md).
- Source decision and boundary contract: [workflows-module-concept/tasks-module-plan/design.md](../../../../workflows-module-concept/tasks-module-plan/design.md).
- The previous rename this models on: [Part 35 — rename-task-kind-to-simple](../35-rename-task-kind-to-simple/design.md).
- The part that rewrites the simple-action surfaces (this part sequences after it): [Part 40 — simple-action-surfaces](../40-simple-action-surfaces/design.md).
- Engine rebuild that owns the FSM kind tables and per-verb `links` map: [Part 38 — engine-rebuild](../38-engine-rebuild/design.md).
- Implementation tracker: [designs/workflows-module/implementation-plan.md](../../../implementation-plan.md).
