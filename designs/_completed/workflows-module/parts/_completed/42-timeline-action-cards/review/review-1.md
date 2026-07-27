# Review 1 — Contract drift, ref paths, and override merge

Verified the design against the live `EventsTimeline` block, the `events`/`workflows` module configs, the `action_statuses` enum, and the in-flight Part 38/34 engine contract. The core idea (one shared de-dup fragment, two consumers, no module dependency) is sound and consistent with the repo's existing `event_types`/shared-enum mechanics. Two findings are blocking (the design builds on a contract that Part 38 is actively removing, and the `_ref` paths are wrong); the rest are correctness/consistency gaps.

## Blocking

### 1. The `link` shape the fragment reads is being deleted by Part 38

> **Resolved.** Valid — the fragment targeted the pre-38 single `<app_name>.link`, which Part 38 replaces with a per-verb `links` map. New **D5**: the fragment no longer reads a single cell; it resolves one access-aware `link` server-side from the per-verb map (priority `edit > review > error > view` over non-`null` ∩ `visible_verbs` cells), via two new shared stages (`visible_verbs.yaml`, `resolve_action_link.yaml`). Block stays single-link. Part 38 added to **Depends on** (post-38 contract assumed); Open Question on link render-readiness resolved. Resolved jointly with #4.

The whole feature hangs on projecting a render-ready link onto each action and passing it to `EventAction`, which reads a **single** `link` object (`link.pageId`, `link.urlQuery`, `link.title` — [EventsTimeline.js:360, 399-417](../../../../plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js)). The design's fragment projects `link: $<app_name>.link` (§ Proposed shape step 1, line 66) and Open Question 2 asserts "`$<app_name>.link` already carries a render-ready `{ pageId, urlQuery, title }` (it does in `get-entity-workflows`)."

That is true of the **current** code — `get-entity-workflows.yaml:67-71` does project `link: $<app_name>.link`. But [Part 38 — engine rebuild](../38-engine-rebuild/design.md) explicitly supersedes it:

- Part 38 D16 / line 523: "the per-app cell now carries a per-verb `links` map (`<slug>.links: { view, edit, review, error }`) **instead of** Part 30's single `<slug>.link`."
- Part 38 line 607: "`get-entity-workflows.yaml` … their `message` / `links` projections light up automatically once the engine writes the top-level fields."

So post-Part-38 there is no `<app_name>.link`; there is `<app_name>.links`, a per-verb **map**, and the UI is responsible for collapsing it to one link via the static priority `edit > review > error > view` ([Part 38 line 359, 406](../38-engine-rebuild/design.md)). Part 38 is not yet implemented (`access_filter.yaml` still present, no `computeEngineLinks.js`, no `visible_verbs_filter.yaml`), but it is a sibling part in the same module redesign and Part 42 is numbered after it — Part 42 should target the post-38 contract, not the pre-38 one it currently cites as proof.

**Fix:** Either (a) the fragment projects `links` and applies the `edit > review > error > view` selection to emit a single `link` for the block (the block stays single-link), or (b) the block is taught to take the per-verb map + a selection rule. (a) keeps the block change minimal and is consistent with "the UI applies the per-verb selection rule" language Part 38 uses for the other surfaces. Update Open Question 2 — its premise (`$<app_name>.link` exists) is false under the contract this part ships against. Add Part 38 to **Depends on** and state which link contract is assumed.

### 2. `_ref` paths use two `../` segments; every working ref in the repo uses one

> **Resolved (auto).** Changed the two `events-timeline.yaml` refs (lines 80, 91) and the `modules/workflows/components/action_statuses.yaml` repoint in the Files-changed table (line 125 — same error, not flagged) to a single `../shared/...`. Verified against the working sibling ref `events-timeline.yaml:86` → `../shared/enums/event_types.yaml`.

The design's `events-timeline.yaml` edit references `../../shared/workflow/timeline_action_lookup.yaml` and `../../shared/enums/action_statuses.yaml` (§ Proposed shape, lines 80, 91). In this repo `_ref`/`path` resolve relative to the **module root**, not the referencing file's directory — every shared reference uses a single `../shared/...` regardless of nesting depth:

- `modules/events/components/events-timeline.yaml:86` → `../shared/enums/event_types.yaml` (same file this part edits).
- `modules/layout/components/page.yaml:210` → `../shared/layout/title-block.yaml`.
- `modules/contacts/components/view_contact.yaml:28` → `../shared/profile/form_core.yaml`.
- Even `modules/shared/profile/avatar-preview.yaml:10` → `../shared/profile/...`.

`../../shared/...` would resolve above `modules/` and break the build. The re-export in `modules/workflows/module.lowdefy.yaml` (§ Proposed shape, line 105) correctly uses one `../shared/...` — so the design is internally inconsistent on its own paths.

**Fix:** Use `../shared/workflow/timeline_action_lookup.yaml` and `../shared/enums/action_statuses.yaml` (single `../`) in the `events-timeline.yaml` edit.

## Correctness / consistency

### 3. `actionStatusConfig` is fed raw — bypasses the override-merge idiom and undercuts D3

> **Resolved.** Valid. D3 reworked: `actionStatusConfig` is now `_build.object.assign: [ shared base enum, _module.var: action_statuses_display ]` — symmetric with the sibling `eventTypeConfig`, fixing the inconsistency. Per-app status colour/title overrides are a real need for a reusable module (the absence of any override today is the one-app artifact, not evidence of no need), so the override is kept, not dropped. events stays dependency-free (it must build in workflow-free apps — a `{ module: workflows }` ref wouldn't resolve, and the events→workflows dependency was considered and rejected on layering grounds even though the build tolerates cycles), so it carries its **own** `action_statuses_display` var. Parity across surfaces is achieved by the app pointing both module entries' override vars at one app-local file via `_ref` — one source, two refs, no drift. New events manifest var added to the files-changed table.

The design feeds the block `actionStatusConfig: { _ref: ../shared/enums/action_statuses.yaml }` — the bare enum (§ Proposed shape, line 90-91). Two problems:

- **Inconsistent with the sibling prop.** In the same file, `eventTypeConfig` is fed via `_build.object.assign: [ _ref shared enum, _module.var: event_types ]` ([events-timeline.yaml:84-87](../../../../modules/events/components/events-timeline.yaml)), so apps can override per-type display. The action config gets no equivalent override channel.
- **Undercuts D3's "single source of status display."** The workflow pages don't read the raw enum either — they read the `action_statuses` _component_, which is `_build.object.assign: [ enum, _module.var: action_statuses_display ]` ([components/action_statuses.yaml](../../../../modules/workflows/components/action_statuses.yaml)), with `action_statuses_display` a documented per-app override var ([module.lowdefy.yaml:66-78](../../../../modules/workflows/module.lowdefy.yaml)). So an app that sets `action_statuses_display` gets overridden colors on the workflow pages and **un-overridden** colors on the timeline cards — the opposite of "one enum the single source."

This is a genuine tension between D1 (events must not depend on workflows) and D3 (one display source): the override var lives on the _workflows_ module, and the events module structurally can't read it without the dependency D1 forbids. The base enum file is shared, but the _effective_ display config is not.

**Fix:** Decide and document explicitly. Cleanest within the constraints: state in D3 that the timeline renders the **base** enum and intentionally does not honor `action_statuses_display` (overrides are a workflow-page concern), and note the visual divergence an app accepts if it overrides. If parity is required, the override would have to move to a shared var both modules read — a larger change worth calling out rather than leaving implied.

### 4. Link selection ignores access — the card may deep-link a page the user can't use

> **Resolved.** Valid. New **D5** resolves selection in the aggregation, access-aware: `resolve_action_link.yaml` picks the highest-priority verb whose `links` cell is both non-`null` (state — a `done` action has only `view`) **and** true in `visible_verbs` (access — `access.<app>.<verb>` ∩ `_user.apps.<app>.roles`, computed by the shared `visible_verbs.yaml`). No privileged link is ever offered to a user without the verb. The same `resolve_action_link.yaml` is adopted by `get-entity-workflows` (actions-on-entity) and `workflow-group-overview`, so every surface renders one identical, access-correct link — superseding Part 38's UI-side selection (its read-side selection prose dropped). Resolved jointly with #1.

Post-Part-38 the per-verb `links` map is collapsed to one link _against the user's `visible_verbs`_ — the workflow read APIs run `visible_verbs_filter.yaml` and the UI selects among verbs the user actually has ([Part 38 line 359, 408](../38-engine-rebuild/design.md)). The events-timeline pipeline runs only the reference `$match` then the fragment — no `visible_verbs` resolution. So a naive `edit > review > error > view` pick in the fragment can surface an `edit` link to a user who only has `view`, routing them to a page they can't load.

v0 didn't have this problem because it had a single pre-resolved link. The per-verb model reintroduces it. **Fix:** Decide whether the timeline card respects `visible_verbs` (pulling that stage into the fragment, which adds `_user`-dependent runtime cost and arguably more workflow coupling) or deliberately always links to a safe default verb (`view` when present). Document the choice in a decision; it is not the "carried verbatim from v0" no-op the design implies.

### 5. Confirm the emitted event doc actually carries `action_ids` at top level

> **Resolved.** Verified — no silent failure. The engine's `dispatchLogEvent.js:82-86` writes `references: { workflow_ids, action_ids: [action._id], <refKey> }`, and `new-event.yaml` spreads `_payload: references` onto the event doc, so `action_ids` is top-level. Asserted by `worked-example.test.js:159` and already queried by `simple-view.yaml:222`; Part 38 carries the composition unchanged. Confirmed join field documented in proposed-shape step 1.

The fragment's `$lookup` uses `localField: action_ids` (§ Proposed shape step 1). `action_ids` is a live engine concept — `makeWorkflowApis.js:83` returns it from submit, and `start/close/cancel-workflow.yaml` carry it — but `new-event.yaml` builds the event doc by spreading `_payload: references` ([new-event.yaml:10-26](../../../../modules/events/api/new-event.yaml)), so whether `action_ids` lands as a top-level field on the **event** document depends on what the Part 38 engine puts in the event payload's references. If it doesn't, the `$lookup` matches nothing and **no card ever renders** — a silent failure identical to the one this part exists to fix. Per the project's "resolve the open question" rule, verify against the Part 38 event-emission shape and state the field name the fragment joins on.

## Minor

### 6. Window-sort field vs display-sort field

> **Resolved.** Added an assumption note to D4: card attachment keys off `created.timestamp` while display sorts by `date`; both are `_date: now` at insert (`new-event.yaml`), so they agree and the card lands on the visually-last event. Note flags that a backfill/import diverging the two fields would break the alignment — no such path exists today.

The fragment de-dups by partitioning on the action and sorting by `created.timestamp` (D4, § Proposed shape step 2), but the timeline displays events sorted by `date` ([events-timeline.yaml:32-33](../../../../modules/events/components/events-timeline.yaml)). Both are set to `_date: now` at insert (`new-event.yaml:17-20`), so "latest by `created.timestamp`" and "first by `date`" agree in practice — but the card-attachment logic and the visual order key off different fields. If events are ever backfilled or imported with a `date` that differs from `created.timestamp`, the card could attach to an event that isn't visually last. Worth a one-line note that the fragment assumes `created.timestamp` tracks `date`.

### 7. `blocked` is filtered twice

> **Accepted.** The redundancy is intentional and harmless. The fragment's inner-pipeline filter is the real gate for the timeline; the block's `status === "blocked"` early-return stays as defense-in-depth, since the shipped block shouldn't assume every consumer pre-filters. No design change.

The fragment filters blocked actions in the `$lookup` inner pipeline (§ Proposed shape step 1, "blocked actions filtered"), and `EventAction` also early-returns on `action.status === "blocked"` ([EventsTimeline.js:362-363](../../../../plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js)). Harmless redundancy, but note that with data-layer filtering the block's blocked guard becomes dead code for this consumer, and the enum's `blocked` entry (priority 7) exists only for the workflow pages. No action needed beyond awareness.

### 8. Open Question 1 — resolve it in the design

> **Resolved (auto).** Dropped Open Question 1 and kept `modules/shared/workflow/` (the path the design already uses throughout), parallel to the existing `enums/` / `layout/` / `profile/` grouping under `shared/`. Remaining open question renumbered.

`modules/shared/workflow/` vs a flatter home is a naming call with no factual unknown; per "resolve, don't defer," just pick `modules/shared/workflow/` (it parallels the existing `enums/`, `layout/`, `profile/` grouping) and drop the open question rather than carrying it into implementation.

## Confirmed accurate

- D3 color-key reconcile table (lines 47-52) matches the live code: `EventAction` reads `card_color` / `border_color` / `color` / `title` ([EventsTimeline.js:373-376, 391, 396](../../../../plugins/modules-mongodb-plugins/src/blocks/EventsTimeline/EventsTimeline.js)); the enum carries `color` (light fill) / `borderColor` / `titleColor` / `title` ([action_statuses.yaml](../../../../modules/workflows/enums/action_statuses.yaml)). The proposed remap is correct.
- `status` resolves to `status.stage[0]` (a kebab slug matching the enum keys) — consistent with `get-entity-workflows.yaml:27-30`.
- The "events must not depend on workflows" premise holds: `events/module.lowdefy.yaml` declares no `dependencies`, and routing through a build-time shared `_ref` (D1) matches how `events-timeline.yaml` already pulls `event_types`.
