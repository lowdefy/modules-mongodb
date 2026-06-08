# Extra Action Buttons in the Floating Button Bar

> **Reconciled to the signal model (Parts 38/39).** This part predates the engine's move from the old *interaction → target-status* model to **signals + a per-kind FSM** ([state-machine](../../../../workflows-module-concept/state-machine/design.md), engine in [Part 38](../../_completed/38-engine-rebuild/design.md), templates in [Part 39](../../_completed/39-form-submit-buttons/design.md)). The `buttons.extra` slot, the `_build.array.concat` wiring, the modal pattern, and the validator's structural checks are unchanged — only the vocabulary they're described in moves (per Part 39's "Part 36 — rebase notes"). The reserved-id list grows and is renamed to match Part 39's signal buttons. Note Part 39 is design-only at the time of writing — the shipped templates still carry the pre-39 state (`button_submit_edit`, `interaction:` payloads, no `button_progress`, no view bar), so every "post-Part 39" template description below is aspirational; this part depends on Part 39. If Part 36 lands first, `RESERVED_BUTTON_IDS` names ids that don't yet exist in templates (acceptable — the constant guards author config, not template state) and Part 39's template rewrite must preserve the `_build.array.concat` wrapper (see `tasks/tasks.md` cross-part sequencing).

Form-action page templates render a fixed set of signal buttons inside the layout module's `floating-actions` bar — the template-shipped buttons (post-Part 39) are `submit`, `progress` (Save Draft), `not_required`, `approve`, `request_changes`, `resolve_error`. The signal vocabulary is engine-locked; new signals are deliberate engine-side changes, not author config. Authors who need an *additional* button per action page — buttons whose behaviour is app-specific rather than workflow-lifecycle, like "Resend Reminder Message" or "Open Help" or "Re-Run Data Ingestion" — have no slot in that bar. They can only add buttons via `formFooter`, which renders below the form and breaks the visual grouping of page-level actions across the workflows surface. This part adds a `pages.{verb}.buttons.extra:` slot whose entries the templates concatenate into the same `floating-actions` `actions:` array as the template-shipped signal buttons.

The template-shipped signal buttons stay template-wired — they're the only buttons that hit `update-action-{action_type}` with a `signal` value the engine recognises and drive the engine's per-kind FSM resolution ([state-machine](../../../../workflows-module-concept/state-machine/design.md)). `buttons.extra` entries are author-composed Lowdefy blocks with their own `events.onClick` routines; they never carry a recognised signal and never reach the engine's signal FSM.

## Proposed change

1. **New authoring slot.** Extend the action `pages.{verb}.buttons` shape — currently used only as `buttons.{signal_name}.{title,disabled,visible,modal}` config knobs on the template-shipped signal buttons (e.g. `buttons.submit.title`, `buttons.approve.modal`) — with an `extra:` array sibling. Schema: `buttons.extra: [{ id, title, type?, icon?, visible?, disabled?, events.onClick }]`. The slot is deliberately named `extra`, not v0's `buttons.additional`: ports already rewrite the surrounding config (modal blocks relocate from `formHeader` to `formFooter`, role gates move to the per-verb `action_allowed.{verb}` key, the interaction→signal vocabulary shifts), so the v0 name buys no mechanical-port friction reduction, and `extra` matches the design's own vocabulary (template-shipped signal buttons vs author extras). Available on `pages.edit`, `pages.review`, `pages.error`. Part 39 (D4) added a `floating-actions` bar to `pages.view` as well, so view now has a bar; whether `buttons.extra` is offered on `view` is an additive choice deferred to a follow-on (see Out of scope) — this part ships the slot on the submitter/reviewer/error pages only.
2. **Template wiring.** Each verb template's `_ref: layout/floating-actions` block already passes a static `actions:` array. Wrap that array in `_build.array.concat:` so authored `buttons.extra` entries land alongside the template buttons. Authored entries render *after* the signal buttons in the array — given `direction: row-reverse` on the bar, that places the signal buttons on the right (primary visual position) and extras on the left. Within the extras array, authors control order.
3. **Validator pass.** `makeWorkflowsConfig.js` validates that `pages.{verb}.buttons.extra` is an array (when present), that each entry has a string `id` and `events.onClick` action array, and that no entry uses an id in the reserved set. Reservation is **global** — any reserved id is rejected on every verb page, not just the page whose bar ships that button. Per-page semantics would only buy authors the ability to name an edit-page extra `button_approve`, which is confusion fuel even when it doesn't collide; global reservation keeps the constant a flat list and self-protects when future parts move buttons between pages (`request_changes` already spans review + view). For verbs whose templates don't read the slot (`view`), the validator explicitly *rejects* a present `pages.{verb}.buttons.extra` — `validateAction` performs no `pages` structure validation today and unknown keys pass through silently, so without the explicit check a `view` extra would be silently dropped by the template; silent ignore is exactly the drift the validator exists to prevent. The reserved set (post-Part 39) is `button_submit` (renamed from `button_submit_edit`), `button_progress` (new — the Save Draft button), `button_not_required` (edit), `button_approve`, `button_request_changes` (review + view), `button_resolve_error` (error), plus `button_edit` (review — the Edit-nav `Link` button, `review.yaml.njk`). The collision rationale is about block ids in the bar, not signals, so navigation buttons reserve their ids too. (Part 39's view bar also carries an Edit-nav button whose id its design leaves unnamed — `button_edit` is the obvious mirror and is already covered by the global reservation; coordinate the name with Part 39 before either lands.) The validator reads the reserved ids from a `RESERVED_BUTTON_IDS` constant in `makeWorkflowsConfig.js`. The same ids are also hardcoded as `id:` values in the verb templates (the `Button` blocks in `edit.yaml.njk` / `review.yaml.njk` / `error.yaml.njk` / `view.yaml.njk`), so the constant isn't a true single source — each new signal-button part touches both the template button block and the constant. For a seven-id set that's acceptable duplication; collapsing it (e.g. resolver injects ids into each template as a build-time var) is heavier than the duplication is worth. (This mirrors the same hand-maintained-plus-guard tradeoff Part 39 D3 makes for the `button_signal_sources.yaml` source-stage map.)
4. **No engine collision.** Extras call author-defined `events.onClick` chains — typically `CallAPI` to an app endpoint, `CallMethod` to open a modal, or `Link` to navigate. The locked-signal invariant is about the engine's *signal vocabulary* (each known `signal` value resolves deterministically through the per-kind FSM, [state-machine](../../../../workflows-module-concept/state-machine/design.md)), not about which block can call the per-action endpoint. If an author writes an extra that CallAPIs `update-action-{action_type}` with a recognised `signal`, the engine processes it the same way it would from a template button — no special path, no ambiguity. The reserved-id check exists only to keep block id collisions out of the bar; it's not a security boundary.
5. **Documentation.** Update `action-authoring/design.md` Decision 8 "Per-page chrome" to introduce `buttons.extra` alongside `formHeader` / `formFooter` / `requests`, and add a paragraph to `ui/design.md` Decision 4 "Why fixed names" explaining that the signal-button bar is now extensible by author buttons but the signal vocabulary itself remains engine-locked. Add a new `### Per-page chrome` subsection to the workflows module `README.md` that enumerates every shipped `pages.{verb}.*` chrome slot — the README has no chrome documentation today, so this part takes on documenting the four pre-existing slots (`formHeader`, `formFooter`, `requests`, `buttons.{signal}.{title,disabled,visible,modal}`) alongside the new `buttons.extra` and the `formFooter` + `CallMethod` modal pattern (see "Modals with extras" below).

## Why a dedicated part

The change spans three shipped page templates (`edit.yaml.njk`, `review.yaml.njk`, `error.yaml.njk`), the `makeWorkflowsConfig` validator, the concept design (action-authoring Decision 8 and ui Decision 4), the module README (new per-page chrome subsection covering the four pre-existing slots plus `buttons.extra` — the README has no chrome documentation today), and the demo's worked-example workflow_config (at least one demo action should exercise the slot for e2e coverage). Threading this through any active follow-on (Parts 24, 28, 30, 33, 34) would dilute that part's review with an orthogonal authoring extension. The work is S-to-M — one new slot, three template edits, one validator branch, one demo exercise, plus a README chrome-reference subsection that catches up on pre-existing slots.

## Why "extra buttons in the bar" (not `formFooter`)

Today's escape hatch — buttons in `formFooter` — produces an inconsistent UI across the workflows surface. The `floating-actions` bar (`modules/shared/layout/floating-actions.yaml`) is the visual primary-action affordance on every workflow page: it's affixed to the page bottom, has its own card chrome, and groups signal buttons consistently. Buttons in `formFooter` render *inside the form card*, above the form's submit affordance, and don't share visual grouping with the signal buttons one card down. Users learn "look at the bottom of the page for what I can do here," and `formFooter` buttons fight that learning.

The fixed-name rationale (`ui/design.md` Decision 4 "Why fixed names") was about the signal vocabulary being engine-locked — so the engine can resolve each signal through the FSM deterministically, so apps can lint event handlers consistently, and so v0 ports translate one-to-one. None of those reasons require the *button bar* itself to be closed: extra buttons that don't carry a recognised signal don't break the engine contract, don't shadow any signal's event handler, and don't change the v0 port. The original design closed the bar by default because the second concrete need ("apps need a button that does X but not submit") hadn't surfaced; v0 inventory shows it has.

This part keeps the locked-signal invariant (the bar still contains the signal buttons; their signals stay template-wired) and opens only the composition: the bar's `actions:` array becomes a concat of template-shipped + author-supplied.

## YAML shape

```yaml
type: technician-dispatch
kind: form
pages:
  edit:
    title: Dispatch Technician
    requests: [...]
    events:
      onMount: [...]
      onSubmit: [...]
    formHeader: [...]
    formFooter:                             # author-declared modal blocks live here; they overlay at render time regardless of YAML position
      - id: resend_reminder_modal
        type: Modal
        properties:
          title: Resend Appointment Reminder
          width: 500
        blocks:
          - id: reminder_message
            type: TextArea
            properties:
              title: Message
              placeholder: Customise the reminder, or leave blank to use the default.
        events:
          onOk:
            - id: send
              type: CallAPI
              params:
                endpointId: my-app-resend-reminder
                payload:
                  action_id: { _state: action._id }
                  message: { _state: reminder_message }
    buttons:
      submit: # template-shipped signal button — existing config knob
        title: Confirm Dispatch
      extra:
        - id: resend_reminder
          title: Resend Reminder
          type: default
          icon: FaWhatsapp
          visible:
            _array.includes:
              - [in-progress, action-required]
              - _state: action.status.0.stage
          disabled:
            _ne:
              - _state: action_allowed.edit # verb-specific bool; action_allowed is an object { view, edit, review, error }
              - true
          events:
            onClick:
              - id: open
                type: CallMethod
                params:
                  blockId: resend_reminder_modal
                  method: toggleOpen # Modal registers toggleOpen/setOpen; `open` is ConfirmModal-only
        - id: open_help
          title: Help
          type: link
          icon: QuestionCircleOutlined
          events:
            onClick:
              - id: nav_help
                type: Link
                params:
                  url: https://help.example.com/technician-dispatch
                  newTab: true
```

The `extra:` entries follow standard Lowdefy `Button` block shape — `id`, `title`, `type` (`primary` / `default` / `link` / `danger`), optional `icon`, optional `visible` / `disabled` operators, and an `events.onClick` action array. The template renders each entry as a `Button` block inside the `floating-actions` bar; no transformation, no resolver magic, no per-entry template wrap.

## Modals with extras

The dominant v0 extras pattern is *button opens a modal; modal collects input; modal's `onOk` calls an API*. v1 supports this via primitives Lowdefy already provides — no new slot needed.

**How modals work in Lowdefy.** A `Modal` (or `ConfirmModal`) is a normal block declared anywhere in the page's block tree; the modal system overlays it at render time, so its *declaration position* in the YAML doesn't affect where it appears on screen. Open it from any action chain via `CallMethod` — the method name differs per block type: `Modal` registers `toggleOpen` and `setOpen({ open })` (`blocks-antd/src/blocks/Modal/Modal.js`); `ConfirmModal` registers `open`. So `{ blockId: <modal_id>, method: toggleOpen }` for a `Modal`, `{ blockId: <modal_id>, method: open }` for a `ConfirmModal`. (v0 confirms the split: `technician-on-site` opens its `Modal` via `toggleOpen`; `devices-assignment-request` opens its `ConfirmModal`s via `open`.) Inputs inside the modal write to the page's state tree the same way any input does, so the modal's `onOk` reads them via `_state:`. Close happens automatically on `onOk` / `onCancel`.

**Where the modal block lives.** Author-declared modals go in the existing `pages.{verb}.formFooter:` slot alongside any other footer blocks. Because the modal system overlays at render time, the modal block doesn't visually attach to `formFooter` — declaring it there is just a tidy home for the block, and either chrome slot works. We document `formFooter` as the convention. (v0 declared its modals in `formHeader` — `devices-assignment-request`, `technician-on-site` — so a mechanical port relocates the modal block between slots; a one-line move.)

**The button → modal flow.**

1. Author declares the modal in `pages.{verb}.formFooter:` with its own `id`, blocks, and `onOk` chain.
2. Author declares the extra button in `pages.{verb}.buttons.extra:` with `events.onClick: [{ type: CallMethod, params: { blockId: <modal_id>, method: toggleOpen } }]` (`method: open` if the target is a `ConfirmModal`).
3. Template renders both. Click button → modal opens. User fills the modal's inputs. Click OK → modal's `onOk` runs (which typically reads `_state:` and calls an app API).

This works for both `ConfirmModal` (no nested inputs, just title + content; opened via `method: open`) and `Modal` (arbitrary nested blocks; opened via `method: toggleOpen`). Authors who want a simple confirm-before-side-effect dialog use `ConfirmModal`; authors who need to collect input use `Modal`.

**Why not a new `modals:` slot or an inline `modal:` sub-field?** A new top-level `modals:` slot adds no capability over `formFooter` — Lowdefy modals overlay regardless of where they're declared, so a separate slot is just decoration. An inline `modal:` field under each extra forces duplication when multiple extras open the same modal and collapses to one modal per button. Both are deferred. If practice shows `formFooter` is consistently awkward, a follow-on part adds whichever shape the evidence warrants — build for what exists.

## Visibility and role gating

V0 inventory shows two patterns that are near-universal for extras and worth calling out so authors reach for them by default:

**Stage-gated `visible:`.** Most extras are only meaningful at certain workflow stages. v0 example: "Save In Progress" only on `[action-required, in-progress, changes-required]`. (v0's Resend Reminder button gates on data presence — `appointment_date` and `technician.contact_id` set — not on stage; the stage-gated Resend example in the YAML shape above is an illustration, not a v0 citation.) Authors filter via `visible: { _array.includes: [[<stage list>], { _state: action.status.0.stage }] }`. The action's status is already in page state by the time the bar renders (every verb template hydrates it in `onMount`), so no new wiring needed.

**Role-gated `disabled:`.** The action's role gate writes an **object** into page state — `action_allowed: { view, edit, review, error }` (via `components/action_role_check.yaml` mounted in every verb template's `onMount`); templates read the verb-specific bool, e.g. `_state: action_allowed.edit`. This is defence-in-depth display logic only — there is **no** role-based mount redirect (the only mount redirects are the no-action and stale-status guards), so extras get **no implicit role gating**: an extra with no `visible` / `disabled` gate renders fully clickable for users without the verb role. Authors who need role gating must wire it themselves via `disabled: { _ne: [{ _state: action_allowed.{verb} }, true] }` (or `visible:`), and app endpoints called from extras must enforce their own server-side checks — the engine's server-side checks protect only engine writes. The example above uses the `disabled:` form for the Resend button so unauthorised users see the affordance but can't fire it.

Neither pattern requires new template support; both work today via standard Lowdefy operators on the extra entry. The design calls them out so authors don't reinvent the patterns per-action.

## Decisions

These three points were open during initial drafting; the v0 inventory in `/Users/sam/Developer/mrm/prp/apps/shared/workflow_config` settled them.

1. **Render position: append.** Template buttons render first in the `actions:` array (rightmost in `row-reverse`, primary position). Extras render after (leftmost). v0 shows signal buttons consistently in the primary visual slot; extras are secondary. Authors who want an extra to *replace* the primary visual position should make it a template-shipped signal button instead — that's the boundary.
2. **Slot scope: per-verb only.** `pages.edit.buttons.extra`, `pages.review.buttons.extra`, `pages.error.buttons.extra` are independent blocks. No page-level shared `pages.buttons.extra:` shape. v0 evidence: every observed extra is verb-specific; the lone case of duplication ("Report Issue" on edit and view of `technician-on-site`) is a v0 DRY violation, not an intended shared-across-verbs pattern. Authors who want the same button across verbs `_ref` a shared button file — same pattern v0 already uses for `appointment_reminder_button.yaml`.
3. **Validator strictness on `events.onClick`: structural only.** Validate that `events.onClick` is an array; don't type-check what it does. If an author routes an extra through `update-action-{action_type}` with a recognised signal, the engine processes it normally — the locked-signal invariant is about vocabulary, not source. v0 evidence: zero observed cases of extras calling the engine endpoint, so the risk is theoretical.

## Files changed — shipped code and templates

| File                                                                                                                                          | Change                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [modules/workflows/templates/edit.yaml.njk](../../../../../modules/workflows/templates/edit.yaml.njk)                                            | Wrap the `_ref: layout/floating-actions` `actions:` array (post-Part 39 the edit bar carries three signal buttons — `button_submit`, `button_progress`, `button_not_required`) in `_build.array.concat:` with `_var: { key: page_config.buttons.extra, default: [] }` as the trailing entry. No change to existing button definitions or their `buttons.{signal}.modal` confirm-modal blocks. No new modal-slot wiring — author modals go in `pages.{verb}.formFooter` and are picked up by the existing footer slot. |
| [modules/workflows/templates/review.yaml.njk](../../../../../modules/workflows/templates/review.yaml.njk)                                        | Same shape: wrap `actions:` in `_build.array.concat:` + append `page_config.buttons.extra`. Review's bar today has three template-shipped buttons (Edit, Request Changes, Approve). Extras render after them.                                                                                                                                                |
| [modules/workflows/templates/error.yaml.njk](../../../../../modules/workflows/templates/error.yaml.njk)                                          | Same shape: wrap `actions:` (the single `button_resolve_error` entry) in `_build.array.concat:` with `page_config.buttons.extra` appended.                                                                                                                                                                                          |
| [modules/workflows/resolvers/makeWorkflowsConfig.js](../../../../../modules/workflows/resolvers/makeWorkflowsConfig.js)                          | New validation in `validateAction` (form kind only): for each verb that supports the slot (`edit`, `review`, `error`), if `pages.{verb}.buttons.extra` is set, assert it's an array; each entry must have a string `id` and `events.onClick` array; reject `pages.view.buttons.extra` outright (slot not offered on view — see Out of scope); reject `id` values in a `RESERVED_BUTTON_IDS` constant (`button_submit`, `button_progress`, `button_not_required`, `button_approve`, `button_request_changes`, `button_resolve_error`, `button_edit`). New unit cases in the validator test. |
| [modules/workflows/README.md](../../../../../modules/workflows/README.md)                                                                        | Add a new `### Per-page chrome` subsection under "How to Use" (sibling to the existing "Worked example — a single form action"). Enumerate every `pages.{verb}.*` chrome slot the shipped templates read: `title`, `requests`, `formHeader`, `formFooter`, `buttons.{signal}.{title,disabled,visible,modal}` (with the approve modal as the worked example — the `.modal.{title,content}` knob exists on `submit` / `not_required` / `approve` / `resolve_error`; `request_changes` carries `.visible` / `.disabled` only, its comment modal being mandatory and non-configurable), `events.{onMount,onSubmit}`, and the new `buttons.extra`. Include a one-paragraph note on the button → modal pattern: declare a `Modal` block inside `pages.{verb}.formFooter:` and open it from the extra button's `onClick` via `CallMethod`. This part inherits documenting the four pre-existing slots since none of them are described in the README yet — call out the scope inflation in the PR description so it isn't reviewed as silent expansion. |

`view.yaml.njk` is unchanged *by this part*. Part 39 (D4) added a `floating-actions` bar to view (carrying `request_changes` + an Edit-nav button), so the bar now exists — but offering `buttons.extra` on view is an additive choice deferred to a follow-on (see Out of scope). If a concrete need surfaces (e.g. a "Print" button on view), the follow-on extends the same `_build.array.concat` wiring to `view.yaml.njk` and adds `view` to the validator's bar-verb set.

`pages/workflow-action-edit.yaml`, `workflow-action-view.yaml`, `workflow-action-review.yaml` are unchanged. Check-action pages intentionally share one experience per verb (`ui/design.md:167`); apps that need a custom button use a form action.

## Files changed — concept docs

| File                                                                                                                                | Change                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [designs/workflows-module-concept/action-authoring/design.md](../../../../workflows-module-concept/action-authoring/design.md)         | Decision 8 "Per-page chrome" section (around line 751-773): add `buttons.extra: [...]` to the per-page chrome list, document the button-opens-modal pattern (modal block in `formFooter`, opened via `CallMethod`), and add the worked-example YAML shape (mirroring this part's "YAML shape" section, shortened). Correct the stale `modals` paragraph (which described a never-wired `modals.{name}.{field}:` config-knob shape) by removing it — the shipped modal-override knobs live under `buttons.{signal}.modal.{title,content}` for `submit` / `not_required` (edit), `approve` (review), and `resolve_error` (error); the request-changes modal is mandatory and carries no knobs (`request_changes` exposes only `.visible` / `.disabled`). Update the error-pages subsection (line 813) to mention `buttons.extra` as the multi-button path instead of `formFooter`. |
| [designs/workflows-module-concept/ui/design.md](../../../../workflows-module-concept/ui/design.md)                                     | Decision 4 "Why fixed names" subsection (already migrated to the signal model + five-verb event vocabulary by Part 39): replace the "additional buttons via `formFooter:`" paragraph with "additional buttons via `buttons.extra:`, rendered alongside the template-shipped signal buttons in the same `floating-actions` bar; modals declared in `pages.{verb}.formFooter:` and opened via `CallMethod` from button `onClick`". Update the chrome-blocks table: add `buttons.extra` as a slot, and fix the stale `modals` row by either removing it (the never-wired `modals.{name}.{field}:` shape isn't shipped) or replacing it with a note that modal overrides live under `buttons.{signal}.modal.{title,content}` on `submit` / `not_required` / `approve` / `resolve_error` (the `request_changes` comment modal is mandatory and has no knobs). Add a sentence to "Why fixed names" reframing the invariant: the engine's *signal vocabulary* is locked, not the bar's composition. |
| [designs/workflows-module/design.md](../../../design.md)                                                                                | Add Part 36 row to the follow-on parts table; add a dependency note (depends on Parts 16, 4, 39) and a one-line entry under "Follow-on parts" describing why it was spun out.                                                                                                                                                                                            |

## Files changed — demo app

One demo action should exercise the slot for e2e coverage. The cheapest exercise is **Open Help** on a form action's edit page — a `Link` action firing on `onClick`, no new endpoint or Lambda required. Pick `onboarding/qualify.yaml` (a form action with an `edit` page; `installation/install-step.yaml` is `kind: check` and has no `pages.edit` slot, and `installation/installation.yaml` is the workflow file, not an action) and add:

```yaml
pages:
  edit:
    buttons:
      extra:
        - id: open_help
          title: Help
          type: link
          icon: QuestionCircleOutlined
          events:
            onClick:
              - id: nav_help
                type: Link
                params:
                  url: https://docs.lowdefy.com
                  newTab: true
```

| File                                                                                                                                                       | Change                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| One file under [apps/demo/modules/workflows/workflow_config/](../../../../apps/demo/modules/workflows/workflow_config/)                                    | Add the `pages.edit.buttons.extra:` block above to one form action.                                                                 |

A second demo exercise covering the modal pattern would be ideal but requires a real target API — defer that to whichever demo addition needs an app-specific side-effect first.

## Why the locked-signal invariant survives

The per-kind FSM ([state-machine](../../../../workflows-module-concept/state-machine/design.md), resolved server-side per [submit-pipeline](../../../../workflows-module-concept/submit-pipeline/design.md) Decision 3) keys on the `signal` string the per-action endpoint receives. Template-shipped buttons hardcode the signal value in their `CallAPI` payload (`signal: submit`, `signal: approve`, etc.). Extras carry author-defined `events.onClick` action arrays — typically these don't touch the engine endpoint at all (they call app APIs or Lambdas or just navigate). If an author writes an extra that *does* CallAPI the per-action endpoint with a recognised signal, the engine simply processes it as that signal. The engine has no concept of "where this call came from"; it sees a payload and processes it.

The reserved-id check in the validator prevents the more confusing case at the *block tree* level: an extra named `button_submit` would render twice in the bar (once template, once author) and create ambiguous selectors in tests / Playwright fixtures. Rejecting the collision at build time keeps the bar's id space clean. It's a build-time cleanliness check, not a runtime engine boundary.

The locked-signal invariant therefore means: **the engine's recognised signal vocabulary is closed** — adding a new signal is a deliberate engine-side change (a new signal-button part). It does **not** mean: only template-shipped buttons can call the engine endpoint, or only the engine endpoint can be called from the bar, or extras must avoid status-changing behaviour. Extras can do whatever Lowdefy blocks can do; the engine's behaviour is determined by the payload, not the caller.

## Verification

- **Build passes.** `pnpm build` runs `makeWorkflowsConfig` against the demo workflow_config; the validator accepts the demo's `buttons.extra` entry and rejects (in a unit test) a synthetic action that uses a reserved id.
- **Demo page renders the extra button.** Opening `/workflows/{onboarding_workflow_id}/qualify-edit?action_id=...` in the demo shows the template's primary `Submit` button plus the author's "Help" button in the floating bar. Click the extra button → external docs link opens in a new tab — no engine call.
- **Unit tests.**
  - `makeWorkflowsConfig.test.js` — add cases: (a) valid `buttons.extra` array passes; (b) non-array `buttons.extra` rejected; (c) entry missing `id` rejected; (d) entry missing `events.onClick` rejected; (e) entry with `id: button_submit` in `pages.edit.buttons.extra` rejected; (e2) `id: button_progress` (edit) rejected; (f) `id: button_resolve_error` (error) rejected; (f2) `id: button_edit` (review) rejected — nav buttons reserve their ids too; (f3) `id: button_approve` in `pages.edit.buttons.extra` rejected even though the edit bar ships no approve button — pins the global (not per-page) reservation semantics; (g) `buttons.extra` on `view` rejected (extras slot not offered on view — see Out of scope).
  - `makeActionPages.test.js` — add a fixture with `pages.edit.buttons.extra` set and assert the emitted page's `_ref.vars.page_config.buttons.extra` round-trips the author's array. (`makeActionPages` only forwards `page_config: action.pages?.[verb]` to the template var; the `_build.array.concat` that materialises the merged `actions:` array happens later inside Lowdefy's build-time YAML processing, so the resolver-level test can only assert the round-trip — the merged-list behaviour is covered by the "Build passes" item above.)
- **E2E (self-owned, deferred-verification).** This part adds one assertion to the existing `apps/demo/e2e/workflows/onboarding-happy-path.spec.js` (which already drives the onboarding workflow whose `qualify` edit page carries the demo Help button): the "Help" button is visible in the bar and clicking it navigates to the configured URL. No Part 22 coordination — that part is design-only in `parts/_next/`, and its rebased plan keeps the example-workflow specs in place as tier 1, so it absorbs the line untouched when it lands. Honest caveat: the happy-path spec is itself written ahead of its engine prerequisites (Part 38 task 17, Parts 43, 44) and doesn't run yet, so this assertion rides the same deferred-verification flag the spec already carries — it verifies nothing at ship time; the build-passes and demo-renders checks above are the live verification.

## Out of scope

- **Additional locked signals (future `button_report_issue`, etc.).** Each new signal button is its own part — owns its FSM transition, hook dispatch, template rendering, and reserved-id registration. (The v0 Save Draft button is no longer future: it shipped as the `progress` signal in Part 39 and is registered as `button_progress` in the reserved set above.) This part only opens the bar to author-supplied entries and registers the *currently-shipped* reserved ids. Future signal parts add their button block to the relevant template *and* add their id to `RESERVED_BUTTON_IDS` (the duplication is acknowledged in Proposed Change item 3).
- **Extras on `view` pages.** Part 39 (D4) added a `floating-actions` bar to view, so the bar now exists — but extending `buttons.extra` to it is an additive choice deferred to a follow-on, not a requirement here (Part 39 "Part 36 — rebase notes"). This part ships the slot on `edit` / `review` / `error` only; a follow-on adds `view` when a concrete extras need surfaces there.
- **Extras on the workflow-overview page.** The overview is read-only chrome aggregating actions; it never had a per-action button bar. Out of scope.
- **Extras on check-action pages.** Check-action pages share one experience across every workflow (`ui/design.md:167`); adding per-action extras to them collapses that contract. If a real need surfaces ("this check action needs a side-button"), the answer is to convert the action to `kind: form` with an empty form, not to extend the shared check pages.
- **Reordering template buttons via author config.** Authors cannot reorder the template-shipped signal buttons; their position in the bar is fixed by the template. Extras only render after the signal buttons.
- **A dedicated `pages.{verb}.modals:` slot.** Author modals live in `pages.{verb}.formFooter:` and are opened via `CallMethod` from button `onClick`. A separate slot adds no capability over `formFooter` since Lowdefy modals overlay regardless of declaration position. If practice shows `formFooter` is awkward, a follow-on part introduces whichever shape the evidence warrants.
- **Inline `modal:` sub-field under each extra.** Same deferral: multiple extras sometimes open the same modal, and an inline shape collapses to one modal per button. Re-evaluate if a real awkwardness surfaces.
- **An `extras` slot on the layout module's `floating-actions` component.** This part extends the workflows templates' use of `floating-actions`; the layout component itself already accepts an arbitrary `actions:` array and needs no change.
- **Per-button role gates as a first-class field.** Fine-grained per-button role checks remain the author's job via `visible:` / `disabled:` operators using `_state: action_allowed.{verb}` (set by the page's `action_role_check` mount step). No new shape.

## Related

- Source design: [workflows-module-concept/action-authoring/design.md § Decision 8 — Per-page chrome](../../../../workflows-module-concept/action-authoring/design.md), [workflows-module-concept/ui/design.md § Decision 4 — Chrome blocks](../../../../workflows-module-concept/ui/design.md).
- Existing per-verb `buttons.{name}` config knobs precedent: [action-authoring § Error pages](../../../../workflows-module-concept/action-authoring/design.md) (`pages.error.buttons.submit.{title,modal}`).
- Layout component this part extends use of: [modules/shared/layout/floating-actions.yaml](../../../../../modules/shared/layout/floating-actions.yaml).
- Page templates: [modules/workflows/templates/edit.yaml.njk](../../../../../modules/workflows/templates/edit.yaml.njk), [review.yaml.njk](../../../../../modules/workflows/templates/review.yaml.njk), [error.yaml.njk](../../../../../modules/workflows/templates/error.yaml.njk).
- V0 inventory that grounded the design: `/Users/sam/Developer/mrm/prp/apps/shared/workflow_config` — 17 action configs use `buttons.additional`; representative examples include `site-check` (Save In Progress — now the `progress` signal, shipped in Part 39), `technician-on-site` (Report Issue — a candidate future signal; Resend Reminder remains a genuine extra), and `devices-assignment-request` (Unassign, Accept For Technician — modal-confirm side-effect pattern).
- Workflows module implementation tracker: [designs/workflows-module/design.md](../../../design.md). Lands as a follow-on in the same spirit as Parts 24 and 28 — small extension to a shipped resolver and shipped templates without reopening any already-completed part.
