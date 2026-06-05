# Part 39 — Form-action submit buttons: interaction → signal

**Layer:** module page templates + module enum data + concept-doc reconciliation. **Size:** M. **Repo:** `modules/workflows/templates/`, `modules/workflows/enums/`, concept docs.

The four form-action page templates (`edit` / `view` / `review` / `error`) still fire the **old interaction model** — their `CallAPI` payloads hardcode `interaction: submit_edit`, `interaction: not_required`, etc., and their button visibility is ad-hoc (e.g. `not_required` gates on a hand-rolled priority lookup). The engine moved to the **signals + FSM** model ([state-machine](../../../workflows-module-concept/state-machine/design.md), implemented by [Part 38](../38-engine-rebuild/design.md)): the wire field is `signal:`, the engine resolves each signal through a per-kind FSM table, and the priority rule is gone. This part rewrites the form-action button bars to fire signals (`submit`, `not_required`, `approve`, `request_changes`, `resolve_error`), adds the v0 draft-save button — now the first-class **`progress`** signal — and derives each button's visibility from the FSM's source-states so a button is shown exactly when its signal is coherent from the action's current stage. The button-bar prose in [`ui`](../../../workflows-module-concept/ui/design.md) and [`submit-pipeline`](../../../workflows-module-concept/submit-pipeline/design.md) was already migrated to signals in the concept reconciliation commit; the residual is recording this part's `view` bar and `onProgress` verb in `ui`'s button table and Decision 4.

Simple-action button surfaces (the shared `workflow-action-edit` / `workflow-action-view` / `workflow-action-review` pages) are **out of scope** — they move to a sibling design (see [Simple actions are separate](#simple-actions-are-separate)). Note the simple-kind FSM is now *identical* to the form-kind FSM (no status selector, no `target_status`), so the two surfaces share the same signal vocabulary and visibility map — see the section for why they're still split.

## Proposed change

1. **Payload field `interaction:` → `signal:`** in every form-template button's `CallAPI` payload, and `interaction: submit_edit` → `signal: submit`. The button names what the user fired; the engine's FSM resolves the target stage. No interaction→target-status logic on the page (it never belonged there; the engine owns it now). `submit` is nullary — no `target_status` from any kind.
2. **Add the `progress` button to `edit.yaml.njk`** (titled "Save Draft"). Fires `signal: progress`, persists `form` (not `fields` — owned by Part 24, see D1) without form validation, lands `in-progress`. Restores the v0 capability the signal model reintroduced ([state-machine](../../../workflows-module-concept/state-machine/design.md) §5; `progress` was `save_draft` in v0).
3. **Button visibility derives from the FSM source-states.** The module ships a `form` signal→source-stages map; each button is visible iff the action's current stage is in that signal's source list (AND the role gate passes AND the author hasn't hidden it). Replaces the per-button `visible` default-true knob and the `not_required` priority-lookup hack.
4. **`view.yaml.njk` gains a button bar** carrying `request_changes` (with a comment modal) and an Edit-nav button, per [state-machine](../../../workflows-module-concept/state-machine/design.md)'s default `view` bar — the revise-after-`done` path. This is the one net-new surface; the other three templates are rewrites.
5. **Reconcile the concept docs.** The button-bar prose in [`ui`](../../../workflows-module-concept/ui/design.md) and [`submit-pipeline`](../../../workflows-module-concept/submit-pipeline/design.md) was already migrated to signals in the concept reconciliation commit; the residual edits are adding the `view` / `request_changes` row and setting the `progress` row's handler to `onProgress` in `ui` Decision 2's button table, and growing `ui` Decision 4's locked verb list to five (see [Concept-doc reconciliation](#concept-doc-reconciliation)).
6. **No `force`, no priority rule, anywhere in the templates.** Both concepts are gone from the engine; the templates stop expressing them.

## Why a dedicated part

Part 38 (engine rebuild) owns the engine, the `makeWorkflowApis` resolver (which now emits the endpoint expecting `signal` and drops `force`), the display surfaces, and the **demo's** `workflow_config` migration. It does **not** list the module `.yaml.njk` templates in its files-changed — the shipped button bars are an orthogonal surface. Threading a four-template rewrite + a new `progress` button + a new visibility mechanism through an already-XL engine part would dilute its review. The work here is self-contained: four template edits, one enum file + guard test, and a bounded set of concept-doc reconciliations.

This part **depends on Part 38's signal contract** — the generated `update-action-{action_type}` endpoint must accept `signal` (and no longer require `interaction` / `force`). It sequences after Part 35 (`kind: task` → `simple`, so the FSM keys on `simple`) and with/after Part 38.

It also **depends on Part 24's universal-fields decoupling.** Part 24 rewrote form-kind universal fields (`assignees` / `due_date` / `description`) to be written by their own operation (`update-action-fields-{action_type}` → `UpdateActionFields`) via a sidebar card with its own Update button. So every writable form-kind payload in this part drops `fields` — `submit` / `progress` / `not_required` on `edit` (D1, D2), `approve` / `request_changes` on `review`, and `resolve_error` on `error` — and each button **that has a `Validate` step** narrows its regex to drop `^fields\.` (so `edit`'s `submit` validates `^form\.`, `review`'s `approve` validates `^form_review\.`, `error` validates `^form\.`); `not_required` (no `Validate`) and `request_changes` (comment-presence `Validate`, not a `^fields\.` regex) are payload-only drops. **This is hygiene, not a correctness precondition.** Part 24's field-write guard is **kind-based**: `planActionTransition.js` writes the universal fields only for `kind: simple`; for `kind: form` it never touches `assignees` / `due_date` / `description`, regardless of whether `payload.fields` is present (Part 24 design line 147; Part 38 line 558). So a stale `fields` bag from a form submit is *ignored*, not clobbered — the decoupling cannot be defeated by a stray payload, by design (CLAUDE.md "one correct way": the protection doesn't depend on every caller remembering to omit the key). Dropping `fields` here is therefore about not posting dead state and not firing a spurious `^fields\.` validation on inputs the form submit doesn't own — not about preventing a clobber. (Simple-kind pages are out of scope and keep writing `fields` on submit; this change is form-templates-only.)

## Current state

Verified against the shipped templates (`modules/workflows/templates/`):

- **`edit.yaml.njk`** — floating-actions bar with two buttons: `button_submit_edit` (payload `interaction: submit_edit`, lines ~242–261) and `button_not_required` (payload `interaction: not_required`, lines ~310–327). `submit_edit` visibility is `page_config.buttons.submit_edit.visible` (default `true`) AND `action_allowed.edit` (the per-verb key — `action_role_check` writes `_state.action_allowed` as `{ view, edit, review, error }`). `not_required` visibility AND's a `_js` priority lookup (`statuses[stage].priority > 0`) — a direct expression of the priority rule. Each button's `onClick` runs `Validate` → author `onSubmit` → `CallAPI`, or opens a confirm modal if `page_config.buttons.{name}.modal` is set. **No Save Draft button.**
- **`review.yaml.njk`** — `approve` / `request_changes` buttons, payloads carry `interaction:`.
- **`error.yaml.njk`** — single `resolve_error` button, payload carries `interaction:`.
- **`view.yaml.njk`** — read-only, no button bar (line 14: "View is read-only — no buttons").

The concept docs ([`ui`](../../../workflows-module-concept/ui/design.md) Decisions 2/4/7, [`submit-pipeline`](../../../workflows-module-concept/submit-pipeline/design.md) Decision 3) are **already on the signal model** — reconciled in the `workflows-module-concept` commit. The residual doc edits are a `view` row and the `progress`-row handler (`onProgress`) on `ui` D2's button table, plus `ui` D4's verb count (now five) (see [Concept-doc reconciliation](#concept-doc-reconciliation)).

## Decisions

### D1 — Buttons fire signals; the engine resolves the target

A form button's job shrinks: name the signal, send the payload, let the engine's FSM decide where the action lands. The page no longer carries any interaction→status mapping.

```yaml
# edit.yaml.njk — submit button onClick (else branch, post-rewrite)
- id: validate
  type: Validate
  params: { regex: [^form\.] }   # universal fields owned by Part 24's sidebar op — not validated here
- _var: { key: page_config.events.onSubmit, default: [] }   # author page logic, unchanged
- id: submit
  type: CallAPI
  params:
    endpointId:
      _module.endpointId:
        _build.string.concat: [update-action-, { _var: action_config.type }]
    payload:
      action_id: { _state: action._id }
      signal: submit               # ← was `interaction: submit_edit`
      current_key: { _state: action.key }
      form: { _state: form }
      comment: { _state: comment }
      # no `fields:` — form-kind universal fields are written by Part 24's
      # update-action-fields-{action_type} op, not by submit (see "Why a dedicated part")
```

**Both payload copies migrate.** The sample above is the `onClick` *else*-branch copy (no modal configured). Every button whose `page_config.buttons.{name}.modal` is set renders a **second**, independent copy of the same `CallAPI` payload + `Validate` step inside the confirm-modal's `onOk`. So each migration item in this part — `interaction:` → `signal:`, the `fields` drop, the `form_review` drop on `error`, and the `Validate`-regex narrowing — must be applied to **both** copies wherever a `.modal` variant exists (`submit`/`not_required` on `edit`, `approve` on `review`, `resolve_error` on `error`). `progress` has no modal, so D2 has a single copy.

`submit` is **nullary** — it sends no `target_status`. The engine derives `in-review` vs `done` from `access.{app_name}` containing `review` ([state-machine](../../../workflows-module-concept/state-machine/design.md) form FSM), for both form and simple kinds. The v0 workflow-action-edit status selector and its `target_status`/`current_status` payload are gone (state-machine §"What disappears").

**Why `fields` drops but `form` stays.** The `fields`-drop hygiene (Part 24 dependency, above) removes a key submit no longer owns: Part 24 relocated universal-field writes to `update-action-fields-{action_type}`, so a `fields` bag on a form submit is genuinely dead — a different op owns those writes and the kind-based guard ignores it. `form` is the opposite and stays on **every** writable payload, including the display surfaces (`review`'s `approve` / `request_changes`, `view`'s `request_changes`). Two reasons: (1) `form` is **editable in place** on the review surface — a reviewer may amend the submitted form, not only `form_review` — so `payload.form` can carry real edits; and (2) even unchanged, the engine consumes `payload.form` **signal-agnostically** — Part 38's `planFormDataMerge` merges `params.form → params.form_review → form_overrides` (uniform deep-merge per Part 38 Q6) into `workflow.form_data.{action}` and exposes the result as `submitted_form`, the event-render binding. So `form` is a live input on every signal, not primed-then-resent dead state; the `fields`-vs-`form` asymmetry is principled, not accidental.

The signals each template fires:

| Template | Buttons (signals) | Notes |
| -------- | ----------------- | ----- |
| `edit`   | `submit`, `progress`, `not_required` | Submitter's working surface. |
| `view`   | `request_changes` (comment modal), Edit (navigation) | Default landing for `done`; D4. |
| `review` | `approve`, `request_changes` | Reviewer's surface. |
| `error`  | `resolve_error` | Error-handler's surface. |

This is exactly [state-machine](../../../workflows-module-concept/state-machine/design.md)'s "Default v1 button bars" table — this part is its implementation on the shipped templates.

**The `error` signal is not a button.** state-machine.md's new `error` signal (`→ error`) is **pre-hooks only** — it replaces the v0 `actions: [{ status: error }]` return and never appears on a template bar (the engine never self-sets `error`; thrown hooks surface as API-level reject/error toasts). It needs no work here; it's an engine/pre-hook surface owned by Part 38. Flagged so a reviewer doesn't expect an "error" button.

### D2 — `progress` button (edit only, titled "Save Draft")

`progress` is the first-class signal that restores v0's `save_draft`: `action-required → in-progress` and `in-progress → in-progress`, persisting `form_data` without advancing to review.

The button:

```yaml
- id: button_progress
  type: Button
  visible:
    _and:
      - _var: { key: page_config.buttons.progress.visible, default: true }
      - _array.includes:
          - _ref: { path: enums/button_signal_sources.yaml, key: progress }   # build-time: [action-required, in-progress]
          - _state: action.status.0.stage                                      # runtime: this action's current stage
      - _eq: [{ _state: action_allowed.edit }, true]   # per-verb role gate — this template's verb (see D3)
  properties: { title: Save Draft, type: default }
  events:
    onClick:
      - _var: { key: page_config.events.onProgress, default: [] }   # author draft-time page logic
      - id: progress
        type: CallAPI
        params:
          endpointId:
            _module.endpointId:
              _build.string.concat: [update-action-, { _var: action_config.type }]
          payload:
            action_id: { _state: action._id }
            signal: progress
            current_key: { _state: action.key }
            form: { _state: form }
            # no `fields:` — universal fields owned by Part 24's sidebar op (see submit, D1)
```

One deliberate departure from the `submit` button:

- **No `Validate` step.** A draft is intentionally partial; validating it would defeat the purpose. The submitter saves what they have.

Otherwise `progress` mirrors `submit`'s shape: it fires its own author event verb — **`onProgress`** — before the engine call, for draft-time page-state work, then calls the endpoint. A draft save is a distinct semantic from a submit, so it gets its own hook rather than reusing `onSubmit` (whose validate/payload-building logic doesn't belong on a draft) or firing nothing (which would make `progress` the one silent button — see D5).

`progress`'s log event is a lightweight `progress_saved` entry (or suppressed via the author's `event_overrides`), per state-machine §"Templates and buttons" — that behaviour is engine-side (Part 38's `planEventDispatch`), not template-side; the template only fires the signal. On the **simple** pages (sibling design) the same `progress` signal means "mark started"; the button reuse is why the FSM treats form and simple identically.

### D3 — Button visibility derives from the FSM source-states

state-machine.md makes the page template the user-side gate: a button bar should "only render signals coherent from the action's current state," with the FSM as the second line of defence. Part 38 D13(3) makes that gate matter — a **user-driven** signal with no FSM entry **throws** (not a silent no-op). So a button shown from a stage the signal can't fire from produces a user-facing error. Visibility must track the FSM.

Today each button hand-rolls its own visibility (default-true knob; `not_required`'s priority lookup). That drifts from the FSM by construction. Per "one correct way," visibility derives from a single source: the **button-signal→source-stages map**. Because the form and simple FSM tables are now identical (state-machine.md), one map serves both kinds — the simple sibling design reuses it unchanged.

**Mechanism.** The module ships `modules/workflows/enums/button_signal_sources.yaml`, read at build time via `_ref` (not loaded into a runtime global — there is no enum→`global` wiring in this module, and this module already does build-time enum lookups via `_ref`, e.g. the `not_required` priority hack this replaces, `edit.yaml.njk:276`):

```yaml
# enums/button_signal_sources.yaml — source-stages for each button-surfaced signal
# (form and simple kinds share this table; derived from the FSM in shared/fsm/tables.js)
submit:          [action-required, in-progress, changes-required, done]
progress:        [action-required, in-progress]
not_required:    [action-required, in-progress, changes-required, blocked, in-review, error]
approve:         [in-review]
request_changes: [in-review, done]
resolve_error:   [error]
```

(The `error` signal is omitted — it is pre-hooks-only and never surfaced as a button, per D1.)

Each button's `visible` becomes a three-way AND — **author opt-out**, FSM source-stage membership, and the **per-verb role gate**. `action_role_check` (the shared onMount component, Part 34 D8 / Part 38 task 8) writes `_state.action_allowed` as a **map of per-verb booleans** — `{ view, edit, review, error }` — and each template tests its own verb's key, preserving what the shipped buttons already do (`edit.yaml.njk` tests `action_allowed.edit`, `review.yaml.njk` `action_allowed.review`, `error.yaml.njk` `action_allowed.error`; the new `view` bar tests `action_allowed.view`, D4). Note the gate returns `false` for any verb absent from the action's `access.{app_name}` map — there is no coarse "any access" boolean.

```yaml
visible:
  _and:
    - _var: { key: page_config.buttons.submit.visible, default: true }
    - _array.includes:
        - _ref: { path: enums/button_signal_sources.yaml, key: submit }   # build-time constant list
        - _state: action.status.0.stage                                   # runtime: loaded action's stage
    - _eq: [{ _state: action_allowed.edit }, true]   # this template's verb: edit / review / error / view
```

**Build-time list, runtime test.** The source-stage list is a constant resolved by `_ref` when `makeActionPages` renders the template, so it's baked into the generated page. The *membership check* against `action.status.0.stage` must run at runtime: `makeActionPages` generates one page per action **type**, not per stage, so a single `edit` page serves an action across `action-required` / `in-progress` / `changes-required` (exactly the stages the stale-URL guard's allowlist spans), and the loaded action's current stage is only known when an instance opens the page. This is why the test is `_array.includes` (runtime) rather than `_build.array.includes` — one operand (the stage) isn't a build-time value.

The author can still *hide* a button (`page_config.buttons.X.visible: false`), but cannot *show* one the FSM would reject — the source-stage check always applies. This kills the `not_required` `_js` priority lookup outright.

**Per-instance opt-out defaults.** The opt-out default is set per button-*instance*, not per signal — core-flow buttons default shown, "extra-capability" buttons default opt-in (hidden). The same signal can default differently on different templates (`request_changes` is core on `review`, optional on `view`):

| Template | Button | Signal | Default `visible` |
| -------- | ------ | ------ | ----------------- |
| `edit`   | `button_submit`          | `submit`          | `true` |
| `edit`   | `button_progress`        | `progress`        | `true` |
| `edit`   | `button_not_required`    | `not_required`    | **`false` (opt-in)** |
| `review` | `button_approve`         | `approve`         | `true` |
| `review` | `button_request_changes` | `request_changes` | `true` |
| `error`  | `button_resolve_error`   | `resolve_error`   | `true` |
| `view`   | `button_request_changes` | `request_changes` | **`false` (opt-in)** |

`not_required` is opt-in for safety — "this action doesn't apply" should be a deliberate per-action capability, not shown on every edit page where the author must remember to disable it on mandatory actions. `view`'s `request_changes` is opt-in because it's an extra revise-after-done affordance, not core to the read-only landing surface. The Edit-nav `Link` on `review`/`view` isn't part of this map — it renders when `page_ids.edit` is set and the user has edit access (navigation, not a gated signal button).

**Opt-out accepts an operator expression, not just a boolean.** `page_config.buttons.X.visible` (and `.disabled`) are operator-evaluated block fields: an author may set them to a boolean *or* any Lowdefy operator expression (e.g. `{ _eq: [{ _state: some_field }, 'ready'] }`). The template injects the author's value verbatim via `_var` and AND-combines it with the FSM and role gates, so an author expression can only ever *further restrict* visibility — it can never show a button the FSM or role would reject. No dedicated "additional condition" slot is needed; the existing opt-out key carries it. The only implementation requirement: `makeActionPages` (and Part 36's future button-config validator) must pass these values through untouched — not coerce them to booleans or reject a non-boolean — so author expressions survive into the generated page.

**Single source of truth + guard.** The enum duplicates information the engine's FSM `form` table (`shared/fsm/tables.js`, Part 38) already encodes — a signal's source-stages are the **stored statuses** where `table[stage][signal]` is defined, excluding the table's `none` row (the transient creation-time sentinel, never a stored status; its `request_changes` entry serves the upsert-spawn path, not a button). A unit test asserts the enum matches the table's derivable sources, so the two can't drift silently. For a six-signal map this hand-maintained-plus-guard approach is the right weight (same reasoning as Part 36's `RESERVED_BUTTON_IDS` duplication). Generating the enum from the table at build time is heavier than the duplication is worth; deferred unless the table grows author-overridable (a state-machine non-goal).

**Guard test placement.** The FSM table lives in the plugin package; the enum in the module. The guard lives **in the module's** test suite (alongside `resolvers/makeActionPages.test.js`) — it reads the local `enums/button_signal_sources.yaml` and `import`s the FSM table from the plugin package, asserting each signal's stage list equals the stages where `formTable[stage][signal]` is defined. The test fails the build if either side drifts. Module placement follows the natural dependency direction — the module already depends on the plugin (`@lowdefy/modules-mongodb-plugins`, manifest `plugins:`), so importing a plugin export is normal; a plugin test reading a sibling module's source file would be reverse coupling. **This part adds the plugin package's public export for the `form` FSM table.** Part 38 creates `src/connections/shared/fsm/tables.js`, but its design only exports the tables at the module level — the package `exports` map (`./actions`, `./blocks`, `./connections`, `./metas`, `./types`) has no entry for them, so the only import path today is a deep dist path riding the `./*` catch-all (the reach-into-internals coupling #7 moved away from). Rather than load that contract onto the already-XL Part 38, this part adds a dedicated `./fsm` entry to the package `exports` map (`"./fsm": "./dist/connections/shared/fsm/tables.js"`) so the module's guard test imports a stable public export (`@lowdefy/modules-mongodb-plugins/fsm`) rather than a file path. This part sequences with/after Part 38, so `tables.js` exists by the time the export is added.

### D4 — `view.yaml.njk` gains a button bar

state-machine.md's default `view` bar surfaces `request_changes` (the `done → changes-required` revise-after-done path) behind a comment modal, plus an Edit button that *navigates* to the edit page (navigation, not a signal). The shipped view template is read-only with no bar, so this is the one net-new surface in this part.

- **Edit** — a `Link` to `page_ids.edit` (visible when `page_ids.edit` is configured — *not* access-gated; the edit page gates its own writes) that sets `input: { skip_status_redirect: true }`, mirroring `review.yaml.njk`'s Edit-link (`review.yaml.njk:192`, `:197–205`). Without the flag the link is dead on a `done` action: `edit.yaml.njk`'s stale-URL guard (lines 63–82) redirects any stage outside `[action-required, in-progress, changes-required]` back to `-view`, and `done` is excluded — so a `view`→Edit click would bounce straight back. The flag is what makes the re-open path below (and e2e test (c)) reachable from the UI. Pure navigation; no engine call.
- **`request_changes`** — opens a `ConfirmModal`/`Modal` collecting a comment, whose `onOk` calls `update-action-{action_type}` with `signal: request_changes` + the comment. **Gated like every other template button** — author opt-out AND FSM source-stage AND the per-verb role gate, here **`action_allowed.view`** (this template's verb — shows to all action-access users), *not* a special "reviewers only" gate (see below). **Opt-in** on `view` (`page_config.buttons.request_changes.visible` default `false`, D3) — an extra revise-after-done affordance, off unless the author enables it. Its source list is `[in-review, done]`; on `view` that means it shows on `done` (the revise-after-done path) and, if the user navigates to `view` of an `in-review` action, there too (FSM-legal; an author who doesn't want the overlap with the review page hides it).

This is in tension with Part 36's "extras on view pages — out of scope (view has no bar)." It's not a contradiction: Part 36 declined to add an *author-extras* bar; this part adds the *template-shipped* bar that state-machine.md specifies. Once view has a floating-actions bar, Part 36's later rebase (see below) can choose whether to extend `buttons.extra` to view — but that's Part 36's call, not this part's.

The main re-open path (re-edit a `done` action) is already covered by `submit` from `done` on the edit page (FSM `done → submit → in-review`). `view`'s `request_changes` covers the distinct "flag a completed action for rework without editing it" case. Its **concrete** need is the **no-`review`-verb** configuration: an action with no `review` verb has `submit` land it straight to `done` and ships **no review page at all**, so `view` is the *only* surface from which it can be sent back (`done → changes-required`). That also settles the gating: with no `review` verb there is no reviewer subset to single out, so `request_changes` here is gated on **`action_allowed.view`** — the same per-verb pattern as every other template button, keyed on this template's own verb — **not** the "surfaces only to reviewers" rule the older `state-machine`/`ui` prose asserts. The per-verb primitive *is* built (`action_role_check` writes `{ view, edit, review, error }`), so review-gating would be expressible — but it would be wrong: the gate returns `false` when a verb is absent from `access`, so `action_allowed.review` would permanently hide the button in exactly the no-`review`-verb configuration that justifies it. The stale "reviewers only" framing is reconciled below.

### D5 — Author event verbs: add `onProgress`

The page-event vocabulary gains a fifth locked verb, **`onProgress`**, fired by the `progress` (Save Draft) button. The prior four (`onMount`, `onSubmit`, `onApprove`, `onRequestChanges`, [`ui`](../../../workflows-module-concept/ui/design.md) Decision 4) are unchanged. Rationale: a draft save is a distinct semantic from a submit — partial, unvalidated — so it gets its own page-state hook rather than reusing `onSubmit` (whose validate/submit logic doesn't belong on a draft) or firing nothing (every other button runs a handler, so a silent `progress` would be the surprising case). Buttons and event verbs stay separate concerns: a `progress` click fires `onProgress` then the engine `CallAPI` (D2); a `submit` click fires `onSubmit` then `CallAPI`; `view`'s `request_changes` fires `onRequestChanges` if declared. `onProgress` is template-wired like the others — the author supplies the body via `pages.edit.events.onProgress`; the template owns the `CallAPI`.

## Concept-doc reconciliation

The button-bar prose in [`ui`](../../../workflows-module-concept/ui/design.md) and [`submit-pipeline`](../../../workflows-module-concept/submit-pipeline/design.md) was **already migrated to the signal model** in the `workflows-module-concept` reconciliation commit (verified against the live docs): `ui` D2's button table is already keyed on `signal`; D7 already documents the removed `workflow-action-edit` selector; and `submit-pipeline` D3 is already "Per-template button bars over the signal namespace" with the old interaction→target-status table replaced by FSM resolution. The residual edits — both driven by this part's new `onProgress` verb (D5) and new `view` bar (D4):

- **[`ui`](../../../workflows-module-concept/ui/design.md) Decision 2 button table** — add a `view` / `request_changes` row (no `view` row today), gated on `action_allowed.view` (the standard per-verb gate, keyed on this template's verb) and **opt-in** (default hidden), **not** "reviewers only"; change the `progress` row's "Author event handler fired" column from `onSubmit` to **`onProgress`** (D5).
- **[`ui`](../../../workflows-module-concept/ui/design.md) Decision 4 "Why fixed names"** — the locked event-verb vocabulary grows from four to **five**; add `onProgress` to the count and the verb list.
- **[`state-machine`](../../../workflows-module-concept/state-machine/design.md) "Default v1 button bars" (line ~235)** — the `view` row asserts `request_changes` "surfaces only to users with `review` access." Reconcile to the actual gating: gated like every other template button (the per-verb gate, here `action_allowed.view`) and opt-in, with the no-`review`-verb case (D4) as its concrete justification. Review-scoped gating is not introduced — it would dead-end the no-`review`-verb case (D4).

## Part 36 (extra action buttons) — rebase notes

Part 36 is unbuilt (not in `_completed/`) and was written entirely against the interaction model. Its **core idea survives untouched**: author buttons in the floating bar that carry *no* engine signal — the FSM change is about the signal vocabulary, and extras don't carry signals. The changes Part 36 needs are mechanical and should be folded into its design when it's next picked up (this part does not edit Part 36, only records the delta):

- **Terminology:** "interaction" → "signal"; "five-button vocabulary" / "locked verbs" → "template-shipped signal buttons"; references to "submit-pipeline Decision 3's deterministic target-status resolution" → "the engine's FSM resolution (state-machine.md)".
- **`RESERVED_BUTTON_IDS` is renamed and grows:** `button_submit` (renamed from `button_submit_edit`), `button_progress` (new), `button_not_required` (edit), `button_request_changes` (view + review), `button_approve` (review), `button_resolve_error` (error).
- **`view` now has a bar.** Part 36 assumed view had none and excluded it. Part 36 can decide whether `pages.view.buttons.extra` is now in scope — but that's an additive choice for Part 36, not a requirement from here.
- **No structural change** to the `buttons.extra` slot, the `_build.array.concat` wiring, the modal pattern, or the validator's structural checks. The locked-vs-extra boundary is unchanged; only the vocabulary it's described in moves.

## Simple actions are separate

The simple-action button surfaces live on three **static shared pages** (`pages/workflow-action-edit.yaml`, `workflow-action-view.yaml`, `workflow-action-review.yaml`), not on the generated form `.yaml.njk` templates. They are handed to a sibling design. The work there is now:

- **Delete the `workflow-action-edit` status selector.** [`ui`](../../../workflows-module-concept/ui/design.md) Decision 7 filters the selector by the priority rule (dead) — and state-machine.md removed the selector outright. The selector and its `target_status`/`current_status` payload are deleted, not rebuilt. Simple `submit` is nullary like form `submit`.
- **`interaction:` → `signal:`** on the simple pages' buttons (`submit`, `progress`, `not_required` on edit; `approve` / `request_changes` on review), reusing the *same* `button_signal_sources.yaml` map this part ships via `_ref` (form and simple FSMs are identical; the simple pages are static module-tree pages and can `_ref` the module enum at build time exactly as the templates do).

**Why still separate.** The split is now a file-locality call, not a model call: simple and form share an identical signal vocabulary, FSM, and the `button_signal_sources.yaml` map this part ships. What remains different is the *page files* (static shared pages vs generated `.yaml.njk` templates) and their *content* (universal-fields + comment vs a form schema). Keeping the sibling preserves a clean ownership boundary — this part's diff stays scoped to the generated templates; the sibling owns the static shared pages — and the two PRs stay small. The sibling consumes the visibility map and the concept reconciliation this part establishes rather than duplicating them.

This part touches only the four form `.yaml.njk` templates.

## Files changed

### Module templates + data

| File | Change |
| ---- | ------ |
| `modules/workflows/templates/edit.yaml.njk` | Rename `button_submit_edit` → `button_submit`; payload `interaction: submit_edit` → `signal: submit`. `not_required` payload `interaction:` → `signal:`. Add `button_progress` (D2) — fires author `onProgress` then `CallAPI`, no `Validate`. Rewrite all buttons' `visible` to the FSM source-stage form (D3); delete the `not_required` `_js` priority lookup. **Keep `not_required`'s author opt-out default at `false`** (opt-in) — don't flip it to `true` with the other buttons. **Drop `fields` from the `submit`, `progress`, and `not_required` payloads and narrow the `submit` `Validate` regex to `^form\.`** — universal fields are owned by Part 24's `update-action-fields-{action_type}` op (see "Why a dedicated part"); `not_required` has no `Validate`, so its drop is payload-only. **`submit` carries its payload + `Validate` twice (inline `onClick` + modal `onOk`) and `not_required` carries its payload twice (no `Validate`) — migrate both copies of each.** |
| `modules/workflows/templates/review.yaml.njk` | `approve` + `request_changes` payloads → `signal:`. Visibility → FSM source-stage form. **Drop the dead `fields` payload key and narrow the `Validate` regex `[^form_review\., ^fields\.]` → `[^form_review\.]`** — review renders the universal fields in display (read-only) mode (Part 24), so `_state.fields` is primed-then-resent dead state; same hygiene as `edit` (#1/#2). Applies to both `approve` payload copies (inline `onClick` + modal `onOk`) and the `request_changes` payload. |
| `modules/workflows/templates/error.yaml.njk` | `resolve_error` payload → `signal:`. Visibility → FSM source-stage form. Drop the dead `form_review` payload key — the error page primes only `form`/`fields`/`comment` (`prime_form_state`, lines 87–102), never `form_review`. **Also drop the dead `fields` payload key and narrow the `Validate` regex `[^form\., ^fields\.]` → `[^form\.]`** — error renders the universal fields in display (read-only) mode (Part 24), so `_state.fields` is primed-then-resent dead state; same hygiene as `edit` (#1/#2). Applies to both `resolve_error` payload copies (inline `onClick` + modal `onOk`). |
| `modules/workflows/templates/view.yaml.njk` | Add a `floating-actions` bar with an Edit-nav `Link` button (sets `skip_status_redirect: true`) and a `request_changes` comment-modal button (D4). `request_changes` is **opt-in** (`visible` default `false`), gated like every other button (per-verb: `action_allowed.view`), not "reviewers only". |
| `modules/workflows/enums/button_signal_sources.yaml` (new) | The button-signal→source-stages map (shared by form and simple kinds), read at build time via `_ref` from each button's `visible` (D3). No runtime-global wiring. |
| `plugins/modules-mongodb-plugins/package.json` | Add a `./fsm` entry to the `exports` map (`"./fsm": "./dist/connections/shared/fsm/tables.js"`) so the module's guard test imports the `form` FSM table via a stable public export rather than a deep dist path (D3). `tables.js` itself is created by Part 38. |
| `modules/workflows/README.md` | Document the button-visibility rules for app authors (consumer-facing; CLAUDE.md "update the relevant doc"): each template-shipped button renders iff **all three** hold — (1) the author opt-out `pages.{verb}.buttons.{name}.visible` (default `true`; opt-in exceptions `not_required` on `edit` and `request_changes` on `view` default `false`; accepts a boolean or any operator expression, and can only further *restrict* — never show a button the FSM or role gate rejects), (2) the action's current stage is in the signal's source list (`enums/button_signal_sources.yaml`), (3) the per-verb role gate `action_allowed.{verb}` for the page's own verb (`edit`/`review`/`error`/`view`). Also record the new `view` bar (Edit-nav + opt-in `request_changes`). |

### Tests

- **Enum/FSM guard** (D3) — in the **module's** test suite (alongside `resolvers/makeActionPages.test.js`), importing the `form` FSM table from the plugin package's `./fsm` public export (added by this part — see D3): assert `button_signal_sources.yaml` matches the table's derivable source-stages.
- **E2E (Part 22 supplements)** — on the demo: (a) Save Draft (`progress`) on an `action-required` action lands `in-progress` and persists partial form data without validation; (b) a button whose signal is not coherent from the current stage is not rendered — `progress` (source list `[action-required, in-progress]`) is not shown once the action is `done`, while `submit` (source list includes `done`) stays visible — exercising the FSM source-stage gate, not just the role gate; (c) `submit` from `done` on the edit page re-opens to `in-review`.

### Concept docs

Per [Concept-doc reconciliation](#concept-doc-reconciliation) above: the docs are already on signals; residual edits are (a) a `view` / `request_changes` row and the `progress`-row handler (`onProgress`) on `ui/design.md` Decision 2's button table, (b) `ui` Decision 4's verb list (now five, adds `onProgress`), and (c) a `state-machine` "Default v1 button bars" fix dropping the `view` row's "reviewers only" gating claim.

### Parent design

Add a Part 39 row to [`designs/workflows-module/design.md`](../../design.md)'s follow-on parts, with the dependency note (depends on Part 38 signal contract; sequences after Part 35).

## Out of scope

- **Simple-action button surfaces** — sibling design (above).
- **`makeWorkflowApis` / the `update-action-{action_type}` endpoint shape** — Part 38 owns the resolver emitting `signal` and dropping `force`. This part only changes what the templates send.
- **Demo `workflow_config` migration** — Part 38 owns the demo's authored config (pre-hook returns, `force` removal). The demo's *button bars* come from these module templates via `makeActionPages`, so they migrate automatically when this part lands; the demo has no hand-authored button bars to change.
- **`progress` engine behaviour** (the `progress_saved` event, `form_data` persistence) — Part 38's plan/commit + `planEventDispatch`. This part only fires the signal.
- **Author-overridable button bars / a fifth signal** — state-machine.md non-goal; the signal vocabulary stays engine-locked. (Note: `onProgress` is a fifth *event verb*, D5 — not a fifth *signal*; the signal vocabulary is unchanged.)

## Related

- [state-machine](../../../workflows-module-concept/state-machine/design.md) — the signal inventory, FSM tables, and the "Default v1 button bars" table this part implements.
- [Part 38 — Engine rebuild](../38-engine-rebuild/design.md) — the signal contract, `makeWorkflowApis` emitting `signal`, demo config migration. This part depends on its endpoint contract.
- [Part 24 — Universal fields](../24-universal-fields/design.md) — decouples form-kind universal-field writes into `update-action-fields-{action_type}`; this part drops `fields` from the submit/progress payloads as hygiene (no dead state, no spurious `^fields\.` validation). Part 24's kind-based guard already prevents form submit from writing those fields, so the drop is not a clobber-prevention requirement.
- [Part 36 — Extra action buttons](../36-extra-action-buttons/design.md) — author-extras bar; rebase notes above.
- [`ui`](../../../workflows-module-concept/ui/design.md), [`submit-pipeline`](../../../workflows-module-concept/submit-pipeline/design.md) — the concept docs this part reconciles.
- [Part 22 — Workflows e2e suite](../_next/22-workflows-e2e-suite/design.md) — e2e coverage home.
