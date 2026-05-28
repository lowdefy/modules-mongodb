# Extra Action Buttons in the Floating Button Bar

Form-action page templates today render a fixed set of verb buttons inside the layout module's `floating-actions` bar — the five currently shipped are `submit_edit`, `not_required`, `approve`, `request_changes`, `resolve_error`, and the locked set grows in separate parts (Save Draft, Report Issue, others are tracked outside this design). Authors who need an *additional* button per action page — buttons whose behaviour is app-specific rather than workflow-lifecycle, like "Resend Reminder Message" or "Open Help" or "Re-Run Data Ingestion" — have no slot in that bar. They can only add buttons via `formFooter`, which renders below the form and breaks the visual grouping of page-level actions across the workflows surface. This part adds a `pages.{verb}.buttons.extra:` slot whose entries the templates concatenate into the same `floating-actions` `actions:` array as the locked verb buttons.

The locked verbs stay template-wired — they're the only buttons that hit `update-action-{action_type}` with an `interaction` value the engine recognises and drive submit-pipeline Decision 3's deterministic target-status resolution. `buttons.extra` entries are author-composed Lowdefy blocks with their own `events.onClick` routines; they never carry a recognised interaction and never short-circuit the engine's interaction → target-status table.

## Proposed change

1. **New authoring slot.** Extend the action `pages.{verb}.buttons` shape — currently used only as `buttons.{verb_name}.{title,disabled,visible,modal}` config knobs on template-shipped buttons (see `templates/edit.yaml.njk:199-326`, `templates/error.yaml.njk:229-322`) — with an `extra:` array sibling. Schema: `buttons.extra: [{ id, title, type?, icon?, visible?, disabled?, events.onClick }]`. Available on `pages.edit`, `pages.review`, `pages.error` (the three verb pages with a `floating-actions` bar). `pages.view` has no button bar today and gets no `buttons.extra` slot.
2. **Template wiring.** Each verb template's `_ref: layout/floating-actions` block already passes a static `actions:` array. Wrap that array in `_build.array.concat:` so authored `buttons.extra` entries land alongside the template buttons. Authored entries render *after* the verb buttons in the array — given `direction: row-reverse` on the bar, that places the verb buttons on the right (primary visual position) and extras on the left. Within the extras array, authors control order.
3. **Validator pass.** `makeWorkflowsConfig.js` validates that `pages.{verb}.buttons.extra` is an array (when present), that each entry has a string `id` and `events.onClick` action array, and that no entry uses a reserved id matching a template-shipped button on that page. The currently-reserved set at the time this part ships is `button_submit_edit`, `button_not_required` (edit), `button_approve`, `button_request_changes` (review), `button_resolve_error` (error). The validator reads the reserved ids from a `RESERVED_BUTTON_IDS` constant in `makeWorkflowsConfig.js`. The same ids are also hardcoded as `id:` values in the verb templates (`edit.yaml.njk:199, 262`; `review.yaml.njk:225, 251`; `error.yaml.njk:229`), so the constant isn't a true single source — each new locked-verb part touches both the template button block and the constant. For a five-id set that's acceptable duplication; collapsing it (e.g. resolver injects ids into each template as a build-time var) is heavier than the duplication is worth.
4. **No engine collision.** Extras call author-defined `events.onClick` chains — typically `CallAPI` to an app endpoint, `CallMethod` to open a modal, or `Link` to navigate. The locked-verb invariant is about the engine's *interaction vocabulary* (each known `interaction` value maps deterministically to a target status per submit-pipeline Decision 3), not about which block can call the per-action endpoint. If an author writes an extra that CallAPIs `update-action-{action_type}` with a recognised `interaction`, the engine processes it the same way it would from a template button — no special path, no ambiguity. The reserved-id check exists only to keep block id collisions out of the bar; it's not a security boundary.
5. **Documentation.** Update `action-authoring/design.md` Decision 8 "Per-page chrome" to introduce `buttons.extra` alongside `formHeader` / `formFooter` / `requests`, and add a paragraph to `ui/design.md` Decision 4 "Why fixed names" explaining that the locked verb bar is now extensible by author buttons but the interaction vocabulary itself remains locked. Add a new `### Per-page chrome` subsection to the workflows module `README.md` that enumerates every shipped `pages.{verb}.*` chrome slot — the README has no chrome documentation today, so this part takes on documenting the four pre-existing slots (`formHeader`, `formFooter`, `requests`, `buttons.{verb_name}.{title,disabled,visible,modal}`) alongside the new `buttons.extra` and the `formFooter` + `CallMethod` modal pattern (see "Modals with extras" below).

## Why a dedicated part

The change spans three shipped page templates (`edit.yaml.njk`, `review.yaml.njk`, `error.yaml.njk`), the `makeWorkflowsConfig` validator, the concept design (action-authoring Decision 8 and ui Decision 4), the module README (new per-page chrome subsection covering the four pre-existing slots plus `buttons.extra` — the README has no chrome documentation today), and the demo's worked-example workflow_config (at least one demo action should exercise the slot for e2e coverage). Threading this through any active follow-on (Parts 24, 28, 30, 33, 34) would dilute that part's review with an orthogonal authoring extension. The work is S-to-M — one new slot, three template edits, one validator branch, one demo exercise, plus a README chrome-reference subsection that catches up on pre-existing slots.

## Why "extra buttons in the bar" (not `formFooter`)

Today's escape hatch — buttons in `formFooter` — produces an inconsistent UI across the workflows surface. The `floating-actions` bar (`modules/shared/layout/floating-actions.yaml`) is the visual primary-action affordance on every workflow page: it's affixed to the page bottom, has its own card chrome, and groups verb buttons consistently. Buttons in `formFooter` render *inside the form card*, above the form's submit affordance, and don't share visual grouping with the verb buttons one card down. Users learn "look at the bottom of the page for what I can do here," and `formFooter` buttons fight that learning.

The fixed-name rationale (`ui/design.md:351-355`) was about the four *interaction* verbs being locked — so the engine can resolve interaction → target status deterministically, so apps can lint event handlers consistently, and so v0 ports translate one-to-one. None of those reasons require the *button bar* itself to be closed: extra buttons that don't carry a recognised interaction don't break the engine contract, don't shadow any verb's event handler, and don't change the v0 port. The original design closed the bar by default because the second concrete need ("apps need a button that does X but not submit") hadn't surfaced; v0 inventory shows it has.

This part keeps the locked-verb invariant (the bar still contains the verb buttons; their interactions stay template-wired) and opens only the composition: the bar's `actions:` array becomes a concat of template-shipped + author-supplied.

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
      submit_edit: # template verb — existing config knob
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
              - _state: action_allowed
              - true
          events:
            onClick:
              - id: open
                type: CallMethod
                params:
                  blockId: resend_reminder_modal
                  method: open
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

**How modals work in Lowdefy.** A `Modal` (or `ConfirmModal`) is a normal block declared anywhere in the page's block tree; the modal system overlays it at render time, so its *declaration position* in the YAML doesn't affect where it appears on screen. Open it from any action chain via `CallMethod` with `{ blockId: <modal_id>, method: open }`. Inputs inside the modal write to the page's state tree the same way any input does, so the modal's `onOk` reads them via `_state:`. Close happens automatically on `onOk` / `onCancel`.

**Where the modal block lives.** Author-declared modals go in the existing `pages.{verb}.formFooter:` slot alongside any other footer blocks. Because the modal system overlays at render time, the modal block doesn't visually attach to `formFooter` — declaring it there is just a tidy home for the block. This matches the v0 pattern (`formFooter` + `CallMethod`) and keeps the port path frictionless.

**The button → modal flow.**

1. Author declares the modal in `pages.{verb}.formFooter:` with its own `id`, blocks, and `onOk` chain.
2. Author declares the extra button in `pages.{verb}.buttons.extra:` with `events.onClick: [{ type: CallMethod, params: { blockId: <modal_id>, method: open } }]`.
3. Template renders both. Click button → modal opens. User fills the modal's inputs. Click OK → modal's `onOk` runs (which typically reads `_state:` and calls an app API).

This works identically for `ConfirmModal` (no nested inputs, just title + content) and `Modal` (arbitrary nested blocks). Authors who want a simple confirm-before-side-effect dialog use `ConfirmModal`; authors who need to collect input use `Modal`.

**Why not a new `modals:` slot or an inline `modal:` sub-field?** A new top-level `modals:` slot adds no capability over `formFooter` — Lowdefy modals overlay regardless of where they're declared, so a separate slot is just decoration. An inline `modal:` field under each extra forces duplication when multiple extras open the same modal and collapses to one modal per button. Both are deferred. If practice shows `formFooter` is consistently awkward, a follow-on part adds whichever shape the evidence warrants — build for what exists.

## Visibility and role gating

V0 inventory shows two patterns that are near-universal for extras and worth calling out so authors reach for them by default:

**Stage-gated `visible:`.** Most extras are only meaningful at certain workflow stages. v0 examples: "Save In Progress" only on `[action-required, in-progress, changes-required]`; "Resend Reminder" only on `in-progress`. Authors filter via `visible: { _array.includes: [[<stage list>], { _state: action.status.0.stage }] }`. The action's status is already in page state by the time the bar renders (every verb template hydrates it in `onMount`), so no new wiring needed.

**Role-gated `disabled:`.** The action's role gate writes `action_allowed: true/false` into page state (via `components/action_role_check.yaml` mounted in every verb template's `onMount` — see `edit.yaml.njk:90`). Extras inherit the page-level role gate implicitly (the page redirects if `action_allowed` is false on mount), but extras that should be *visible but not clickable* for users without the role use `disabled: { _ne: [{ _state: action_allowed }, true] }`. The example above uses this for the Resend button so unauthorised users see the affordance but can't fire it.

Neither pattern requires new template support; both work today via standard Lowdefy operators on the extra entry. The design calls them out so authors don't reinvent the patterns per-action.

## Decisions

These three points were open during initial drafting; the v0 inventory in `/Users/sam/Developer/mrm/prp/apps/shared/workflow_config` settled them.

1. **Render position: append.** Template buttons render first in the `actions:` array (rightmost in `row-reverse`, primary position). Extras render after (leftmost). v0 shows verb buttons consistently in the primary visual slot; extras are secondary. Authors who want an extra to *replace* the primary visual position should make it a locked verb instead — that's the boundary.
2. **Slot scope: per-verb only.** `pages.edit.buttons.extra`, `pages.review.buttons.extra`, `pages.error.buttons.extra` are independent blocks. No page-level shared `pages.buttons.extra:` shape. v0 evidence: every observed extra is verb-specific; the lone case of duplication ("Report Issue" on edit and view of `technician-on-site`) is a v0 DRY violation, not an intended shared-across-verbs pattern. Authors who want the same button across verbs `_ref` a shared button file — same pattern v0 already uses for `appointment_reminder_button.yaml`.
3. **Validator strictness on `events.onClick`: structural only.** Validate that `events.onClick` is an array; don't type-check what it does. If an author routes an extra through `update-action-{action_type}` with a recognised interaction, the engine processes it normally — locked-verb invariant is about vocabulary, not source. v0 evidence: zero observed cases of extras calling the engine endpoint, so the risk is theoretical.

## Files changed — shipped code and templates

| File                                                                                                                                          | Change                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [modules/workflows/templates/edit.yaml.njk](../../../../modules/workflows/templates/edit.yaml.njk)                                            | Wrap the `_ref: layout/floating-actions` `actions:` array (currently lines 198-327, two `Button` entries) in `_build.array.concat:` with `_var: { key: page_config.buttons.extra, default: [] }` as the trailing entry. No change to existing button definitions or their `buttons.{verb}.modal` confirm-modal blocks (lines 328-413). No new modal-slot wiring — author modals go in `pages.{verb}.formFooter` and are picked up by the existing footer slot. |
| [modules/workflows/templates/review.yaml.njk](../../../../modules/workflows/templates/review.yaml.njk)                                        | Same shape: wrap `actions:` in `_build.array.concat:` + append `page_config.buttons.extra`. Review's bar today has three template-shipped buttons (Edit, Request Changes, Approve). Extras render after them.                                                                                                                                                |
| [modules/workflows/templates/error.yaml.njk](../../../../modules/workflows/templates/error.yaml.njk)                                          | Same shape: wrap `actions:` (currently the single `button_resolve_error` entry, lines 229-296) in `_build.array.concat:` with `page_config.buttons.extra` appended.                                                                                                                                                                                          |
| [modules/workflows/resolvers/makeWorkflowsConfig.js](../../../../modules/workflows/resolvers/makeWorkflowsConfig.js)                          | New validation in `validateAction` (form kind only): for each verb that supports a bar (`edit`, `review`, `error`), if `pages.{verb}.buttons.extra` is set, assert it's an array; each entry must have a string `id` and `events.onClick` array; reject `id` values in a `RESERVED_BUTTON_IDS` constant (currently `button_submit_edit`, `button_not_required`, `button_approve`, `button_request_changes`, `button_resolve_error`). New unit cases in the validator test. |
| [modules/workflows/README.md](../../../../modules/workflows/README.md)                                                                        | Add a new `### Per-page chrome` subsection under "How to Use" (sibling to the existing "Worked example — a single form action"). Enumerate every `pages.{verb}.*` chrome slot the shipped templates read: `title`, `requests`, `formHeader`, `formFooter`, `buttons.{verb_name}.{title,disabled,visible,modal}` (with the request-changes modal example), `events.{onMount,onSubmit}`, and the new `buttons.extra`. Include a one-paragraph note on the button → modal pattern: declare a `Modal` block inside `pages.{verb}.formFooter:` and open it from the extra button's `onClick` via `CallMethod`. This part inherits documenting the four pre-existing slots since none of them are described in the README yet — call out the scope inflation in the PR description so it isn't reviewed as silent expansion. |

`view.yaml.njk` is unchanged — the view page has no `floating-actions` bar, so there's nothing to extend. If v2 wants extras on the view page (e.g. a "Print" button), a separate part adds the bar and the slot together.

`pages/simple-edit.yaml`, `simple-view.yaml`, `simple-review.yaml` are unchanged. Simple-action pages intentionally share one experience per verb (`ui/design.md:167`); apps that need a custom button use a form action.

## Files changed — concept docs

| File                                                                                                                                | Change                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [designs/workflows-module-concept/action-authoring/design.md](../../../workflows-module-concept/action-authoring/design.md)         | Decision 8 "Per-page chrome" section (around line 751-773): add `buttons.extra: [...]` to the per-page chrome list, document the button-opens-modal pattern (modal block in `formFooter`, opened via `CallMethod`), and add the worked-example YAML shape (mirroring this part's "YAML shape" section, shortened). Correct the stale `modals` paragraph (which described a never-wired `modals.{name}.{field}:` config-knob shape) by removing it — the request-changes modal overrides actually live under `buttons.request_changes.modal.{title,content,visible}` per the shipped `review.yaml.njk`. Update the error-pages subsection (line 813) to mention `buttons.extra` as the multi-button path instead of `formFooter`. |
| [designs/workflows-module-concept/ui/design.md](../../../workflows-module-concept/ui/design.md)                                     | Decision 4 "Why fixed names" subsection (line 349-357): replace the "additional buttons via `formFooter:`" paragraph with "additional buttons via `buttons.extra:`, rendered alongside the locked verb buttons in the same `floating-actions` bar; modals declared in `pages.{verb}.formFooter:` and opened via `CallMethod` from button `onClick`". Update the chrome-blocks table (line 321-330): add `buttons.extra` as the fifth slot, and fix the stale `modals` row by either removing it (the never-wired `modals.{name}.{field}:` shape isn't shipped) or replacing it with a note that the `request_changes` modal overrides live under `buttons.request_changes.modal.{title,content,visible}`. Add a sentence to "Why fixed names" reframing the invariant: the engine's *interaction vocabulary* is locked, not the bar's composition. |
| [designs/workflows-module/design.md](../../design.md)                                                                                | Add Part 36 row to the follow-on parts table; add a dependency note (depends on Parts 16, 4) and a one-line entry under "Follow-on parts" describing why it was spun out.                                                                                                                                                                                            |

## Files changed — demo app

One demo action should exercise the slot for e2e coverage. The cheapest exercise is **Open Help** on a form action's edit page — a `Link` action firing on `onClick`, no new endpoint or Lambda required. Pick `onboarding/qualify.yaml` (a form action with an `edit` page; `installation/install-step.yaml` is `kind: simple` and has no `pages.edit` slot, and `installation/installation.yaml` is the workflow file, not an action) and add:

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

## Why the locked-verb invariant survives

The interaction → target-status table in submit-pipeline Decision 3 keys on the `interaction` string the per-action endpoint receives. Template-shipped buttons hardcode the interaction value in their `CallAPI` payload (`interaction: submit_edit`, `interaction: approve`, etc.). Extras carry author-defined `events.onClick` action arrays — typically these don't touch the engine endpoint at all (they call app APIs or Lambdas or just navigate). If an author writes an extra that *does* CallAPI the per-action endpoint with a recognised interaction, the engine simply processes it as that interaction. The engine has no concept of "where this call came from"; it sees a payload and processes it.

The reserved-id check in the validator prevents the more confusing case at the *block tree* level: an extra named `button_submit_edit` would render twice in the bar (once template, once author) and create ambiguous selectors in tests / Playwright fixtures. Rejecting the collision at build time keeps the bar's id space clean. It's a build-time cleanliness check, not a runtime engine boundary.

The locked-verb invariant therefore means: **the engine's recognised interaction vocabulary is closed** — adding a new interaction value is a deliberate engine-side change (a new locked-verb part). It does **not** mean: only template-shipped buttons can call the engine endpoint, or only the engine endpoint can be called from the bar, or extras must avoid status-changing behaviour. Extras can do whatever Lowdefy blocks can do; the engine's behaviour is determined by the payload, not the caller.

## Verification

- **Build passes.** `pnpm build` runs `makeWorkflowsConfig` against the demo workflow_config; the validator accepts the demo's `buttons.extra` entry and rejects (in a unit test) a synthetic action that uses a reserved id.
- **Demo page renders the extra button.** Opening `/workflows/{onboarding_workflow_id}/qualify-edit?action_id=...` in the demo shows the template's primary `Submit` button plus the author's "Help" button in the floating bar. Click the extra button → external docs link opens in a new tab — no engine call.
- **Unit tests.**
  - `makeWorkflowsConfig.test.js` — add cases: (a) valid `buttons.extra` array passes; (b) non-array `buttons.extra` rejected; (c) entry missing `id` rejected; (d) entry missing `events.onClick` rejected; (e) entry with `id: button_submit_edit` rejected on the `edit` page; (f) entry with `id: button_resolve_error` rejected on the `error` page; (g) `buttons.extra` on `view` rejected (no bar on view).
  - `makeActionPages.test.js` — add a fixture with `pages.edit.buttons.extra` set and assert the emitted page's `_ref.vars.page_config.buttons.extra` round-trips the author's array. (`makeActionPages` only forwards `page_config: action.pages?.[verb]` to the template var; the `_build.array.concat` that materialises the merged `actions:` array happens later inside Lowdefy's build-time YAML processing, so the resolver-level test can only assert the round-trip — the merged-list behaviour is covered by the "Build passes" item above.)
- **E2E (Part 22 supplements).** Part 22's smoke spec for the demo installation workflow adds one assertion: the new "Help" button is visible in the bar and clicking it navigates to the configured URL. Single line in the spec; coordinate ordering with Part 22.

## Out of scope

- **Additional locked verbs (`button_save_draft`, `button_report_issue`, future).** Each locked verb is its own part — owns its endpoint behaviour, status mapping, template rendering, and reserved-id registration. This part only opens the bar to author-supplied entries and registers the *currently-shipped* reserved ids. Future verb parts add their button block to the relevant template *and* add their id to `RESERVED_BUTTON_IDS` (the duplication is acknowledged in Proposed Change item 3).
- **Extras on `view` pages.** View today has no `floating-actions` bar; adding one is a separate UI design call. This part keeps view read-only with no button bar.
- **Extras on the workflow-overview page.** The overview is read-only chrome aggregating actions; it never had a per-action button bar. Out of scope.
- **Extras on simple-action pages.** Simple-action pages share one experience across every workflow (`ui/design.md:167`); adding per-action extras to them collapses that contract. If a real need surfaces ("this simple action needs a side-button"), the answer is to convert the action to `kind: form` with an empty form, not to extend the shared simple pages.
- **Reordering template buttons via author config.** Authors cannot reorder the locked verb buttons; their position in the bar is fixed by the template. Extras only render after the verb buttons.
- **A dedicated `pages.{verb}.modals:` slot.** Author modals live in `pages.{verb}.formFooter:` and are opened via `CallMethod` from button `onClick`. A separate slot adds no capability over `formFooter` since Lowdefy modals overlay regardless of declaration position. If practice shows `formFooter` is awkward, a follow-on part introduces whichever shape the evidence warrants.
- **Inline `modal:` sub-field under each extra.** Same deferral: multiple extras sometimes open the same modal, and an inline shape collapses to one modal per button. Re-evaluate if a real awkwardness surfaces.
- **An `extras` slot on the layout module's `floating-actions` component.** This part extends the workflows templates' use of `floating-actions`; the layout component itself already accepts an arbitrary `actions:` array and needs no change.
- **Per-button role gates as a first-class field.** Fine-grained per-button role checks remain the author's job via `visible:` / `disabled:` operators using `_state: action_allowed` (set by the page's `action_role_check` mount step). No new shape.

## Related

- Source design: [workflows-module-concept/action-authoring/design.md § Decision 8 — Per-page chrome](../../../workflows-module-concept/action-authoring/design.md), [workflows-module-concept/ui/design.md § Decision 4 — Chrome blocks](../../../workflows-module-concept/ui/design.md).
- Existing per-verb `buttons.{name}` config knobs precedent: [action-authoring § Error pages](../../../workflows-module-concept/action-authoring/design.md) (`pages.error.buttons.submit.{title,modal}`).
- Layout component this part extends use of: [modules/shared/layout/floating-actions.yaml](../../../../modules/shared/layout/floating-actions.yaml).
- Page templates: [modules/workflows/templates/edit.yaml.njk](../../../../modules/workflows/templates/edit.yaml.njk), [review.yaml.njk](../../../../modules/workflows/templates/review.yaml.njk), [error.yaml.njk](../../../../modules/workflows/templates/error.yaml.njk).
- V0 inventory that grounded the design: `/Users/sam/Developer/mrm/prp/apps/shared/workflow_config` — 17 action configs use `buttons.additional`; representative examples include `site-check` (Save In Progress — now becoming a locked verb), `technician-on-site` (Report Issue — also becoming a locked verb; Resend Reminder remains a genuine extra), and `devices-assignment-request` (Unassign, Accept For Technician — modal-confirm side-effect pattern).
- Workflows module implementation tracker: [designs/workflows-module/design.md](../../design.md). Lands as a follow-on in the same spirit as Parts 24 and 28 — small extension to a shipped resolver and shipped templates without reopening any already-completed part.
