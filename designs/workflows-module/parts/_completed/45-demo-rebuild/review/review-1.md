# Review 1

## Engine-grammar mismatches

### 1. Group-level `blocked_by` is dead config — the canonical authoring example must not carry it

> **Resolved.** Dropped `blocked_by` from all `action_groups` entries (sketch now carries a comment: groups are targets, never carriers). The exposed gating choice went the group-target way: `upload-po` is now `blocked_by: [quoting]` instead of `[send-quote]` — the order phase waits for the whole Quote group including a spawned `site-visit`, demonstrating the group-target form (making D6's "group + action `blocked_by` sequencing" showcase claim true) and the conditional-safe pattern now stated in D2. Story tree, sketch, D2, and worked-example step 4 updated.

The `onboarding.yaml` sketch (design.md lines 74–89) puts `blocked_by: [qualification]` / `[quoting]` / `[order]` on the **`action_groups` entries**. Nothing in the engine reads group-level `blocked_by`:

- `planAutoUnblock.js:95` reads only action-level `cfg.blocked_by` (its config lookup is `actionsConfig.find(c => c.type === action.type)`).
- `deriveGroupStatus.js:15-22` derives group status purely from member action stages — a group shows `blocked` because its members are seeded `blocked`, not because of any group dependency.
- `makeWorkflowsConfig.js` validates action-level `blocked_by` entries (lines 334–339) and group `on_complete` (line 109), but never touches a `blocked_by` key on a group — it flows through silently.
- Part 38 design line 150 confirms the model: `blocked_by` entries are **action-level**, resolving as either an action type or a *group id*. Groups are `blocked_by` *targets*, never carriers.

The current demo config carries the same dead field (`onboarding.yaml:36-42`, g2/g3) — this rebuild is the chance to stop propagating it. Since the design declares the new config "the canonical authoring example," dead config here will be copied into every future workflow.

**Fix:** drop `blocked_by` from all `action_groups` entries in the sketch. The intended display behaviour (groups render blocked until upstream work completes) already falls out of the seeded-`blocked` member actions. If the *behavioural* intent is "the PO can't be uploaded until the whole Quote group — including a spawned `site-visit` — is done," express that as action-level `blocked_by: [quoting]` on `upload-po` instead of `[send-quote]`; the current sketch deliberately lets the PO proceed while `site-visit` is open, which is fine, but make that choice explicit since the dead group entries currently *suggest* group sequencing exists.

### 2. Tracker seeding via `starting_actions` has no creation path in the rebuilt engine — resolve the status-vs-signal question now

> **Resolved.** Adopted the proposed resolution: `starting_actions` / `start-workflow` `actions:` keep the `{ type, status }` grammar, and task 17's Start planner seeds drafts directly at the declared status (legal seeds: `action-required`, `blocked`) — creation at workflow start is declarative config, not an FSM transition; the `none` row is the pre-hook spawn path only. Additionally (user decision), the tracker `none`-row exclusion is reversed: the tracker table gains `none → activate/block` so pre-hooks can conditionally spawn trackers. Updated: state-machine.md (tracker table + "Creation" section), Part 38 design.md:658, task 17 (Start plan + payload line + `tables.js`/`tables.test.js` flip), task 19, and this design's D3.

D3 says the tracker "is seeded `blocked` in `starting_actions` and unblocked by the normal pass — both verified against the FSM." Only the unblock half is verified (`fsm/tables.js:103-104`). The *seeding* half is an open question in the in-flight Part 38, and as written it doesn't work:

- The tracker FSM table has **no `none` creation row** — by explicit decision (`fsm/tables.js:101-102`; state-machine.md line 173: "It is **not** added to the tracker table — tracker actions are engine-created by `StartWorkflow`/the tracker subscription, never spawned by a pre-hook").
- Part 38 task 17 rewrites `StartWorkflow` to build initial action docs as "drafts via `planActionTransition` with `operation: "insert"`" — but `planActionTransition.js:74-93` has **only** the signal path: a null target requires `upsert: true` and resolves the signal against the `none` pseudo-row. There is no "seed at a declared status" path. For a tracker, any creation signal resolves to nothing (`signal_not_allowed` / structural no-op).
- Task 17 also says "document `signal` as the replacement for the implicit 'what status do we start in' path" for the `start-workflow` payload — suggesting starting entries move to `{ type, signal }`. The design's sketch uses the current `{ type, status }` grammar (design.md lines 60–70).

So this design is the **first config to seed a `kind: tracker` action via `starting_actions`**, against a Part 38 surface that (a) hasn't specified how `status:` entries become drafts and (b) structurally cannot create trackers through its stated mechanism. Per the repo rule ("resolve the open question; don't defer it"), this needs an answer baked into both designs, not discovered at task 17 implementation time.

**Proposed resolution:** keep `starting_actions` (and the `start-workflow` `actions:` payload) on the `{ type, status }` grammar, and have task 17's Start planner seed drafts **directly at the declared status** — creation is not a transition; the FSM governs transitions, and the `none` row exists solely for pre-hook upsert spawns (task 10). This preserves state-machine.md line 173 unchanged ("engine-created by StartWorkflow" = direct seed) and keeps this design's sketch valid. The alternative — signal-keyed starting entries — forces a tracker `none` row, contradicting an explicit concept-doc decision. Whichever way it lands, record the decision in this design (D3) and amend Part 38 task 17 to match.

## Convention enforcement

### 3. The D2 rule ("conditional actions never appear in `blocked_by`") is mechanically checkable — add a resolver lint

> **Rejected.** The `start-workflow` payload's `actions:` override replaces config `starting_actions` wholesale (`StartWorkflow.js:40`), and keyed types *must* be seeded that way (config `starting_actions` rejects keyed types by design) — so "absent from `starting_actions`" is not build-time-decidable as "conditional". The lint would warn on legitimately payload-seeded configs while remaining blind to the payload path itself: a half-check. The documented D1/D2 convention plus the group-target pattern (now stated in D2 per #1) stay as the guidance.

D2 establishes a hard rule enforced only "by example and documentation." But under the D1 convention the resolver can *detect* conditional actions: an action type declared in `actions[]` but absent from `starting_actions` is, by definition, conditional. A `blocked_by` entry naming such a type is exactly the forever-blocked trap D2 describes — and `makeWorkflowsConfig.js:334-339` currently accepts it (the type *is* declared, so validation passes; the dependent just blocks forever at runtime).

Per the repo principle ("prefer manifests and components that enforce the pattern mechanically over conventions that rely on each caller remembering"), add to `makeWorkflowsConfig`: lint-warn when a `blocked_by` entry names an action type not present in `starting_actions`. Warn rather than error because `StartWorkflow` also accepts a `payload.actions` override (`StartWorkflow.js:40`) and keyed types are seeded that way. One line in the Files changed table (`modules/workflows/resolvers/makeWorkflowsConfig.js`) and a sentence in D2.

## Mechanism inaccuracies

### 4. "Engine-computed entity links" (proposed change 7) misattributes the mechanism

> **Resolved (auto).** Reworded change 7: `vars.entities` is consumed by the workflows pages' entity back-links (`workflow-overview.yaml` / `group-overview.yaml`, the part 20 back-link), not the engine's link computation. Verified `computeEngineLinks.js` has no entity handling.

The `entities` var is not consumed by the engine's link computation — `computeEngineLinks.js` has no entity handling. It's consumed by the **workflows module pages**: `workflow-overview.yaml:147,163,172` (and `group-overview.yaml`) build the back-link to the entity page from `vars.entities` ("declared by part 20" per the file's own header comment). The change itself is correct and necessary (`companies-collection: { page_id: companies/view, id_query_key: _id, title: Company }` — key names verified against `modules/workflows/module.lowdefy.yaml:56-68`, scoped page-id shape verified against the demo build output `page:companies/view`). Reword change 7 so the implementer looks at the page-level consumption, not the engine.

### 5. D2 cites the legacy engine file that Part 38 deletes

> **Resolved (auto).** D2 now cites `planAutoUnblock.js:86-88` (noting it replaces `computeAutoUnblocks.js`). Semantics verified identical: `terminalByType.get(entry) === true`, zero docs → `undefined` → unsatisfied.

D2 verifies the zero-docs-unsatisfied semantics against `computeAutoUnblocks.js:64`. That file is replaced by `planAutoUnblock.js` (its header: "Replaces `SubmitWorkflowAction/computeAutoUnblocks.js` + `reevaluateBlockedActions.js`"), which preserves the semantics identically at `planAutoUnblock.js:86-88` (`terminalByType.get(entry) === true`; a configured type with zero docs yields `undefined` → unsatisfied). Cite the planner — this design outlives the legacy file.

## Underspecified demo wiring

### 6. Bake in the event type string (`action-approve`) and note the `send_routine` shape gap

> **Resolved (auto).** Change 9 now states `action-approve` (verified against Part 38's `action-{interaction}` table), the action-type filter (`send-quote`), the commented-out `send_routine` var, and the routine shape: receives `event_ids`, fetches event docs, branches on event type + action type, dispatches, rest fall through.

Proposed change 9 defers: "exact type string per Part 38's event-type table." The table (Part 38 design.md ~line 528) gives `SubmitWorkflowAction → action-{interaction}` — for the approve signal that's **`action-approve`**. State it; deferring re-asks a resolved question (CLAUDE.md: "resolve the open question").

Also note what "handles one workflow event type" actually requires: the demo's `send_routine` var is currently **commented out** (`apps/demo/modules/notifications/vars.yaml:5-6`) and the adjacent `send-routine.yaml` is a generic `AxiosHttp` call. The contract is "API routine steps … receives `event_ids` in the payload" (`modules/notifications/module.lowdefy.yaml:16-21`), and post-38 the engine dispatches `send-notification` with `event_ids` after **every** handler commit (Part 38 D9 step 4). So the demo routine must fetch the event doc(s) by id, branch on `type == action-approve` (and the action type, since *every* approve in *any* workflow emits `action-approve`), and write/dispatch the notification — rest fall through. One sentence on that shape in change 9 saves the implementer the dig, and the action-type filter is easy to miss.

### 7. The `on_create_routine` splice point requires restructuring `create-company.yaml`'s concat segments

> **Resolved (auto).** Files changed row now spells out the segment split (third segment ends at `new-event`, `on_create_routine` is its own segment, `:return:` moves to a final segment) and notes plain concat works without a `_build.if` guard since the var defaults to `[]`. Verified `:return:` currently sits inside the third segment in `create-company.yaml`.

D4 says the var "concatenates after the insert/link/event steps and before the `:return:`" — but in `create-company.yaml:93-163` the `:return:` currently sits **inside** the third concat segment, after `link-contacts` and `new-event`. Splicing before it means splitting that segment (third segment ends at `new-event`; `_module.var: on_create_routine` becomes its own segment; `:return:` moves to a final segment). Trivial, but worth a clause in the Files changed row so the manifest/README/routine all change together — and note that since the var defaults to `[]`, plain concatenation works without the `_build.if` guard that `request_stages.write` needs (that guard exists to skip the *wrapper step*, not the concat).

## Sequencing

### 8. Re-pointing task 20 makes Part 38's capstone depend on Parts 43, 44, and 45 — state the chain

> **Resolved (auto).** Item 11 now states the explicit chain (Part 38 tasks 1–19 → Part 43 → Part 44 → this part as the new task 20) and requires the supersession note in `tasks/20-demo-migration.md` to carry it.

Item 11 re-points Part 38's task 20 (the rebuild's integration capstone: "this task should land last; it validates the whole rebuild integrated") at implementing this config. This config requires `kind: check` + the `action-*` pages (Part 43), `tracker.start_link` (Part 44 — which itself sequences after Part 38's read side), and the companies/leads wiring in this part. The supersession is the right call (migrating the old config only to delete it is waste), but it silently extends Part 38's completion gate across three more parts. Add one sentence to item 11 — and to the supersession note destined for `tasks/20-demo-migration.md` — making the order explicit: Part 38 tasks 1–19 → Part 43 → Part 44 → this part (as the new task 20). Otherwise an implementer picking up task 20 from Part 38's task list has no signal that two other parts must land first.
