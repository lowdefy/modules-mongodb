# Workflows State Machine

Replace the priority-rule + `force: true` transition model with a per-state finite-state machine where every status mutation is the result of a named **signal** — whether the signal came from a user clicking a button, an engine subscription, or an author's pre-hook return. The engine ships one FSM table per action kind (form / simple / tracker) mapping `(currentStatus, signal) → newStatus`; signals against non-listening states no-op silently; page templates declare which signals surface as buttons. Authors emit signals to express intent; the engine executes; the priority rule, `force: true`, and the implicit "what status does this interaction land in" lookup all disappear.

This sub-design responds to [`review/critique-concepts.md`](../review/critique-concepts.md) points 1, 2, 4, 5, and 6 — they collapse into one model change once signals are the unifying primitive.

## Proposed change

1. **Per-action-kind FSM tables replace the priority rule.** Each kind has one engine-shipped table mapping `(currentStatus, signal) → newStatus`. Signals fired against non-listening states no-op silently. Tables are engine-internal and not author-overridable in v1.
2. **Signals are the single transition primitive.** User button clicks, engine cascades (auto-unblock, tracker propagation, workflow cancel), and pre-hook `actions[]` returns all emit signals against an action. The FSM resolves uniformly.
3. **Page templates declare which signals surface as buttons.** `edit`, `view`, `review`, `error` templates each ship a button bar that fires named signals. The same signal fired from a button or a pre-hook follows identical FSM resolution.
4. **`force: true` removed.** All mutations go through the FSM. Migrations and admin overrides stay out-of-band (direct DB edits) — same as today. Engine-internal write paths get explicit `internal_*` signal names declared in the default tables.
5. **`save_draft` restored as a first-class interaction.** Submitters persist form data without advancing to review, landing in `in-progress`. Closes the v0 → v1 regression noted in critique § 5.
6. **Pre-hook return shape carries signals, not statuses.** Today's `{ type, status }` becomes `{ type, signal }`. Pre-hook says what to do, engine resolves where to land. Current-action override changes from `{ status }` to `{ signal }` at the response root.

## Supersedes

This sub-design replaces parts of three existing sub-designs:

- **[engine](../engine/design.md) Decision 4** — the priority-order rule and `force: true` per-call/per-entry override. Replaced by FSM tables and signal-emission semantics.
- **[submit-pipeline](../submit-pipeline/design.md) Decision 3** — the interaction → target status table. Replaced by FSM resolution against named signals.
- **[submit-pipeline](../submit-pipeline/design.md) "fixed five-button vocabulary"** — replaced by per-template button declarations over the unified signal namespace.

The other sub-designs ([action-authoring](../action-authoring/design.md), [ui](../ui/design.md), [module-surface](../module-surface/design.md), [action-groups](../action-groups/design.md), [call-api](../call-api/design.md)) are unaffected at the model level — their YAML grammar, page generation, and module API surfaces stay the same.

## Problem

Today's transition model has four entangled pieces:

1. **Status enum with priority order.** Eight statuses ranked `blocked(7) > action-required(6) > in-progress(5) > in-review(4) > changes-required(3) > done(2) > error(1) > not-required(0)`. A status mutation is legal when the new priority is strictly less than the current, with a same-state self-exception for the action being submitted.
2. **A `force: true` escape hatch** that bypasses the rule. Per-call (admin/migration) and per-entry (pre-hook `actions[]` items).
3. **An implicit interaction → target status table** baked into submit-pipeline (`submit_edit` lands `in-review` or `done` depending on whether the action has a `review` verb; `approve` lands `done`; `request_changes` lands `changes-required`; …).
4. **A hard-coded five-button vocabulary** on templates: `submit_edit`, `not_required`, `resolve_error`, `approve`, `request_changes`.

The friction this creates, audited against a reference project and surveyed in `critique-concepts.md`:

- **Resubmit, error recovery, and re-edit-after-done all require `force: true`.** Common flows (resubmit from `changes-required`, recover from `error`, re-edit a `done` action that cascades into dependents) go backward in priority terms. The audit of `/Users/sam/Developer/mrm/prp/apps/shared/workflow_config` found ~17 `force: true` uses, ~half just for backward transitions that the priority rule forbade. These aren't admin edge cases; they're routine.
- **Tracker writes, auto-unblocks, and cancel cascades use `force: true` too.** Engine-internal code paths bypass the rule. The engine has two write paths (priority-gated and force-gated); reviewing engine code requires tracking which path each write takes.
- **Auxiliary writes from pre-hooks (`actions[]`) compete with user-driven writes through the same gate.** The submit payload mixes `currentActionId` (user-driven) with auxiliary entries; both go through the priority check, distinguished only by the self-exception.
- **Custom interactions are locked.** Adding a sixth button (e.g. `save_draft`, which the reference project had as a core lifecycle interaction and the current design lost) requires changing module code in three places — the status enum lookup, the template button bar, the submit-pipeline mapping table.
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

One namespace, twelve signals. The label "interaction" vs "signal" is a metadata question (does any page template surface this signal as a button?), not a separate concept.

### Signal source-state principle

Signals express **intent**. The FSM accepts a signal from any current state where that intent is *coherent*, regardless of who's emitting and regardless of whether the emitter knew the target's current state. The FSM no-op exists for two narrow purposes: structural safety (re-fire against a state that's already past the signal's reach) and semantic contradiction (a state whose meaning rules the signal's intent out).

There are two emitter contexts, and they're gated differently:

- **Signals against the current action** — fired by user button clicks (and pre-hook root-level redirects of the user click). The page template is the user-side gate: button bars only render signals coherent from the action's current state, so users physically can't fire incoherent signals from the UI. The FSM is the second line of defence (and the only one for pre-hook redirects).
- **Signals against other actions** — fired by pre-hook `actions[]` cascades. The emitter doesn't know the target's current state; the target may have moved between the pre-hook's last check and the cascade firing. Narrow source-state lists silently drop the author's intent in exactly the cases the cascade is designed to cover. So the inventory leans broad: `not_required` accepts `in-review` and `error` (cascade case), `activate` accepts almost every state (deliberate cross-state reset), `block` accepts every non-terminal (author re-block).

The exception is `unblock`: it stays narrow (`blocked` only) precisely because broadening it would let the engine's post-transition `blocked_by` walk regress done or in-progress siblings on a re-fire. Re-fire safety is the structural guarantee priority-rule used to provide; for `unblock` specifically, narrowness is what preserves it. The rest of the table is broad.

### Interactions — surfaced as buttons by at least one page template

| Signal              | Source states (form kind)                                       | Target            | Notes                                                                                                  |
| ------------------- | --------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| `submit_edit`       | `action-required`, `in-progress`, `changes-required`, `done`    | `in-review` or `done` | Lands `in-review` if the action's `access.{app_name}` lists `review`; else `done`. Source `done` covers re-edit of a completed action. |
| `save_draft`        | `action-required`, `in-progress`                                | `in-progress`     | Persists `form_data` without advancing. Restores v0 behaviour (critique § 5).                          |
| `not_required`      | `action-required`, `in-progress`, `changes-required`, `blocked`, `in-review`, `error` | `not-required`    | Broad source list — pre-hook cascades like `mark-quote-not-required` shouldn't drop on whichever current-state outcomes the author didn't anticipate. User-side gating is the page template's job (only the edit template shows this button).               |
| `approve`           | `in-review`                                                     | `done`            | Reviewer button on the review template.                                                                |
| `request_changes`   | `in-review`, `done`                                             | `changes-required` | Button on review template (from `in-review`); cascade signal from `done` for revise-after-done flows. |
| `resolve_error`     | `error`                                                         | `in-review`       | Button on the error template. Default landing is `in-review` so the resolver re-evaluates the submission. |

### Signals — engine and pre-hook emitters only, no button

| Signal                            | Source states                                                                         | Target            | Emitter                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unblock`                         | `blocked`                                                                             | `action-required` | Engine (on `blocked_by` satisfaction) + pre-hooks (when the target is known-blocked). Narrow by design — firing it against a non-blocked target no-ops, which keeps `blocked_by` re-evaluation structurally safe against accidentally regressing done/in-progress siblings.                                                                                                                                          |
| `block`                           | `action-required`, `in-progress`, `in-review`, `changes-required`, `error`            | `blocked`         | Pre-hooks only. The engine does not auto-block on `blocked_by` dep regression — once unblocked, an action stays unblocked unless an author explicitly re-blocks it. Authors who want a dependent to re-block on dep regression emit `block` explicitly from the dep's pre-hook.                                                                                                                                  |
| `activate`                        | `blocked`, `in-progress`, `in-review`, `changes-required`, `error`, `done`            | `action-required` | Pre-hooks. The broad "make this actionable, whatever its current state" signal. Used by cascade hooks where the target state is uncertain or deliberately overridden (e.g. issue-resolve resetting a `done` action). Authors reach for `activate` over `unblock` when they want the broader reach; `unblock` stays narrow so engine `blocked_by` re-evaluation can't accidentally regress done/in-progress siblings. |
| `internal_cancel_action`          | `action-required`, `in-progress`, `in-review`, `changes-required`, `error`, `blocked` | `not-required`    | Engine `CancelWorkflow` cascade. Not for pre-hook use.                                                                                                                                                                                                                                                                                                                                                               |
| `internal_mirror_child_active`    | `blocked`, `action-required`, `done`, `not-required` (tracker kind only)              | `in-progress`     | Engine tracker subscription. Not for pre-hook use. Reaches `done`/`not-required` so the parent recovers if the child uncancels or re-activates after the tracker had landed terminal (resolves the "child uncancel" recovery path engine D4 previously needed `force: true` for).                                                                                                                                  |
| `internal_mirror_child_completed` | `blocked`, `action-required`, `in-progress`, `not-required` (tracker kind only)       | `done`            | Engine tracker subscription. Not for pre-hook use. Reaches `not-required` so a parent that landed cancelled before the child completed can recover.                                                                                                                                                                                                                                                               |
| `internal_mirror_child_cancelled` | `blocked`, `action-required`, `in-progress`, `done` (tracker kind only)               | `not-required`    | Engine tracker subscription. Not for pre-hook use. Reaches `done` so a parent that completed before the child was cancelled can recover.                                                                                                                                                                                                                                                                          |

The `internal_*` prefix is convention, not enforcement. Authors reading the table immediately see "don't fire these from my pre-hooks" without the engine having to gate it. If a real case for author-emitted `cancel_action` appears later, the prefix gets dropped and the table is unchanged.

### Terminal states

`done` and `not-required` are terminal for the normal completion path but not strictly terminal in the FSM sense. Each kind treats them slightly differently:

- **Form kind.** `done` accepts deliberate backward signals (`submit_edit`, `request_changes`, `activate`) for re-edit / revise / re-open cases. `not-required` accepts no form-kind signals — for form actions, "this case doesn't apply" is a sticky decision; undoing it is an out-of-band admin edit.
- **Tracker kind.** Both `done` and `not-required` accept `internal_mirror_child_*` signals so the parent can recover when the child re-activates or completes after the tracker had landed terminal. Tracker terminality is always conditional on the child's terminality; if the child reverses, the tracker reverses.

## FSM tables per kind

### Form kind

| Current ↓ / Signal →   | `submit_edit`           | `save_draft`     | `not_required`   | `approve` | `request_changes`  | `resolve_error` | `unblock`        | `activate`          | `block`   | `internal_cancel_action` |
| ---------------------- | ----------------------- | ---------------- | ---------------- | --------- | ------------------ | --------------- | ---------------- | ---------------- | --------- | -------------- |
| `blocked`              | —                       | —                | `not-required`   | —         | —                  | —               | `action-required`| `action-required`| —         | `not-required` |
| `action-required`      | `in-review` or `done`   | `in-progress`    | `not-required`   | —         | —                  | —               | —                | —                | `blocked` | `not-required` |
| `in-progress`          | `in-review` or `done`   | `in-progress`    | `not-required`   | —         | —                  | —               | —                | `action-required`| `blocked` | `not-required` |
| `in-review`            | —                       | —                | `not-required`   | `done`    | `changes-required` | —               | —                | `action-required`| `blocked` | `not-required` |
| `changes-required`     | `in-review` or `done`   | —                | `not-required`   | —         | —                  | —               | —                | `action-required`| `blocked` | `not-required` |
| `error`                | —                       | —                | `not-required`   | —         | —                  | `in-review`     | —                | `action-required`| `blocked` | `not-required` |
| `done`                 | `in-review` or `done`   | —                | —                | —         | `changes-required` | —               | —                | `action-required`| —         | —              |
| `not-required`         | —                       | —                | —                | —         | —                  | —               | —                | —                | —         | —              |

### Simple kind

Same as form kind, with one specialization on `submit_edit`: the simple-edit page surfaces a status selector, and the payload carries `target_status`. The FSM accepts `submit_edit` from `action-required` / `in-progress` / `changes-required` / `done` with `target_status ∈ { done, blocked, error, not-required }` — engine validates the selector picked a status listed in the kind's allowed-submission targets and routes the transition. This is the one piece of FSM dynamism in v1 (one signal, runtime-selected target from a fixed set).

Authors don't see this in YAML — the simple-edit template renders the selector with the allowed options baked in.

### Tracker kind

Tracker actions never receive user interactions or pre-hook signals. Their FSM has one source — the engine's tracker subscription firing `internal_mirror_child_*` signals — plus `unblock` for the standard `blocked_by` flow.

| Current ↓ / Signal →   | `unblock`         | `internal_mirror_child_active` | `internal_mirror_child_completed` | `internal_mirror_child_cancelled` | `internal_cancel_action` |
| ---------------------- | ----------------- | ------------------------------ | --------------------------------- | --------------------------------- | -------------- |
| `blocked`              | `action-required` | `in-progress`                  | `done`                            | `not-required`                    | `not-required` |
| `action-required`      | —                 | `in-progress`                  | `done`                            | `not-required`                    | `not-required` |
| `in-progress`          | —                 | —                              | `done`                            | `not-required`                    | `not-required` |
| `done`                 | —                 | `in-progress`                  | —                                 | `not-required`                    | —              |
| `not-required`         | —                 | `in-progress`                  | `done`                            | —                                 | —              |

No `submit_edit`, `approve`, `request_changes`, `error`, `activate`, or `block` — tracker actions don't expose these paths.

## How signals get emitted

Three paths into the FSM. Identical resolution.

### Path 1 — User clicks a button

Pages render button bars (see "Templates and buttons" below). A button click hits the `update-action-{action_type}` endpoint with `signal: <name>` in the payload. Engine resolves `transitions[action.status][signal]`; transitions or no-ops.

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
  signal: <name>                   # override the current-action signal (optional)
  actions:                         # emit signals against other actions (optional)
    - { type: <action_type>, signal: <name> }
    - { workflow_id: <id>, type: <action_type>, signal: <name> }
    - { action_id: <id>, signal: <name> }       # by primary key
  event_overrides: { ... }
  form_overrides: { ... }
```

**Pre-hook semantics, signal-by-signal:**

- `signal:` at the root — replaces the user-clicked interaction for the current action. The pre-hook on `submit_edit` can return `signal: not_required` to redirect the submission. Engine fires the replacement signal against the current action; FSM resolves.
- `actions[]` — auxiliary signals against other actions. Each entry identifies a target (by `type` + workflow context, or by `action_id`) and the signal to fire. Engine fires each against the target's FSM; non-listening targets no-op silently.

The shape change from today's `{ type, status }` to `{ type, signal }` is the one author-visible YAML break. Migration is mechanical:

| Today                                            | After                                              |
| ------------------------------------------------ | -------------------------------------------------- |
| `{ type: send-quote, status: action-required }` | `{ type: send-quote, signal: unblock }`            |
| `{ type: send-quote, status: not-required }`    | `{ type: send-quote, signal: not_required }`       |
| `{ type: send-quote, status: blocked }`         | `{ type: send-quote, signal: block }`              |
| `{ type: send-quote, status: changes-required, force: true }` | `{ type: send-quote, signal: request_changes }` |
| `{ type: send-quote, status: action-required, force: true }`  | `{ type: send-quote, signal: activate }` |

Pre-hooks lose `force: true`. They gain expressive signal names. The engine's resolution is now deterministic from the table.

## Templates and buttons

Page templates each declare which signals to surface as buttons. The button click hits `update-action-{action_type}` with `signal: <name>` and the rest of the payload (form data, current_status for simple actions, etc.).

**Default v1 button bars:**

| Template | Signals surfaced                                    | Notes                                                                            |
| -------- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| `edit`   | `submit_edit`, `save_draft`, `not_required`         | The submitter's working surface.                                                 |
| `view`   | `request_changes` (modal for comment), navigation to `edit` | Default landing for `done` actions. "Edit" is navigation, not a signal. |
| `review` | `approve`, `request_changes`                        | The reviewer's surface.                                                          |
| `error`  | `resolve_error`                                     | The error-handler's surface.                                                     |

Per-action overrides happen at the template level (apps that customize templates pick the button bar they want); the FSM is unchanged. If an app wants a "Mark not required" button on the view page too, the template adds `not_required` to its button bar — no engine work.

`save_draft` is the v0 → v1 regression restoration. The button is `template-shipped on the edit template`, fires the `save_draft` signal, which routes `action-required → in-progress` and `in-progress → in-progress`. `form_data` writes persist on every save; the log event is a lightweight `draft_saved` entry (or suppressed, at the author's choice via `event_overrides`).

## What disappears

- **The priority order** as a runtime concept. Statuses are still ranked for display purposes (the status enum still orders them in pickers and visualizations), but the runtime does not consult priority numbers to decide legality.
- **`force: true`**, both per-call and per-entry. Removed from `SubmitWorkflowAction` payload, removed from `actions[]` entry shape, removed from engine handler. Migrations and admin overrides remain out-of-band (direct DB writes, same as today).
- **The "interaction → target status" table** baked into submit-pipeline. Replaced by FSM resolution.
- **The same-state self-exception.** No longer needed — the FSM tables list same-state transitions explicitly where they're wanted (e.g. `in-progress → save_draft → in-progress`).
- **The "actions[] with status" pre-hook return shape.** Replaced by signal-based shape.

## What gets added

- **The FSM tables themselves** — three small lookup tables (form, simple, tracker), engine-internal data.
- **The `save_draft` signal and `in-progress`-landing transition** — restoration of v0 capability.
- **`activate` and `block` signals** — explicit names for cascade patterns previously written as `force: true`. `activate` complements the narrow `unblock` for cases where the cascade is deliberate across multiple source states.
- **`internal_*` signal names** — `internal_cancel_action`, `internal_mirror_child_*` — replacing today's nameless engine code paths.

## Worked examples

**1. Resubmit after request_changes.**

- User on `changes-required` action sees the edit template (because `changes-required` is in the edit template's source-state list).
- Clicks Submit → fires `submit_edit`.
- FSM: `changes-required → submit_edit → in-review` (assuming review verb declared).
- No `force` needed. Today's flow required `force: true` because `in-review(4) > changes-required(3)`.

**2. Issue-resolve cascade.**

- Maintenance-report action is `error`. Escalator opens its `error` template, clicks "Resolve error."
- The action's pre-hook on `resolve_error` runs (the escalator-supplied recovery logic).
- Pre-hook returns:
  ```yaml
  :return:
    actions:
      - { type: technician-on-site, signal: activate }
      - { action_id: <self>, signal: activate }     # also activate the maintenance-report itself
  ```
- Engine fires `activate` against `technician-on-site` (currently `in-progress` → `action-required`) and against the maintenance-report (currently `error` → `action-required`).
- The current-action signal `resolve_error` would normally land in `in-review` per the table; the pre-hook's signal-redirect via `{ signal: activate }` at the response root replaces it. Today's `force: true` becomes a named cascade.

**3. Edit-after-done cascade.**

- Initial-details action is `done`. User opens its view page, clicks "Edit" (navigation to edit template, no signal fires).
- User modifies the form, clicks Submit → fires `submit_edit`.
- FSM: `done → submit_edit → in-review`.
- Pre-hook on the form action's `submit_edit` cascades:
  ```yaml
  :return:
    actions:
      - { type: allocation, signal: request_changes }     # was done, now changes-required
  ```
- FSM resolves `allocation`'s state: `done → request_changes → changes-required`. Today this needed `force: true`; now it's a declared transition.

**4. Mark-quote-not-required cascade.**

- Author models a thin form action `mark-quote-not-required` with a single-button edit page.
- Its pre-hook on `submit_edit`:
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

1. **Pre-hook current-action redirect via `{ signal }` at the response root — concrete enough?** Today's pre-hooks return `{ status }` to override. The proposed `{ signal }` shape is a one-for-one replacement, but worth verifying with one or two concrete authoring scenarios before locking it in. Probable answer: yes, but flag for spec review.
2. **Should the engine validate signal targets at fire time?** A pre-hook emitting `{ type: nonexistent, signal: unblock }` could either throw or no-op. Today's `actions[]` throws on missing targets. Recommend keeping that behaviour — missing target is a programming error, not a soft no-op like unlisted transitions.
3. **`block` signal source states.** The table lists `block` from every non-terminal state. Should `block` also be valid from `done` (e.g. to undo a completed action and re-evaluate)? The audit doesn't show a clear case. Defer — if needed, additive to the table.

## Risks

- **Migration cost for existing pre-hooks.** Every pre-hook in consuming apps that returns `{ type, status }` needs to be updated to `{ type, signal }`. The reference project has ~12 such hooks. Each is a mechanical substitution per the table in "Pre-hook returns." Add a build-time validator that flags `status:` keys in pre-hook returns with a clear "use signal instead" error pointing to the migration mapping.
- **Build-time validation of pre-hook signal names.** The engine can't statically verify that a pre-hook's `signal` value is a known signal name without inspecting the pre-hook routine YAML. v1 accepts this — unknown signals at runtime fire no-ops, same as unlisted transitions. If diagnostics become an issue, future work could lint pre-hook return literals.
- **The `submit_edit` from `done` source state could surprise reviewers.** A reviewer scanning the FSM table might miss that `done` accepts `submit_edit`. Mitigated by the worked examples in this design and a clear comment in the table itself ("done is terminal for normal completion; accepts deliberate signals for re-edit and cascade revision").
- **Tracker action lifecycle subtly changes.** Tracker actions previously could be force-written to any status; under the new FSM they only listen to four signals. Worth confirming no app currently force-writes a tracker action to a status the FSM doesn't permit. Audit task to add to migration.

## Next step

Once this design is reviewed and committed:

1. Update [engine/design.md](../engine/design.md) Decision 4 to reference this FSM model rather than the priority rule.
2. Update [submit-pipeline/design.md](../submit-pipeline/design.md) Decisions 1 + 3 to remove `force: true` and the interaction → target status table, replacing both with signal-based resolution.
3. Update [ui/design.md](../ui/design.md) to declare per-template button bars over the signal namespace.
4. Add a build-time validator for pre-hook `status:` → `signal:` migration as part of action-authoring's resolver work.

The parent [design.md](../design.md) "Sub-design" table grows by one row (state-machine). The worked example in the parent stays correct — its semantics don't change; only the names of a few engine concepts (priority rule → FSM, status writes → signals) shift.
