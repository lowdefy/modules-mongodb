# Workflows State Machine

Replace the priority-rule + `force: true` transition model with a per-state finite-state machine where every status mutation is the result of a named **signal** — whether the signal came from a user clicking a button, an engine subscription, or an author's pre-hook return. The engine ships one FSM table per action kind (form / check / tracker) mapping `(currentStatus, signal) → newStatus`; signals against non-listening states no-op silently; page templates declare which signals surface as buttons. Authors emit signals to express intent; the engine executes; the priority rule, `force: true`, and the implicit "what status does this interaction land in" lookup all disappear.

This sub-design responds to [`review/critique-concepts.md`](../review/critique-concepts.md) points 1, 2, 4, 5, and 6 — they collapse into one model change once signals are the unifying primitive.

## Proposed change

1. **Per-action-kind FSM tables replace the priority rule.** Each kind has one engine-shipped table mapping `(currentStatus, signal) → newStatus`. Signals fired against non-listening states no-op silently. Tables are engine-internal and not author-overridable in v1.
2. **Signals are the single transition primitive.** User button clicks, engine cascades (auto-unblock, tracker propagation, workflow cancel), and pre-hook `actions[]` returns all emit signals against an action. The FSM resolves uniformly.
3. **Page templates declare which signals surface as buttons.** `edit`, `view`, `review`, `error` templates each ship a button bar that fires named signals. The same signal fired from a button or a pre-hook follows identical FSM resolution.
4. **`force: true` removed.** All mutations go through the FSM. Migrations and admin overrides stay out-of-band (direct DB edits) — same as today. Engine-internal write paths get explicit `internal_*` signal names declared in the default tables.
5. **`progress` restored as a first-class interaction** (was `save_draft` in v0). Persists current edits without advancing, landing in `in-progress`. Covers both "save a form draft" (form kind) and "mark a task started" (check kind). Closes the v0 → v1 regression noted in critique § 5.
6. **Pre-hook return shape carries signals, not statuses.** Today's `{ type, status }` becomes `{ type, signal }`. Pre-hook says what to do, engine resolves where to land. Pre-hooks emit signals only against *other* actions via `actions[]`; the current action lands per the signal the user fired (v0's current-action root override is removed — see "How signals get emitted").

## Supersedes

This sub-design replaces parts of existing sub-designs:

- **[engine](../engine/design.md) Decision 4** — the priority-order rule and `force: true` per-call/per-entry override. Replaced by FSM tables and signal-emission semantics.
- **[submit-pipeline](../submit-pipeline/design.md) Decision 3** — the interaction → target status table, including the simple `submit_edit` + `current_status` selector path. Replaced by FSM resolution against named signals; check actions use the same nullary signals as form actions (no `target_status` / `current_status`).
- **[submit-pipeline](../submit-pipeline/design.md) "fixed five-button vocabulary"** — replaced by per-template button declarations over the unified signal namespace.
- **[ui](../ui/design.md) `workflow-action-edit` status selector** — the v0 selector that let a submitter pick the target status directly. The shared check pages now surface the same signal buttons as form pages; the ui follow-on (see Next step) re-specs them.

The other sub-designs ([action-authoring](../action-authoring/design.md), [module-surface](../module-surface/design.md), [action-groups](../action-groups/design.md), [call-api](../call-api/design.md)) are unaffected at the model level — their YAML grammar, page generation, and module API surfaces stay the same.

## Problem

Today's transition model has four entangled pieces:

1. **Status enum with priority order.** Eight statuses ranked `blocked(7) > action-required(6) > in-progress(5) > in-review(4) > changes-required(3) > done(2) > error(1) > not-required(0)`. A status mutation is legal when the new priority is strictly less than the current, with a same-state self-exception for the action being submitted.
2. **A `force: true` escape hatch** that bypasses the rule. Per-call (admin/migration) and per-entry (pre-hook `actions[]` items).
3. **An implicit interaction → target status table** baked into submit-pipeline (`submit` lands `in-review` or `done` depending on whether the action has a `review` verb; `approve` lands `done`; `request_changes` lands `changes-required`; …).
4. **A hard-coded five-button vocabulary** on templates: `submit`, `not_required`, `resolve_error`, `approve`, `request_changes`.

The friction this creates, audited against a reference project and surveyed in `critique-concepts.md`:

- **Resubmit, error recovery, and re-edit-after-done all require `force: true`.** Common flows (resubmit from `changes-required`, recover from `error`, re-edit a `done` action that cascades into dependents) go backward in priority terms. The audit of `/Users/sam/Developer/mrm/prp/apps/shared/workflow_config` found ~17 `force: true` uses, ~half just for backward transitions that the priority rule forbade. These aren't admin edge cases; they're routine.
- **Tracker writes, auto-unblocks, and cancel cascades use `force: true` too.** Engine-internal code paths bypass the rule. The engine has two write paths (priority-gated and force-gated); reviewing engine code requires tracking which path each write takes.
- **Auxiliary writes from pre-hooks (`actions[]`) compete with user-driven writes through the same gate.** The submit payload mixes `currentActionId` (user-driven) with auxiliary entries; both go through the priority check, distinguished only by the self-exception.
- **Custom interactions are locked.** Adding a sixth button (e.g. `progress`, which the reference project had as a core lifecycle interaction and the current design lost) requires changing module code in three places — the status enum lookup, the template button bar, the submit-pipeline mapping table.
- **The model is not legible.** Reading the engine doesn't tell you what transitions are possible from a given state. You read priority numbers, then code paths that override them. There is no single artefact that answers "what can happen next?"

## Proposed shape — signals + FSM

The unifying concept: **everything that changes status is a signal.** A signal is a named message fired against an action. The action's FSM table looks up `(currentStatus, signal)` and either transitions to a new status or no-ops. Signals come from three emitters; resolution is identical regardless of emitter.

```
                          ┌───────────────────────────────┐
                          │  Signal: { target, name }     │
                          └──────────────┬────────────────┘
                                         │
                  ┌──────────────────────┼──────────────────────┐
                  │                      │                      │
        User clicks a button     Engine subscription     Pre-hook returns
        on a template page      (auto-unblock, tracker,    `actions[]`
        ─────────────────       cancel cascade)            ───────────────
                                ────────────────────
                  │                      │                      │
                  └──────────────────────┼──────────────────────┘
                                         │
                                         ▼
                          ┌───────────────────────────────┐
                          │  FSM lookup per action's kind │
                          │  transitions[currentStatus]   │
                          │     [signalName] → newStatus  │
                          │  (missing entry = no-op)      │
                          └───────────────────────────────┘
```

The FSM table is the source of truth for what transitions are possible. The same table answers:

- *"What can a submitter do on this action right now?"* — read `transitions[currentStatus]` keys filtered by which signals the page template surfaces.
- *"Will this pre-hook auxiliary write land?"* — read `transitions[targetCurrent][signal]`; if undefined, it's a no-op.
- *"Will the engine cascade from blocked_by re-evaluation regress this done action?"* — read `transitions[done][unblock]`; if undefined, structurally safe.

The "A → done re-fires shouldn't regress B" guarantee that priority rule provided becomes structural: signals against terminal states no-op because terminal states have no outgoing transitions for those signals.

## Signal inventory (v1)

One namespace, fourteen signals. The label "interaction" vs "signal" is a metadata question (does any page template surface this signal as a button?), not a separate concept.

### Signal source-state principle

Signals express **intent**. The FSM accepts a signal from any current state where that intent is *coherent*, regardless of who's emitting and regardless of whether the emitter knew the target's current state. The FSM no-op exists for two narrow purposes: structural safety (re-fire against a state that's already past the signal's reach) and semantic contradiction (a state whose meaning rules the signal's intent out).

There are two emitter contexts, and they're gated differently:

- **Signals against the current action** — fired by user button clicks only. The page template is the user-side gate: button bars only render signals coherent from the action's current state, so users physically can't fire incoherent signals from the UI. The FSM is the second line of defence.
- **Signals against other actions** — fired by pre-hook `actions[]` cascades. The emitter doesn't know the target's current state; the target may have moved between the pre-hook's last check and the cascade firing. Narrow source-state lists silently drop the author's intent in exactly the cases the cascade is designed to cover. So the inventory leans broad: `not_required` accepts `in-review` and `error` (cascade case), `activate` accepts almost every state (deliberate cross-state reset), `block` accepts every non-terminal (author re-block).

The exception is `unblock`: it stays narrow (`blocked` only) precisely because broadening it would let the engine's post-transition `blocked_by` walk regress done or in-progress siblings on a re-fire. Re-fire safety is the structural guarantee priority-rule used to provide; for `unblock` specifically, narrowness is what preserves it. The rest of the table is broad.

### Interactions — surfaced as buttons by at least one page template

| Signal              | Source states (form kind)                                       | Target            | Notes                                                                                                  |
| ------------------- | --------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| `submit`       | `action-required`, `in-progress`, `changes-required`, `done`    | `in-review` or `done` | Lands `in-review` if **any** app's `access` block declares the `review` verb for the action; else `done`. This is an **action-global** property — one action doc is shared across every app, so the split is the action's, not the submitting app's. Source `done` covers re-submit of a completed action. Nullary — the target is resolved from the action's static review verb, not from any runtime payload (same rule for form and check kinds). |
| `progress`        | `action-required`, `in-progress`                                | `in-progress`     | Persists current edits without advancing. Form kind: saves `form_data` (a draft). Check kind: records that work has started. Restores v0 `save_draft` (critique § 5). |
| `not_required`      | `action-required`, `in-progress`, `changes-required`, `blocked`, `in-review`, `error` | `not-required`    | Broad source list — pre-hook cascades like `mark-quote-not-required` shouldn't drop on whichever current-state outcomes the author didn't anticipate. User-side gating is the page template's job (only the edit template shows this button).               |
| `approve`           | `in-review`                                                     | `done`            | Reviewer button on the review template.                                                                |
| `request_changes`   | `in-review`, `done`                                             | `changes-required` | Button on review template (from `in-review`); cascade signal from `done` for revise-after-done flows. |
| `resolve_error`     | `error`                                                         | `in-review`       | Button on the error template. Default landing is `in-review` so the resolver re-evaluates the submission. |

### Signals — engine and pre-hook emitters only, no button

| Signal                            | Source states                                                                         | Target            | Emitter                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unblock`                         | `blocked`                                                                             | `action-required` | Engine (on `blocked_by` satisfaction) + pre-hooks (when the target is known-blocked). Narrow by design — firing it against a non-blocked target no-ops, which keeps `blocked_by` re-evaluation structurally safe against accidentally regressing done/in-progress siblings.                                                                                                                                          |
| `block`                           | `action-required`, `in-progress`, `in-review`, `changes-required`, `error`            | `blocked`         | Pre-hooks only. The engine does not auto-block on `blocked_by` dep regression — once unblocked, an action stays unblocked unless an author explicitly re-blocks it. Authors who want a dependent to re-block on dep regression emit `block` explicitly from the dep's pre-hook.                                                                                                                                  |
| `error`                           | `action-required`, `in-progress`, `in-review`, `changes-required`, `blocked`          | `error`           | Pre-hooks only. The author-deliberate "this downstream action has failed" signal — e.g. a dependency failure cascading an error onto a dependent. The engine never sets `error` itself: a thrown hook surfaces as an API-level reject/error toast (submit-pipeline), not an action status. Recovered via `resolve_error`. Replaces the v0 pre-hook `actions: [{ status: error }]` return. |
| `activate`                        | `blocked`, `in-progress`, `in-review`, `changes-required`, `error`, `done`            | `action-required` | Pre-hooks. The broad "make this actionable, whatever its current state" signal. Used by cascade hooks where the target state is uncertain or deliberately overridden (e.g. issue-resolve resetting a `done` action). Authors reach for `activate` over `unblock` when they want the broader reach; `unblock` stays narrow so engine `blocked_by` re-evaluation can't accidentally regress done/in-progress siblings. |
| `internal_cancel_action`          | `action-required`, `in-progress`, `in-review`, `changes-required`, `error`, `blocked` | `not-required`    | Engine `CancelWorkflow` cascade. Not for pre-hook use.                                                                                                                                                                                                                                                                                                                                                               |
| `internal_mirror_child_active`    | `blocked`, `action-required`, `done`, `not-required` (tracker kind only)              | `in-progress`     | Engine tracker subscription. Not for pre-hook use. Reaches `done`/`not-required` so the parent recovers if the child uncancels or re-activates after the tracker had landed terminal (resolves the "child uncancel" recovery path engine D4 previously needed `force: true` for).                                                                                                                                  |
| `internal_mirror_child_completed` | `blocked`, `action-required`, `in-progress`, `not-required` (tracker kind only)       | `done`            | Engine tracker subscription. Not for pre-hook use. Reaches `not-required` so a parent that landed cancelled before the child completed can recover.                                                                                                                                                                                                                                                               |
| `internal_mirror_child_cancelled` | `blocked`, `action-required`, `in-progress`, `done` (tracker kind only)               | `not-required`    | Engine tracker subscription. Not for pre-hook use. Reaches `done` so a parent that completed before the child was cancelled can recover.                                                                                                                                                                                                                                                                          |

The `internal_*` prefix is convention, not enforcement. Authors reading the table immediately see "don't fire these from my pre-hooks" without the engine having to gate it. If a real case for author-emitted `cancel_action` appears later, the prefix gets dropped and the table is unchanged.

### Terminal states

`done` and `not-required` are terminal for the normal completion path but not strictly terminal in the FSM sense. Each kind treats them slightly differently:

- **Form kind.** `done` accepts deliberate backward signals (`submit`, `request_changes`, `activate`) for re-edit / revise / re-open cases. `not-required` accepts no form-kind signals — for form actions, "this case doesn't apply" is a sticky decision; undoing it is an out-of-band admin edit.
- **Tracker kind.** Both `done` and `not-required` accept `internal_mirror_child_*` signals so the parent can recover when the child re-activates or completes after the tracker had landed terminal. Tracker terminality is always conditional on the child's terminality; if the child reverses, the tracker reverses.

## FSM tables per kind

### Form kind

| Current ↓ / Signal →   | `submit`           | `progress`     | `not_required`   | `approve` | `request_changes`  | `resolve_error` | `error`   | `unblock`        | `activate`          | `block`   | `internal_cancel_action` |
| ---------------------- | ----------------------- | ---------------- | ---------------- | --------- | ------------------ | --------------- | --------- | ---------------- | ---------------- | --------- | -------------- |
| `none` (creation)      | —                       | —                | —                | —         | `changes-required` | —               | `error`   | —                | `action-required`| `blocked` | —              |
| `blocked`              | —                       | —                | `not-required`   | —         | —                  | —               | `error`   | `action-required`| `action-required`| —         | `not-required` |
| `action-required`      | `in-review` or `done`   | `in-progress`    | `not-required`   | —         | —                  | —               | `error`   | —                | —                | `blocked` | `not-required` |
| `in-progress`          | `in-review` or `done`   | `in-progress`    | `not-required`   | —         | —                  | —               | `error`   | —                | `action-required`| `blocked` | `not-required` |
| `in-review`            | —                       | —                | `not-required`   | `done`    | `changes-required` | —               | `error`   | —                | `action-required`| `blocked` | `not-required` |
| `changes-required`     | `in-review` or `done`   | —                | `not-required`   | —         | —                  | —               | `error`   | —                | `action-required`| `blocked` | `not-required` |
| `error`                | —                       | —                | `not-required`   | —         | —                  | `in-review`     | —         | —                | `action-required`| `blocked` | `not-required` |
| `done`                 | `in-review` or `done`   | —                | —                | —         | `changes-required` | —               | —         | —                | `action-required`| —         | —              |
| `not-required`         | —                       | —                | —                | —         | —                  | —               | —         | —                | —                | —         | —              |

### Check kind

**Identical to the form-kind table above** — no specialization, no parameterized signal. A check action is a form action with no `form:` body and no author `hooks:`; its submit payload is the universal fields (`assignees`, `due_date`) plus a comment, not `form_data`. It therefore listens to exactly the same signals as a form action:

- **Buttons** (shared `workflow-action-edit` / `workflow-action-review` pages): `submit`, `progress`, `not_required`, `approve`, `request_changes`. `progress` here means "mark started" — the `schedule-followup` "set a due date now, complete later" flow.
- **Cascade / engine**: `error`, `resolve_error`, `unblock`, `activate`, `block`, `internal_cancel_action` — same as form. A pre-hook on another action can `error` a check action; recovery is `resolve_error`.

There is **no status selector** and **no `target_status` / `current_status` payload** — the v0 workflow-action-edit selector is removed. `submit` is nullary like every other signal; a check action advances through the same lifecycle as a form action, driven by the same buttons (review verb selects `in-review` vs `done`, same as form). An app that needs to push a check action straight to `blocked` or `error` does so via a pre-hook `block` / `error` cascade from elsewhere, not a self-set selector.

The `error` row is reachable for check kind only via cascade (no check page surfaces an `error` button). How the shared check pages surface *recovery* — a `check-error` page vs. a `resolve_error` button on `workflow-action-view` — is a [ui](../ui/design.md) follow-on (ui ships no `check-error` page today).

### Tracker kind

Tracker actions never receive user interactions. Their FSM has one live source — the engine's tracker subscription firing `internal_mirror_child_*` signals, plus `unblock` for the standard `blocked_by` flow — and a creation-only `none` row (`activate` / `block`) so a pre-hook can conditionally spawn a tracker (see "Creation" below).

| Current ↓ / Signal →   | `unblock`         | `activate`        | `block`   | `internal_mirror_child_active` | `internal_mirror_child_completed` | `internal_mirror_child_cancelled` | `internal_cancel_action` |
| ---------------------- | ----------------- | ----------------- | --------- | ------------------------------ | --------------------------------- | --------------------------------- | -------------- |
| `none` (creation)      | —                 | `action-required` | `blocked` | —                              | —                                 | —                                 | —              |
| `blocked`              | `action-required` | —                 | —         | `in-progress`                  | `done`                            | `not-required`                    | `not-required` |
| `action-required`      | —                 | —                 | —         | `in-progress`                  | `done`                            | `not-required`                    | `not-required` |
| `in-progress`          | —                 | —                 | —         | —                              | `done`                            | `not-required`                    | `not-required` |
| `done`                 | —                 | —                 | —         | `in-progress`                  | —                                 | `not-required`                    | —              |
| `not-required`         | —                 | —                 | —         | `in-progress`                  | `done`                            | —                                 | —              |

No `submit`, `approve`, `request_changes`, or `error` — tracker actions don't expose these paths. `activate` and `block` resolve **only from `none`**: they are birth signals for conditional pre-hook spawns, not transitions on a live tracker.

### Creation — the `none` source state

A pre-hook can spawn a new keyed action instance mid-submit (e.g. "if a site visit is required, create a `site-visit-report` action"). Creation is modelled as **one more FSM transition**, not a special-cased status seed: the absent doc's current stage is the sentinel `none`, and the spawning signal resolves through the `none` row to the new doc's birth stage.

- **`none` is a transient resolution-time sentinel, never a stored status.** The eight-status enum is unchanged; `none` only ever appears as the `currentStatus` fed to the FSM lookup when no doc exists for a `(type, key)`. The created doc lands directly at the resolved birth stage — `none` is never persisted, never counted in summaries, never displayed.
- **The `none` row lives in every kind's table** — the form table (inherited by check via the table alias) with the full birth-signal set, and the tracker table with only `activate` / `block`, so a pre-hook can conditionally spawn a tracker (e.g. an action that only tracks a child workflow when an earlier answer flags the need). A hook-spawned tracker behaves like a seeded one: it sits at its birth stage until a child is started against it (Part 44 start link, or `start-workflow` with `parent_action_id`). Each birth signal lands exactly where it lands from a real state, so the meaning is consistent: `activate → action-required`, `block → blocked`, `request_changes → changes-required`, `error → error` (form/check; tracker births only via `activate`/`block`). (The audit of the reference project found spawns seeded only at `action-required`, `blocked`, and `changes-required`; the `none` row covers those plus `error`.)
- **`StartWorkflow` does not use the `none` row.** `starting_actions` (and the `start-workflow` payload's `actions:` override) keep the `{ type, status }` grammar; the Start planner seeds drafts **directly at the declared status** (legal seeds: `action-required`, `blocked`). Creation at workflow start is declarative config validated at build time, not a transition — the FSM governs transitions, and the `none` row exists solely for pre-hook upsert spawns. (Decided in Part 45 review 1 #2.)
- **Extensible by adding edges.** If a real case to spawn straight into another stage appears (e.g. `none → submit → done` for an already-satisfied audit action), it's a one-cell addition to the `none` row — same as growing any other row. Birth stays expressed *as a signal*, so creation states remain explicit and engine-locked rather than free-form author-seeded.
- **Authorized by `upsert: true`.** Only a pre-hook `actions[]` entry carrying `upsert: true` may resolve against `none` (see Path 3). A missing target *without* `upsert: true` is a programming error and throws (Open question 1) — so a typo'd target never silently spawns.

## How signals get emitted

Three paths into the FSM. Identical resolution.

### Path 1 — User clicks a button

Pages render button bars (see "Templates and buttons" below). A button click hits the `{workflow_type}-{action_type}-submit` endpoint with `signal: <name>` in the payload. Engine resolves `transitions[action.status][signal]`; transitions or no-ops.

### Path 2 — Engine cascade

Three engine code paths emit signals:

- **`blocked_by` re-evaluation** — after every transition, the engine walks the workflow's `blocked_by` graph. For each action whose dependencies are now terminal, emit `unblock`. The FSM resolves; non-listening states no-op. The engine does *not* emit `block` on dep regression — once unblocked, an action stays unblocked unless an author explicitly re-blocks it via a pre-hook. This keeps engine cascades monotonic (unblock-only) and reserves `block` as a deliberate author signal.
- **Tracker subscription** — when a child workflow transitions, the engine reads the child's `parent_action_id` and emits the corresponding `internal_mirror_child_*` signal against the parent tracker action.
- **`CancelWorkflow` cascade** — emits `internal_cancel_action` against every open action in the workflow.

The engine never writes status without emitting a signal. There is no "force this status" code path.

### Path 3 — Pre-hook returns

Pre-hooks return a structured response that the engine treats as a signal manifest:

```yaml
:return:
  actions:                         # emit signals against other actions (optional)
    - { type: <action_type>, signal: <name> }
    - { action_id: <id>, signal: <name> }       # by primary key
    - { type: <action_type>, key: <key>, signal: <name>, upsert: true }  # spawn a missing keyed instance
    - { type: <action_type>, key: <key>, signal: <name>, upsert: true, fields: { ... }, metadata: { ... } }  # spawn seeded with data
  event_overrides: { ... }
  form_overrides: { ... }
```

**Pre-hook semantics:**

- **The current action lands per the signal the user fired.** A pre-hook cannot re-signal the current action — there is no root-level signal override. It influences the current action only through `event_overrides` (log event) and `form_overrides` (written form data); where the action *lands* is fixed by the fired signal and the FSM. Conditional landing (e.g. "this submission should be marked not-required") is modelled as a separate thin action with its own button, not a redirect of the current submit (see worked example 4).
- `actions[]` — auxiliary signals against **other** actions in the **current workflow**. Each entry identifies a target (by `type` + optional `key`, or by `action_id`) and the signal to fire. Engine fires each against the target's FSM; non-listening targets no-op silently. There is no cross-workflow target form — the engine plans one workflow aggregate at a time; signalling another workflow needs its own load-plan-commit cycle (the tracker cascade is the only such path).
- `upsert: true` on an `actions[]` entry **authorizes spawning** a missing target. When no doc matches the entry's `(type, key)`, the engine resolves the signal against the `none` creation row (the absent doc's current stage is `none`) and inserts a new action at the resolved birth stage. This is the rebuilt home of today's `{ type, key, status, upsert: true }` spawn — the `status` seed is gone; the birth stage now comes from the signal via the `none` row. Without `upsert: true`, a missing target throws (Open question 1).
- `fields?` / `metadata?` on an `actions[]` entry are the **data seeding channel**: `fields` is spread verbatim onto the target action doc and `metadata` is merged into its accumulated `metadata` object (the same passthrough the current-action submit payload gets). Allowed on any entry — they seed a spawned doc and apply to transitions of existing targets alike, preserving today's behaviour where `fields` threads into both create and update. The canonical use is seeding a spawned keyed instance (e.g. a per-device action carrying `device_ids` + a `metadata.physical_id`).

The shape change from today's `{ type, status }` to `{ type, signal }` is the one author-visible YAML break. Migration is mechanical:

| Today                                            | After                                              |
| ------------------------------------------------ | -------------------------------------------------- |
| `{ type: send-quote, status: action-required }` | `{ type: send-quote, signal: unblock }`            |
| `{ type: send-quote, status: not-required }`    | `{ type: send-quote, signal: not_required }`       |
| `{ type: send-quote, status: blocked }`         | `{ type: send-quote, signal: block }`              |
| `{ type: send-quote, status: error }`           | `{ type: send-quote, signal: error }`              |
| `{ type: send-quote, status: changes-required, force: true }` | `{ type: send-quote, signal: request_changes }` |
| `{ type: send-quote, status: action-required, force: true }`  | `{ type: send-quote, signal: activate }` |

Pre-hooks lose `force: true`. They gain expressive signal names. The engine's resolution is now deterministic from the table.

`upsert: true` survives the migration unchanged — it still authorizes creating a missing target. What changes is that the `status` seed it used to carry is dropped; the birth stage is now expressed by the signal, resolved through the `none` row:

| Today                                                          | After                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------- |
| `{ type: x, key: k, status: action-required, upsert: true }`   | `{ type: x, key: k, signal: activate, upsert: true }` |
| `{ type: x, key: k, status: blocked, upsert: true }`           | `{ type: x, key: k, signal: block, upsert: true }`    |
| `{ type: x, key: k, status: changes-required, force: true, upsert: true }` | `{ type: x, key: k, signal: request_changes, upsert: true }` |

### Unknown signal names throw; unlisted transitions no-op

Two failure modes look similar but are handled differently:

- **Unknown signal name** — a signal not in the engine-locked vocabulary (e.g. `notrequired` with a missing underscore, or `requestChanges` in camelCase). The engine **throws** at handler entry, before any FSM lookup. The v1 vocabulary is fixed (Non-goals), so the engine holds the complete known-signal list and can reject typos cheaply. This matches Open Question 2's resolution for missing targets — both are programmer errors, not soft no-ops.
- **Known signal, state doesn't list it** — e.g. `action-required → unblock`, undefined in the table. This **no-ops** silently. The soft no-op is structurally meaningful: it's what makes re-fire safety work (worked example 5) and what lets broad cascade source-lists drop intent harmlessly against states the author didn't anticipate.

So the only silent no-op is `transitions[currentStatus][signal]` being undefined for a *valid* signal. An invalid signal name never reaches the table.

## Templates and buttons

Page templates each declare which signals to surface as buttons. The button click hits `{workflow_type}-{action_type}-submit` with `signal: <name>` and the rest of the payload (`form_data` for form kind; universal fields + comment for check kind).

**Default v1 button bars** (illustrative — the [ui](../ui/design.md) sub-design owns the authoritative button-bar spec and the access-verb gating of each button; the FSM model only constrains which `(status, signal)` transitions are *valid*):

| Template | Signals surfaced                                    | Notes                                                                            |
| -------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `edit`   | `submit`, `progress`, `not_required`         | The submitter's working surface.                                                 |
| `view`   | `request_changes` (opt-in; modal for comment), Edit-nav Link (shows when `page_ids.edit` is set) | Default landing for `done` actions. `request_changes` is opt-in (default hidden) and renders from the server-resolved `buttons.request_changes`, which passes on `view`, `edit`, OR `review` ([Part 49](../../workflows-module/parts/49-request-changes-verb-gate/design.md)): `review` gates the reviewer's _judgement_ power (`approve`, review-page access); `request_changes` is "flag a problem, send it back" — anyone who can see or work on the action may raise it. "Edit" is navigation, not a signal. |
| `review` | `approve`, `request_changes`                        | The reviewer's surface.                                                          |
| `error`  | `resolve_error`                                     | The error-handler's surface.                                                     |

Per-action overrides happen at the template level (apps that customize templates pick the button bar they want); the FSM is unchanged. If an app wants a "Mark not required" button on the view page too, the template adds `not_required` to its button bar — no engine work.

`progress` is the v0 → v1 regression restoration (was `save_draft`). The button is template-shipped on the edit template, fires the `progress` signal, which routes `action-required → in-progress` and `in-progress → in-progress`. The page payload persists on every save (`form_data` for form kind; the universal-field edits for check kind); the log event is a lightweight `progress_saved` entry (or suppressed, at the author's choice via `event_overrides`).

## What disappears

- **The priority order** as a runtime concept. Statuses are still ranked for display purposes (the status enum still orders them in pickers and visualizations), but the runtime does not consult priority numbers to decide legality.
- **`force: true`**, both per-call and per-entry. Removed from `SubmitWorkflowAction` payload, removed from `actions[]` entry shape, removed from engine handler. Migrations and admin overrides remain out-of-band (direct DB writes, same as today).
- **The "interaction → target status" table** baked into submit-pipeline. Replaced by FSM resolution.
- **The same-state self-exception.** No longer needed — the FSM tables list same-state transitions explicitly where they're wanted (e.g. `in-progress → progress → in-progress`).
- **The "actions[] with status" pre-hook return shape.** Replaced by signal-based shape.
- **The check-action status selector and its `target_status` / `current_status` payload.** Check actions now use the same nullary signal buttons as form actions (review #6); the v0 selector that let a submitter pick `done` / `blocked` / `error` / `not-required` directly is gone. Pushing a check action to `blocked` / `error` is now a pre-hook cascade, not a self-set.

## What gets added

- **The FSM tables themselves** — three small lookup tables (form, check, tracker), engine-internal data.
- **The `none` creation row** (form + check with the full birth-signal set; tracker with `activate`/`block` only) — folds pre-hook action *spawning* into the FSM. Replaces today's `{ type, key, status, upsert: true }` status-seed branch (`handleSubmit` step 4 + `utils/shouldCreate.js`): the birth stage is now resolved from the signal via the `none` row, with `upsert: true` as the create-authorization guard. `none` is a transient sentinel, not a ninth status.
- **The `progress` signal and `in-progress`-landing transition** — restoration of v0 `save_draft` capability, now covering check kind ("mark started") as well as form kind ("save draft").
- **The `error` signal** — explicit name for author-deliberate downstream errors, replacing the v0 pre-hook `actions: [{ status: error }]` return. The engine itself never sets `error` (thrown hooks surface as API-level reject/error toasts, not action statuses).
- **`activate` and `block` signals** — explicit names for cascade patterns previously written as `force: true`. `activate` complements the narrow `unblock` for cases where the cascade is deliberate across multiple source states.
- **`internal_*` signal names** — `internal_cancel_action`, `internal_mirror_child_*` — replacing today's nameless engine code paths.

## Worked examples

**1. Resubmit after request_changes.**

- User on `changes-required` action sees the edit template (because `changes-required` is in the edit template's source-state list).
- Clicks Submit → fires `submit`.
- FSM: `changes-required → submit → in-review` (assuming review verb declared).
- No `force` needed. Today's flow required `force: true` because `in-review(4) > changes-required(3)`.

**2. Issue-resolve cascade.**

- Maintenance-report action is `error`. Escalator opens its `error` template, clicks "Resolve error."
- The action's pre-hook on `resolve_error` runs (the escalator-supplied recovery logic).
- Pre-hook returns:
  ```yaml
  :return:
    actions:
      - { type: technician-on-site, signal: activate }
  ```
- The current action (maintenance-report) lands per its fired signal: `error → resolve_error → in-review`, where the resolver's fix is reviewed.
- The cascade fires `activate` against the other action `technician-on-site` (currently `in-progress` → `action-required`). Today's `force: true` becomes a named cross-action cascade.

**3. Edit-after-done cascade.**

- Initial-details action is `done`. User opens its view page, clicks "Edit" (navigation to edit template, no signal fires).
- User modifies the form, clicks Submit → fires `submit`.
- FSM: `done → submit → in-review`.
- Pre-hook on the form action's `submit` cascades:
  ```yaml
  :return:
    actions:
      - { type: allocation, signal: request_changes }     # was done, now changes-required
  ```
- FSM resolves `allocation`'s state: `done → request_changes → changes-required`. Today this needed `force: true`; now it's a declared transition.

**4. Mark-quote-not-required cascade.**

- Author models a thin form action `mark-quote-not-required` with a single-button edit page.
- Its pre-hook on `submit`:
  ```yaml
  :return:
    actions:
      - { type: devices-upload-quote, signal: not_required }
      - { type: devices-accept-quote, signal: not_required }
      - { type: devices-upload-po, signal: not_required }
  ```
- Engine fires `not_required` against each. FSM resolves per their current states:
  - `action-required → not_required → not-required` ✓
  - `blocked → not_required → not-required` ✓
  - Already `not-required` → no-op (target list doesn't include `not-required`). Structurally safe.

**5. Auto-unblock with re-fire safety.**

- Action A transitions to `done`. Engine walks `blocked_by`. Action B is `blocked_by: [A]`; fires `unblock` against B.
- FSM: `blocked → unblock → action-required`. ✓
- Some time later, A's pre-hook on a different interaction also marks A as `done` (idempotent re-write). Engine walks `blocked_by` again, re-fires `unblock` against B.
- B is now `action-required`. FSM: `action-required → unblock` is undefined → no-op. The re-fire doesn't regress B.

## Non-goals

- **Author-overridable FSM tables.** v1 ships per-kind tables engine-locked. If a real second case for `reject` or `escalate` interactions appears, the next version opens the table to author additions — purely additive. Until then, YAGNI.
- **Custom statuses.** The eight-status enum stays fixed in v1 per critique § 7. The FSM model doesn't depend on the enum being fixed (the tables would just grow), but unlocking the enum is out of scope.
- **Time-driven signals.** No `due_date_passed`, `sla_breached`, or scheduler. Reserve the names for future use per critique § 8 but ship nothing.
- **An "operations" category** for state-orthogonal lifecycle events like `reassign`, `update_due_date`, `update_description`, `comment` (critique § 3). Out of scope for this sub-design — would warrant its own. The signals/FSM model and the operations category are independent; neither blocks the other.

## Open questions

1. **Should the engine validate signal targets at fire time?** A pre-hook emitting `{ type: nonexistent, signal: unblock }` could either throw or no-op. **Resolved:** a missing target throws **unless** the entry carries `upsert: true`, in which case it is an intentional spawn — the engine creates the target via the `none` creation row (resolving the signal from `none`). So a missing target without `upsert` is a programming error (throw, like an unknown signal name), while a missing target with `upsert` is a declared creation (insert). This is the rebuilt home of today's `actions[]` upsert path.
2. **`block` signal source states.** The table lists `block` from every non-terminal state. Should `block` also be valid from `done` (e.g. to undo a completed action and re-evaluate)? The audit doesn't show a clear case. Defer — if needed, additive to the table.

## Risks

- **Migration cost for existing pre-hooks.** Every pre-hook in consuming apps that returns `{ type, status }` needs to be updated to `{ type, signal }`. The reference project has ~12 such hooks. Each is a mechanical substitution per the table in "Pre-hook returns." Add a build-time validator that flags `status:` keys in pre-hook returns with a clear "use signal instead" error pointing to the migration mapping.
- **Build-time validation of pre-hook signal names.** The engine can't statically verify that a pre-hook's `signal` value is a known signal name without inspecting the pre-hook routine YAML. This is now a nice-to-have rather than a safety net: unknown signal names **throw at runtime** (see "Unknown signal names throw; unlisted transitions no-op"), so a typo'd signal hard-fails the submit instead of silently doing nothing. Build-time linting of pre-hook return literals would move that failure earlier, but is deferrable.
- **The `submit` from `done` source state could surprise reviewers.** A reviewer scanning the FSM table might miss that `done` accepts `submit`. Mitigated by the worked examples in this design and a clear comment in the table itself ("done is terminal for normal completion; accepts deliberate signals for re-edit and cascade revision").
- **Tracker action lifecycle subtly changes.** Tracker actions previously could be force-written to any status; under the new FSM they only listen to four signals. Worth confirming no app currently force-writes a tracker action to a status the FSM doesn't permit. Audit task to add to migration.

## Next step

Once this design is reviewed and committed:

1. Update [engine/design.md](../engine/design.md) Decision 4 to reference this FSM model rather than the priority rule. Decision 4's `error`-setting paths (D4 §503–504) become the `error` signal; the simple `submit_edit + current_status` error path (§504) is dropped. (Engine **D3** — the tracker subscription — is **already** on the signal model: `pushWorkflowStatus` recurses into `emitSignal(tracker, internal_mirror_child_*)` calling the same handler (engine:296 / :370), with the 2-level nested auto-complete worked example already in signal terms (engine:386+). The recursion shape is unchanged from the priority-rule version; no further D3 rewrite is needed.)
2. Update [submit-pipeline/design.md](../submit-pipeline/design.md) Decisions 1 + 3 to remove `force: true` and the interaction → target status table (including the simple `current_status` selector path), replacing both with signal-based resolution.
3. Update [ui/design.md](../ui/design.md) to declare per-template button bars over the signal namespace, and re-spec the `workflow-action-edit` page to surface signal buttons (`submit`, `progress`, `not_required`, …) instead of a status selector. Decide how the check pages surface `error` recovery (a `check-error` page vs. a `resolve_error` button on `workflow-action-view`).
4. Add a build-time validator for pre-hook `status:` → `signal:` migration as part of action-authoring's resolver work.
> **Note (2026-05):** Items 1–4 above have largely been carried out already — engine D3/D4, submit-pipeline D3/D4, ui `workflow-action-edit`, action-authoring's validator, and the parent [design.md](../design.md) (check-action description + worked-example step 9, now `signal: submit` with no selector) all reflect this model. The remaining genuinely-open piece was item 3's sub-question: how the check pages surface `error` recovery. **Resolved (2026-06) by [Part 40 § D4](../../workflows-module/parts/40-simple-action-surfaces/design.md):** a `resolve_error` button on `workflow-action-view`, rendered only at stage `error`; no `check-error` page (ui Decision 7 / Open Question 4 updated).

The parent [design.md](../design.md) "Sub-design" table includes state-machine. Its worked example reads in signal terms (priority rule → FSM, status writes → signals, `submit_edit` → `submit`).
