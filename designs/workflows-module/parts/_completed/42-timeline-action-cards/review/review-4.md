# Review 4 — Task-file executability, access parity, and v0-parity claims

Reviewed `design.md` **and** the generated task files (`tasks/tasks.md`, tasks 01–09) against the live codebase: the three read APIs, `visible_verbs.yaml` / `visible_verbs_filter.yaml`, `events-timeline.yaml`, the events manifest, `EventsTimeline.js`, the `action_statuses` enum, the v0 reference (`get_ticket_history.yaml`), and the Lowdefy build source (`buildRefs/walker.js`, `runInstance.js`) for the `_var`/`_ref`/`_build.array.concat` mechanics the tasks rely on.

Review-3's findings (#1 design sketch nesting, #2 New→Modify reclassification, #3 multi-action attachment scoping, #4 missing `exports:` block) are still open and are **not repeated** here — except where #1 below corrects the call-graph fact that review-3 #2 and task 2 both got wrong.

## Blocking

### 1. Task 2 is unexecutable as written — the three APIs never `_ref` `visible_verbs.yaml`; its only caller is `visible_verbs_filter.yaml`

> **Resolved.** Adopted option (b), default-fallback: each of the 8 `_module.var: app_name` sites in `visible_verbs.yaml` converts to `_var: { key: app_name, default: { _module.var: app_name } }` (the `events-timeline.yaml` `display_key` pattern) — zero caller churn; `visible_verbs_filter.yaml` and the three APIs stay untouched. Same parameterization applied to `resolve_action_link.yaml` (task 3), so task 4 inserts it into the three APIs as a bare ref. Task 2 rewritten (corrected call graph, 8 sites, one-file scope, AC); tasks 3/4 updated; tasks.md row, rationale, and Deviation 2 corrected; design D5 prose, sketch, and Files table updated (`visible_verbs.yaml` reclassified New → Modify).

Task 2 (and review-3 #2, and tasks.md Deviation 2) states the three read APIs "`_ref` it bare" and instructs: "In all three API files, change each bare `_ref` of `visible_verbs.yaml` to pass the var explicitly", while its AC pins `visible_verbs_filter.yaml` as "untouched". The codebase says otherwise:

- The **only** `_ref` to `modules/shared/workflow/visible_verbs.yaml` in the repo is `modules/workflows/api/stages/visible_verbs_filter.yaml:16`.
- The three APIs ref only the _bundle_: `get-entity-workflows.yaml:37`, `get-workflow-overview.yaml:56`, `get-action-group-overview.yaml:32` — each `- _ref: api/stages/visible_verbs_filter.yaml`, bare.

So task 2's step 2 edits refs that don't exist, and its AC forbids editing the one file that _does_ hold the ref. Worse, executing step 1 alone (convert the stage to `_var: app_name`) silently breaks all three APIs: each `_ref` opens a fresh var scope (`walker.js:90-104` — `vars: vars ?? {}`), so `_var: app_name` inside the stage resolves to `null` (`walker.js:251`, default `null`, no build error), producing `$getField: { field: null }` — every access gate fails at request time, not build time.

Also minor: task 2 says "≈4 occurrences" of `_module.var: app_name`; there are **8** (4 verb blocks × 2 sites — the gate `$getField` and the `user_roles` `_string.concat`: `visible_verbs.yaml:33,42,67,76,101,110,135,144`).

**Fix — two viable shapes; pick one and rewrite task 2 (and the design's Files-changed table, which lists neither `visible_verbs_filter.yaml` nor the API ref-call changes):**

(a) **Thread explicitly.** Convert the stage to `_var: app_name`; in `visible_verbs_filter.yaml` change its internal ref to `_ref: { path: ../shared/workflow/visible_verbs.yaml, vars: { app_name: { _var: app_name } } }`; change the three APIs' filter refs to `_ref: { path: api/stages/visible_verbs_filter.yaml, vars: { app_name: { _module.var: app_name } } }`. Var chaining is supported — ref-def var values that are objects are resolved in the _parent's_ var context before the child resolves (`walker.js:544-545`). Files touched: 5.

(b) **Default-fallback, zero caller churn.** Convert each site to the object form the repo already uses for exactly this situation — `events-timeline.yaml:27-30`'s `_var: { key: display_key, default: { _module.var: display_key } }`:

```yaml
field:
  _var:
    key: app_name
    default:
      _module.var: app_name
```

Workflows-side consumers (the filter, refed bare from the three APIs) keep resolving via the `_module.var` default exactly as today; the events fragment passes `app_name` explicitly and the default is never evaluated there. Files touched: 1. The same pattern would fit `resolve_action_link.yaml` (task 3), letting task 4 insert it into the three APIs as a _bare_ ref — simplifying task 4's edits too.

Option (b) matches an established repo precedent and keeps the diff minimal; option (a) is more explicit but ripples through 5 files and review-3 #2's design-table reclassification must then also add `visible_verbs_filter.yaml` and the three APIs' ref-calls. Either way, task 2's caller map, step 2, AC, and Files list must be rewritten, and tasks.md Deviation 2 corrected.

### 2. The timeline renders cards for actions the user has **no** visible verbs on — every other surface drops them

> **Resolved.** The fragment's `$lookup` inner pipeline gains the zero-verb drop — inline `$match $expr $anyElementTrue` over the four `visible_verbs` bools, immediately after the `visible_verbs` ref (inlined because the shared fragment cannot `_ref` the workflows-internal bundle). Dropped actions leave `actions: []` → no card; the event row still renders. D5 now states the decision explicitly: access alone gates card visibility; v0's "no message cell → hidden" data-presence gate was considered and deliberately not adopted (the verb model subsumes it; a second hiding mechanism would make forgotten status_map messages silently invisible). A build-time message-coverage lint was discussed and declined as out of scope for this part. Design D5 + Proposed-shape step 1 and task 5 (sketch, prose, AC) updated.

The three read APIs run `visible_verbs_filter.yaml`, whose `$match $anyElementTrue` drop implements Part 34's access outcome — per its own header: "drops actions where all four `visible_verbs` are false (the 'no role intersection on any verb → invisible' outcome)" (`visible_verbs_filter.yaml:7-8`).

The fragment (D5, task 5) composes only the **compute** half (`visible_verbs.yaml`) plus `resolve_action_link.yaml`. Nothing drops zero-verb actions. Result: a user with no verbs on an action sees its live card — current **status** and **message** — on the events timeline (with `link: null`), while the `actions-on-entity` widget on the _same page_ hides that action entirely. D5 resolves the access question only for the _link_ dimension ("a naive pick could surface an `edit` link to a view-only user") and never decides card visibility; review-1 #4's resolution likewise covered only the link.

This contradicts both Part 34's access model and the design's own "every surface renders the identical access-correct" framing. The event _row_ still rendering is fine (events are the events module's concern); the _card_ is workflow data behind an access model.

**Fix:** add the drop to the fragment's `$lookup` inner pipeline, after the `visible_verbs` ref — inline the 6-line `$match $expr $anyElementTrue` (the fragment, living in `modules/shared/`, cannot `_ref` the workflows-module-internal `api/stages/visible_verbs_filter.yaml`, and the filter's two-stage list would need `_build.array.concat` inside the lookup pipeline anyway). A dropped card leaves the event with `actions: []`, which renders no card (`EventsTimeline.js:475-478`) — exactly the D6-emptied behaviour. Alternatively, decide explicitly in D5 that zero-verb actions _do_ show status/message cards and document why the timeline diverges from the widget — but that needs to be a stated decision, not an omission.

## Correctness / consistency

### 3. "Carried verbatim from v0" overstates — the fragment drops v0's app-cell guard and changes the blocked-filter semantics

> **Resolved.** Both sub-points addressed, with one correction to the finding itself. (1) The app-cell guard is deliberately **not** ported — superseded by the D5/#2 decision that access alone gates card visibility (v0 used cell presence as its only read-side gate; the verb model subsumes it). (2) The blocked-filter difference is real but the finding's "visually equivalent" claim is wrong for one case: `['not-required', 'blocked']` has _current_ stage `not-required`, passes a current-stage-only filter, and renders a "Not required" card v0 suppressed (v0's history match existed to gate not-required cards on the action having ever been live; the block hides blocked cards itself). Resolved by replacing the fragment's filter with a semantic card-worthiness `$match`: current stage ≠ `blocked` AND history contains ≥1 active stage (covers v0's two shapes plus blocked/not-required cycles its exact-array match missed). Design D4 + Proposed-shape step 1 and task 5 (sketch, prose, AC) rewritten; "verbatim/matching v0" now claimed only for the de-dup window/group logic, which is verbatim.

D4 says the de-dup is "carried verbatim"; task 5 says blocked-filtering "match[es] v0". Against the actual v0 (`prp-support/.../get_ticket_history.yaml:118-133`):

- **v0's first inner stage is an app-cell guard the fragment omits:** `$match: { prp-support: { $ne: null } }` — actions carrying no status-map cell for the viewing app are dropped before projection. The fragment has no equivalent, so a multi-app action without this app's cell renders a degraded card (status-title fallback, no message, `link: null`). Note the events side of the same pipeline _does_ keep this guard — `events-timeline.yaml:27-31` `$match`es `<display_key>: { $ne: null }` on events. Mirror it for actions: add `$match: { _string.concat: ['$', _var: app_name]... }`-keyed `$ne: null` (or the `$getField`/`$expr` equivalent) as the lookup pipeline's first stage.
- **v0's blocked filter matches the whole stage _history_, not the current stage:** it drops actions whose `$status.stage` array equals `['blocked']` or `['not-required', 'blocked']` (never progressed), keeping ever-active-but-now-reblocked actions for the block's own `status === "blocked"` guard to hide. The fragment's `$ne: [$status, 'blocked']` on the _current_ stage is visually equivalent (either way no blocked card renders) and simpler — fine to keep, but the design/task prose should say "adapted" and note the equivalence, not "verbatim"/"matching v0".

### 4. D2's cost claim is wrong: the window/de-dup stages process every event, not just action-referencing ones

> **Resolved (auto).** D2's cost sentence rewritten: marginal cost is one empty `$lookup` plus a pass-through unwind/window/group over all matched events (semantically a no-op via the single null partition). Conclusion (always-on acceptable) unchanged.

D2 states "The de-dup/window stages operate only on events whose `action_ids` is non-empty, so the marginal cost on action-free timelines is one no-op `$lookup` stage." Not so for the pipeline as specced (task 5): `$unwind (preserveNullAndEmptyArrays)` → `$setWindowFields` → `$group ($first: $$ROOT)` → `$replaceRoot` flow **every** matched event through (action-free events form a single `partitionBy: $actions._id = null` partition and get rebuilt by the `$group`). Semantically a no-op, but it's a per-event window+group pass on a `get-events` request that has no pagination. Fix the sentence (e.g. "the marginal cost on action-free timelines is one empty `$lookup` plus a pass-through unwind/window/group over the matched events"); the conclusion (always-on is acceptable) still holds.

## Minor

### 5. D2 "no new config surface" vs the new `action_statuses_display` events var

> **Resolved (auto).** D2 bullet softened to "No new _required_ config" and now notes the optional `action_statuses_display` override (default `{}`) from D3.

D2's first rationale bullet claims "No new config surface … authors configure nothing", but D3/task 7 add a new author-facing events-module var (`action_statuses_display`, optional, default `{}`). Soften D2 to "no _required_ config" or "no new config to get cards at all".

### 6. `schema.js` docstring still cites the old enum path

> **Resolved (auto).** Added a step 4 to task 1 (update the `actionsEnum` docstring to `modules/shared/enums/action_statuses.yaml`) and added `schema.js` to task 1's Files list. The source edit happens when task 1 executes the move.

`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js:124` documents `actionsEnum` as "Typically loaded from enums/action_statuses.yaml". After task 1's move the canonical path is `modules/shared/enums/action_statuses.yaml`. One-line docstring update; add to task 1's file list.

## Verified accurate (mechanics the tasks depend on)

- **Task 1's six-file blast radius is exact:** `workflow-api.yaml:16` (×1), `components/action_statuses.yaml:2` (×1), `simple-view.yaml` (×6), `simple-review.yaml` (×2), `simple-edit.yaml:147` (×1), `edit.yaml.njk:276` (×1); plus the manifest header comment at `module.lowdefy.yaml:15`. No other `enums/action_statuses.yaml` refs exist. `makeWorkflowsConfig` receives the enum via resolved connection properties (no fs-path coupling), so the move is test-safe as task 1 claims.
- **Var chaining and the `{ key, default }` form work as the tasks assume:** object-valued ref vars are resolved in the parent var scope before the child ref resolves (`walker.js:544-545`); `_var` object form reads `key` + `default` (`walker.js:255-257`); module-component re-export refs inject the consumer's vars into the cloned inner ref (`walker.js:664-671`) — so the `timeline-action-lookup` re-export's `vars: { app_name }` reaches the fragment.
- **`_build.array.concat` appends a single-object arg:** Lowdefy's `_array.concat` runs `arg0.concat(arg1, …)` (`runInstance.js` — instance = first element, JS concat semantics), so task 4's `resolve_action_link` ref can be inserted as its own concat argument (object appended as one stage) or as a `- _ref:` element inside an adjacent list (in-place single-node substitution). Both work; task 4's sketch showing a bare top-level insert is realizable inside the existing `_build.array.concat` structures of all three APIs.
- **Task 4's per-API shape descriptions match the live files**, including `get-workflow-overview`'s early `link`/`message` `$addFields` (`get-workflow-overview.yaml:46-55`) and `get-action-group-overview`'s whitelist `$project` (`get-action-group-overview.yaml:52-65`).
- **Task 6's colour-key table matches the live block** (`EventsTimeline.js:371-374` `border_color`/`card_color`, `:387` `color`, `:392` `title` fallback) and the enum's `color`/`borderColor`/`titleColor`/`title` keys.
- **Task 8's premise checks out:** commit `d462706` exists and the workflows manifest has no `exports:` block today (task 5's note to create one is correct).
- **Events manifest:** `display_key` is a required string var ("App identifier … keyed by app name"), confirming D2's `display_key`-is-the-app-name premise; `event_types` (object, default `{}`) confirms the D3 mirror pattern.
