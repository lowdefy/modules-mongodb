# Rename `kind: simple` → `kind: check`, and decouple the shared action pages to `action-*`

The workflow-action kind currently spelled `simple` is renamed to `check`, and the three shared pages that serve it (`simple-edit` / `simple-view` / `simple-review`) are renamed to `action-edit` / `action-view` / `action-review` — decoupling the page route from the kind name. `simple` was an interim name (it replaced `task` in [Part 35](../_completed/35-rename-task-kind-to-simple/design.md) to free "task" for the future tasks module); "simple" describes the implementation, not the thing, and carries a faint "trivial" connotation that undersells an action with assignees, a deadline, dependencies, and downstream state effects. Like Part 35, this is a vocabulary-and-route swap — no behavioural change, no data migration (the module is pre-production).

## Proposed change

1. **Rename the kind value `simple` → `check`** across the config-schema validator (`ACTION_KINDS`), the engine FSM kind tables and resolver branches, the `ActionKind` typedef, the demo `workflow_config`, tests, and the README/concept terminology. The mental model is "check off": you *fill in* a form, you *check off* a check.
2. **Rename the shared pages `simple-*` → `action-*`** (`action-edit` / `action-view` / `action-review`), so the page route is anchored on the domain noun (`action`) rather than the kind. The kind name stops appearing in any URL.
3. **Update every `_module.pageId` reference** to the renamed pages — the manifest `pages:` entries, the demo `schedule-followup.yaml` link cells, and the per-verb `links` map produced by the Part 38 engine — to point at `action-*`.
4. **Record the tasks-module page boundary**: adhoc tasks get their own `/tasks/*` pages in the future tasks module; the shared read-only detail surface is reused as a **component** (`_ref`), never as a cross-module shared page. Captured in [tasks-module-plan](../../../workflows-module-concept/tasks-module-plan/design.md); no code here.
5. **Sequence as a discrete part after [Part 40](../40-simple-action-surfaces/design.md)** — the part that rewrites these page surfaces — so the sweep runs once against a stable tree, modelled on Part 35.

## Why `check` (not `simple`)

The five kinds all answer one question: **where does the action's resolution come from?**

- `form` — from structured input captured in-app
- `tracker` — from a child workflow completing (it subscribes)
- `custom` — from app-defined logic ([Part 28](../_next/28-custom-action-kind/design.md))
- `external` — from an external system driving it (planned)
- `check` — **from a human just declaring "I did the thing"**

`check` earns its place by pairing against `form`: a form *captures input*, a check *captures nothing — you mark it off*. That contrast — input-surface vs no-input-surface — is exactly the differentiator the taxonomy hinges on. The honest situation is that the single best word is *task*, which was deliberately spent on the adhoc concept (Part 35); `check` is the strongest remaining word that names the *surface* rather than the implementation.

Rejected alternatives (this round):

- `simple` (incumbent) — describes the implementation ("the easy case"), not the thing; faint "trivial/dumb" connotation undersells an action with assignees, deadline, dependencies, and downstream effects.
- `job` — matches the prose ("a job a user should do") but collides with the software sense of a background/cron job, awkward next to `external` (system-driven).
- `checkbox` — implies a *binary* done/not-done. These move through `action-required → in-progress → done`, plus `not-required` — four states, not a checkbox. `check` (the *act* of checking off) doesn't misdescribe the surface.
- `check-off` / `checkoff` — disambiguates but breaks the one-word `kind:` pattern (`form` / `tracker` / `custom` / `external`) and reads clunky in page names.
- `manual` / `step` / `status` / `user_task` / `mark` — all rejected in Part 35 for reasons that still hold (undifferentiated, misleading, or verbose).

**The one cost:** "check" has a second reading — *inspect / verify* ("check the work") — and the access model already has a `review` verb. So within this system there's a nearby "verify" concept a `check` action could blur into. In practice the to-do reading ("check it off the list", next to `form`) dominates, and — crucially — proposed change 2 keeps `check` out of all routes, so it never reaches a user-facing surface. It lives purely as an internal discriminator in `kind:` data and engine branches, plus the authoring grammar (`kind: check` in `workflow_config`).

## Why the pages move to `action-*` (decoupled from the kind)

The page-naming scheme isn't what felt off — it's putting a *kind word* in a *route*. `/workflows/simple-view` reads oddly for the same reason `/workflows/check-view` would: a taxonomy discriminator surfacing as a URL segment, dragging the verify/cheque misreads with it. Any kind-as-route has this (`form-view`, `tracker-view` would too).

The fix is to anchor the page route on the domain noun, not the kind. Three reasons this is right, not just cosmetic:

1. **The view surface is genuinely kind-agnostic.** The read shape — header, universal fields, status history, comments — renders *any* kind. `action-view` can read-render a form, check, external, or tracker action; `check-view` would be a lie the day a non-check action wants a read page. Only the *write* surfaces are kind-specific.
2. **It survives kind renames.** This is the kicker: the kind is being renamed *right now* (`task → simple → check`), and Part 35 had to drag the page files and every `_module.pageId` reference along with it. Anchored on `action`, the kind can be renamed freely forever and these pages never move again.
3. **The module prefix scopes the noun correctly, and it's free.** Form actions live in the verbose generated `workflow-{workflow_type}-{action_type}-{verb}` namespace ([ui/spec.md](../../../workflows-module-concept/ui/spec.md)), so `action-*` is unused. Within the `workflows` module, `/workflows/action-view` reads as "view a *workflow* action" — and tasks (a separate module) own `/tasks/*`, so there's no collision.

The resulting surface map:

| Page | Scope | Serves |
| --- | --- | --- |
| `action-view` | genuinely generic | read-render for **any** kind (check today; external/tracker if ever surfaced) |
| `action-edit` | default write surface | `check`-kind signal-button edit (form opts out via its generated pages; external/tracker have no write surface) |
| `action-review` | default review surface | `check`-kind approve / request-changes |

`action-view` is the one that's truly generic; `action-edit` / `action-review` are "the default action write surfaces" — only `check` needs them today, and a future non-form kind that wants signal-button editing without bespoke pages would reuse them.

## Interaction with the tasks module

Two questions settled here so the tasks-module design inherits the boundary rather than re-deriving it:

- **Tasks get their own view/edit pages — in their own module.** Adhoc tasks ship in a separate `tasks` module, scoped `/tasks/view`, `/tasks/edit`. No collision with `/workflows/action-*`. Separate page sets is *correct*, not duplication, because the write models genuinely differ: workflow `check` actions edit via nullary signal buttons → the engine resolver API (FSM resolves the target status); tasks edit via direct status writes → `update-task`. Different write paths ⇒ different edit pages.
- **The read view is a shared component, not a shared page.** The detail shape (header, universal fields, status history, comments) is identical across both streams, so the reuse is a `_ref`'d component (the way `simple-view` already renders the shipped `universal-fields` component), not a cross-module page dependency. Shared collection → shared rendering, without coupling the modules.
- **External actions have no surface.** `kind: external` is system-driven with no user-facing page; it has no edit/review. If one ever needs a read view, the generic `action-view` renders it — which is the argument *for* the generic page name over the kind name.

## Sequencing — a discrete part after Part 40

This does not thread into the in-flight designs. The kind value and the `simple-*` page IDs are referenced across almost the entire active cluster — Part 38 (engine FSM tables, render layer, display-surface tasks), Part 40 (named `simple-action-surfaces`; it *rewrites* these pages), and Parts 24 / 33 / 39 / 42 (page references and `kind` comments). Editing those mid-flight would create a window where some shipped tasks say `simple` and new ones say `check` — half-renamed is the bad state.

Instead, modelled on Part 35: a single mechanical "vocabulary + route, zero behaviour" sweep, reviewable as exactly that. The slot is **after Part 40 lands** — Part 40 is the last part that creates/rewrites these page surfaces, so the sweep hits a stable file set once and isn't re-churned. Active parts continue using `simple` / `simple-*` until then; `_completed/` parts stay frozen as historical record (as Part 35 left the `task`-era parts).

The same carry-forward caveat Part 35 raised still binds: **this must land before the first real app onboards a workflow config**, or `kind: simple` becomes a customer-data rename instead of a code one.

## Surfaces changed

Exact files and line numbers are deliberately not enumerated — Parts 38/39/40 are reshaping this tree, so the concrete sites resolve against the post-40 state at task-breakdown time. The *surfaces* are stable:

**Kind value (`simple` → `check`)**

- Config-schema validator — `ACTION_KINDS` and the unknown-kind error wording (`modules/workflows/resolvers/makeWorkflowsConfig.js`).
- Engine — the per-kind FSM tables and any `kind === 'simple'` resolver branches introduced/relocated by Part 38 (today: `resolveTargetStatus.js` and the kind tables; Part 38 may move these).
- `ActionKind` JSDoc typedef (`plugins/.../connections/shared/types.js`).
- Demo `workflow_config` — the action files declaring `kind: simple`.
- Tests — fixtures seeding `kind: "simple"` and strict-string assertions on validator error wording.
- README + remaining concept-doc terminology (`form / simple / tracker` → `form / check / tracker`).

**Page IDs (`simple-*` → `action-*`)**

- The three page files in `modules/workflows/pages/` (filename + inner `id:` + header comment) — or, if Part 40 has rewritten them, the rewritten files adopt `action-*` directly.
- Manifest `pages:` `_ref:` entries.
- Every `_module.pageId` reference: the demo `schedule-followup.yaml` link cells, the `universal-fields` header comment, and the per-verb `links` map the Part 38 engine computes/emits.
- Active-part design.md files that reference the page IDs (flip in place; review files stay frozen).

## Out of scope

- **Anything tasks-module-specific.** The tasks module's manifest, `create-task` / `update-task` APIs, kanban/gantt views, and doc-level access model remain deferred to the tasks-module implementation design. This part only renames the kind and decouples the pages; the tasks-page boundary note is a constraint, not an implementation.
- **Behaviour of the `check` kind.** Pure vocabulary + route. Status semantics, page composition, endpoint emission, hook surface, and access-model treatment for the kind formerly known as `simple` are unchanged.
- **Data migration.** None — pre-production; no host app's `actions` collection holds `kind: "simple"` docs written by shipped code.
- **`actions` collection schema.** The nullability constraints (no required `workflow_id` / `type` / `entity_id` / `entity_collection`) are already true and stay true; no schema change.
- **Reserving `kind: simple` as a rejected validator value.** As in Part 35, the generic "unknown kind" error already rejects `simple` once `ACTION_KINDS` flips; a bespoke "use `kind: check`" hint is a nice-to-have, not committed here.

## Open questions

1. **Fold the page-ID move into Part 40 instead of a separate part?** Part 40 rewrites these very pages, so it *could* emit them as `action-*` directly and let this part carry only the `simple → check` kind sweep. Argument for keeping them together (recommended): one reviewable "vocabulary + route" diff, and the `_module.pageId` references that move are the same set the kind sweep touches. Argument for splitting: Part 40 ships the new pages already correctly named, shrinking this part. Resolve when Part 40 reaches task breakdown.

## Related

- Source decision and boundary contract: [workflows-module-concept/tasks-module-plan/design.md](../../../workflows-module-concept/tasks-module-plan/design.md).
- The previous rename this models on: [Part 35 — rename-task-kind-to-simple](../_completed/35-rename-task-kind-to-simple/design.md).
- The part that rewrites these page surfaces (this part sequences after it): [Part 40 — simple-action-surfaces](../40-simple-action-surfaces/design.md).
- Engine rebuild that owns the FSM kind tables and per-verb `links` map: [Part 38 — engine-rebuild](../38-engine-rebuild/design.md).
- Implementation tracker: [designs/workflows-module/implementation-plan.md](../../implementation-plan.md).
