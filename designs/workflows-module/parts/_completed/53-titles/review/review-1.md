# Review 1

Scope: `designs/workflows-module/parts/53-titles/design.md`. Verified against the live engine
(`plugins/modules-mongodb-plugins/src/connections/...`) and module resolvers
(`modules/workflows/resolvers/...`). No `docs/Overview.md` exists in this repo (only `docs/idioms.md`),
so architecture was reconstructed from the part-51 design and source.

## Correctness — runtime title availability

### 1. `{{ workflow.title }}` is not available at runtime, so lifecycle event messages would render blank

> **Resolved.** Adopted fix (a): denormalize `title: workflowConfig.title` onto `baseWorkflowDoc` in `StartWorkflow.js`, persisting it on the workflow doc in the DB. Cancel/Close load the doc and get the title for free. Design §"Architecture" now covers both doc denormalizations (action + workflow), the data flow shows the workflow-doc title, and `StartWorkflow.js` is added to "Files changed". Chosen over runtime context injection (b) to keep the single denormalization stance.

The design's lifecycle table and data flow use `{{ workflow.title }}` ("{{user}} started {{workflow.title}}"),
and §4 says the title is materialized at build into `workflowsConfig` and **denormalized onto the action doc**.
But the design only denormalizes the **action** title (§4.2 → `planActionTransition`), never the **workflow** title
onto the workflow doc, and the lifecycle render context binds `workflow = plannedWorkflowDoc`
(`planEventDispatch.js:165, 173-177`).

The workflow doc carries `workflow_type` only — no `title`:

- `StartWorkflow.js:169-188` assembles `baseWorkflowDoc` with `workflow_type: params.workflow_type` and no `title`,
  even though `workflowConfig.title` is in scope (`workflowConfig` resolved at `:70`).
- `buildMetadata` and today's defaults both read `workflow.workflow_type` (`planEventDispatch.js:15-19, 243`).

So `StartWorkflow` / `CancelWorkflow` / `CloseWorkflow` messages would interpolate an empty `{{ workflow.title }}`.
This is precisely the raw-`workflow_type` defect part 51 D6 flagged ("interpolates raw machine values … workflow_type"),
so the gap defeats the design's own goal.

**Fix:** pick one and put it in "Files changed": either (a) add `title: workflowConfig.title` to `baseWorkflowDoc`
in `StartWorkflow.js` (persists, so Cancel/Close — which load the doc — get it for free), or (b) inject
`workflow.title` into the lifecycle render context from config at dispatch. (a) matches the module's denormalization
stance and is the smaller surface.

### 2. Action-title denormalization is placed in the insert-only branch; submit transitions take the update branch

> **Resolved.** Moved the title write to the unconditional denormalization block (`doc.title = actionConfig.title;` alongside `doc.workflow_type`), not the insert branch. Verified the branch structure: insert `:141-164`, update `:165-173` (spreads `...action`), unconditional block `:175+`. Design §4.2 and "Files changed" updated; misleading `143-164` cite dropped. This stamps title on every transition (insert + update), covering the submit path that the review flagged — and largely dissolves the migration open question (#4).

§4.2 and "Files changed" say "add `title: actionConfig.title` to the inserted doc" and cite
`planActionTransition.js:143-164` — that is the `operation === 'insert'` branch only. But a **submit on an
existing action** takes the `else` (update) branch (`planActionTransition.js:165-173`), which spreads `...action`
(the prior doc) and would carry no title. The `plannedActionDoc` handed to `planEventDispatch` on submit
(`planSubmit.js:188-200`) is that updated doc — so `{{ action.title }}` renders blank for the most common event path.

There is already an **unconditional denormalization block** that runs for both insert and update and re-stamps
config-derived fields on every plan: `doc.access`, `doc.workflow_type`, `doc.tracker`
(`planActionTransition.js:175-192`).

**Fix:** add `doc.title = actionConfig.title;` in that block (alongside `doc.workflow_type`), not in the insert
branch. This stamps title on every transition for new and pre-existing actions alike — and largely dissolves the
migration open question (see #4).

## Factual / file-reference errors

### 3. `createAction.js` no longer exists

> **Resolved (auto).** Verified no `createAction.js` exists (merged into `planActionTransition.js`; the `:142` comment is historical). Dropped the `createAction.js` mention from both §4.2 and "Files changed". The exact branch placement is handled separately by #2.

"Files changed" and §4.2 list `planActionTransition.js + createAction.js` as two edit sites. There is no
`createAction.js` — it was merged into `planActionTransition.js` (the `operation === 'insert'` branch; the comment
at `planActionTransition.js:142` "createAction.js fields" is historical). There is exactly one edit site, and per #2
it should be the unconditional block, not the insert branch. Drop `createAction.js` from the file list.

## Architecture / consumer model

### 4. The migration "accept on redeploy" lean contradicts the dumb-consumer stance — and most named consumers don't need the doc field at all

> **Resolved.** Verified: `GetEntityWorkflows` holds `wfConfig` (`:77`) and reads workflow/group titles from config (`:175`, `:146`); the per-action card payload (`:118-126`) carries no title and should source it from `wfConfig.actions`, like the group title. Split the action-title "Read by" column into config-readers (GetEntityWorkflows surfaces + action pages) vs. the one doc-reader (event planner). Rewrote the Migration section and dropped the read-path-fallback open question: no backfill, no read-time fallback. Added the key property — the doc `title` is written and read in the same plan (`planActionTransition` → `planEventDispatch`), so it's never re-read later and can't drift on a future config change either.

The §4 "Read by" column lists ActionSteps, overview cards, and actions-on-entity as readers of the **denormalized
action-doc** `title`. They aren't: those surfaces are fed by `GetEntityWorkflows`, which already holds the full
`wfConfig` and reads group display straight from config (`GetEntityWorkflows.js:107, 145-147` reads
`configGroup.title` / `.icon`). The per-action card payload it emits today (`:118-126`) carries `type/kind/status`
but no title — adding the action title there should read from **config** (the action config is in `wfConfig.actions`),
exactly as the group title already does. No doc dependency, no backfill.

The genuinely doc-only consumer is the **event render context** (`plannedActionDoc` in `planEventDispatch`), and that
doc is freshly planned with title via the fix in #2. The **timeline** stores already-rendered `display` strings on
the event doc, so it never reads `action.title` from the doc post-render — historical events are unaffected and new
ones render from the planned doc.

Consequently the Open Question ("read-path fallback for pre-existing in-flight action docs") mostly evaporates:
with #2, every transition re-stamps title; surfaces that show non-transitioning actions read from config via
`GetEntityWorkflows`. Resolve it as "no backfill, no read-time fallback — config-sourced on display surfaces,
re-stamped on the doc each transition," and tighten the §4 "Read by" column so it doesn't imply a scattered
`?? humanize(type)` the design explicitly set out to eliminate.

### 5. The group-title "shared enum title" tier is not a step `makeWorkflowsConfig` can perform

> **Resolved.** Verified `makeWorkflowsConfig(_, vars)` gets only `vars.workflows` (`:631`), and the compiled config shows groups arriving with `title`/`icon` already inline (enum `_ref`'d upstream). Restated the group rule as 2-tier (`group.title ?? humanizeSlug(group.id)`) in both the table and the precedence note, noting the enum still supplies title/icon/order upstream and the resolver only sees the merged result.

The §"Per-concept resolution" table and the precedence note give group title as
**explicit config title → shared enum title → `humanizeSlug(id)`**, "Materialized in `makeWorkflowsConfig`
(group normalization)". But `makeWorkflowsConfig(_, vars)` receives only `vars.workflows`
(`makeWorkflowsConfig.js:631-632`); it has no handle on `enums/action_groups.yaml`. Group title/icon already arrive
inside the config's `action_groups[]` because the enum is `_ref`'d into the workflow YAML — which is why
`GetEntityWorkflows` reads `configGroup.title` directly with no enum lookup.

So from the resolver's vantage there are only two tiers: **config title present → keep; absent → `humanizeSlug(id)`**.
The "shared enum title" middle tier is indistinguishable from "explicit config title" once `_ref` has run.

**Fix:** restate the group rule as 2-tier (`group.title ?? humanizeSlug(group.id)`), and note the enum still
populates `title`/`icon`/`order` upstream via `_ref`. If a genuine distinction is intended (e.g. let `humanizeSlug`
beat an enum-supplied title), say how the enum would reach the resolver — otherwise it can't.

## Minor

### 6. Acronym base set: RFQ double-booked, PO duplicated

> **Resolved.** Deduped `PO` in the base set, and kept `RFQ` shipped in base (user decision). Changed the extension example to `[BOM, SKU]` so it demonstrates a real merge, and updated the §"App-extensible acronyms" intro to list `BOM, SKU` (not RFQ) as the app-specific examples. Full base list still deferred to the open question.

§"humanizeSlug" rule 4 ships RFQ in the base set (`… KYC PO RFQ`), but §"App-extensible acronyms" uses
`title_acronyms: [RFQ, BOM, SKU]` as the canonical extension example. If RFQ ships in base, the example should
extend with acronyms that _aren't_ shipped (e.g. `[BOM, SKU]`) so it actually demonstrates the merge. Also `PO`
appears twice in the base-set string. Trivial, but the list is "finalized in the build list" per the open question —
clean it there.

### 7. `internal_cancel_action` is in the closed FSM set but absent from every signal table

> **Resolved (auto).** Added a sentence to the Fallback paragraph stating that internal/auxiliary signals (`internal_cancel_action`; non-primary `block`/`activate`/`unblock`) never reach `planEventDispatch` — one event per invocation for the primary signal; cascade cancels surface as `workflow-cancelled`. Makes the "exhaustive map" claim and the defensive fallback legible.

The FSM signal set includes `internal_cancel_action` (`fsm/tables.js`), which the design's "exhaustive, curated"
verb tables don't list. It is correctly omitted — cascade cancels never call `planEventDispatch` (one event per
invocation = the primary signal; the cancel surfaces as the `workflow-cancelled` lifecycle event), so it can't reach
the verb map. Worth one sentence in the design stating that internal/auxiliary signals (`internal_cancel_action`,
and `block`/`activate`/`unblock` when not the primary signal) never reach the planner — that's what makes the
user-attributed fallback safe and the "exhaustive map" claim true. As written, a reader can't tell the omission is
deliberate.

## Confirmed accurate

- Workflow `title` is already in `WORKFLOW_FIELDS` (`makeWorkflowsConfig.js:31`) — picked but **not** currently
  defaulted; the design correctly identifies the defaulting as new work.
- No `humanize*` helper exists anywhere in `modules/` or `plugins/` — the design's "no humanizer in the repo" claim holds.
- Event type is `action-${signal}` (`planEventDispatch.js:137`) and the single catch-all
  `DEFAULT_TITLES['action-event']` = "marked {{ action.type }} as {{ status_after }}" (`:20-21, 139`) — accurate.
- The 3-source override chain (engine default → YAML `event_overrides[signal]` → pre-hook) is real
  (`mergeEventOverrides.js`; `planEventDispatch.js:200-206`) and left untouched, as claimed.
- `submitTarget` branches submit → `in-review`/`done` on review presence (`fsm/tables.js`), matching the design's
  one submit-verb branch on `status_after`.
- Mirror signals dispatch via `MIRROR_TYPE_MAP` (`planEventDispatch.js:6-10, 126-135`) but `signal` is a separate
  parameter available on every path, so keying the new map off `signal` (not event type) works for the mirror rows too.
