# Review 2 — Post-reconciliation check against templates, validator, Lowdefy blocks, and v0 inventory

Verified after the signal-model reconciliation (Parts 38/39) and the Review 1 resolutions. The slot design, `_build.array.concat` wiring, and locked-signal reasoning all check out — `_build.array.concat` exists (`lowdefy/packages/plugins/operators/operators-js/src/operatorsBuild.js`), `_var: { key, default }` is supported (`packages/build/src/build/buildRefs/walker.js:255-266`), `floating-actions.yaml` takes an arbitrary `actions:` array with `direction: row-reverse`, `makeActionPages.js:70` forwards `page_config` as claimed, and the v0 inventory citations for `buttons.additional` (17 files), site-check Save In Progress, and devices-assignment-request modal-confirm all verify. The findings below are what doesn't.

## Factual errors

### 1. `CallMethod` with `method: open` does not exist on the `Modal` block

> **Resolved (auto).** Verified against `Modal.js` (registers `toggleOpen`/`setOpen`) and `ConfirmModal.js` (registers `open`). YAML example now uses `method: toggleOpen`; "How modals work" documents the per-block-type method split with the v0 confirmation; flow step 2 and the ConfirmModal/Modal paragraph carry the difference.

"Modals with extras" (line 105) claims: "Open it from any action chain via `CallMethod` with `{ blockId: <modal_id>, method: open }`", and the YAML example (lines 80-84) opens a `type: Modal` block with `method: open`. The `Modal` block registers only `toggleOpen` and `setOpen({ open })` (`lowdefy/packages/plugins/blocks/blocks-antd/src/blocks/Modal/Modal.js:45-50`). `open` is a `ConfirmModal`-only method (`ConfirmModal.js:33`). The example as written fails at runtime.

v0 confirms the split: `technician-on-site.yaml` opens its `Modal` via `toggleOpen`; `devices-assignment-request.yaml` opens its `ConfirmModal`s via `open`.

**Fix:** In the YAML example and the "button → modal flow" step 2, use `method: toggleOpen` (or `method: setOpen` with `args: [{ open: true }]`) for `Modal`, and note `method: open` applies to `ConfirmModal` only. The "works identically for ConfirmModal and Modal" paragraph (line 115) should carry the method difference.

### 2. The `buttons.request_changes.modal.{title,content,visible}` knob shape doesn't exist — the design instructs writing a wrong "correction" into the concept docs

> **Resolved (auto).** Verified against `review.yaml.njk` (request_changes reads `.visible`/`.disabled` only; the approve modal knob is `buttons.approve.modal.{title,content}`). All four spots corrected: Proposed Change item 1's example knob (now `buttons.approve.modal`), the README row (approve as worked example, request_changes `.visible`/`.disabled` only), and both concept-doc rows (knobs on `submit`/`not_required`/`approve`/`resolve_error`; request_changes modal mandatory, no knobs).

Three places assert that the request-changes modal overrides live under `buttons.request_changes.modal.{title,content,visible}` "per the shipped `review.yaml.njk`": the action-authoring files-changed row (line 155), the ui files-changed row (line 156), and the README row's "(with the request-changes modal example)" (line 145).

The shipped `review.yaml.njk` reads only `page_config.buttons.request_changes.visible` (line 230) and `.disabled` (line 242); the request-changes modal itself (`review.yaml.njk:317`) is mandatory and carries **no** title/content/visible knobs. The `.modal.{title,content}` knob shape exists for the *other* buttons: `submit_edit` (`edit.yaml.njk:343,348`), `not_required` (`edit.yaml.njk:397,402`), `approve` (`review.yaml.njk:389,394`), `resolve_error` (`error.yaml.njk:312,320`). Part 39 keeps this split — its both-payload-copies rule (Part 39 design line 65) lists modal-knob buttons as `submit`/`not_required` (edit), `approve` (review), `resolve_error` (error); request_changes stays a mandatory comment modal.

**Fix:** Everywhere the design describes the `buttons.{signal}.modal` knob, use `approve` (or `submit`) as the worked example, and describe `request_changes` as carrying `.visible`/`.disabled` only. The concept-doc correction tasks must write *this* shape, or they replace one stale doc claim with another.

### 3. "Visibility and role gating" is wrong on both mechanics: the state key is per-verb, and there is no role-based redirect

> **Resolved (auto).** Verified against `action_role_check.yaml` (writes the `{ view, edit, review, error }` object, header says defence-in-depth only) and `edit.yaml.njk` (reads `action_allowed.edit`; only mount redirects are no-action and stale-status). YAML example now gates on `_state: action_allowed.edit`; the role-gating paragraph rewritten: per-verb bool, no role redirect, extras get no implicit gating, app endpoints must do their own server-side checks. Out-of-scope per-button-role-gates item also corrected to `action_allowed.{verb}`.

Line 125 claims "The action's role gate writes `action_allowed: true/false` into page state" and "the page redirects if `action_allowed` is false on mount", and the YAML example (lines 75-78) gates on `_state: action_allowed`.

Both are wrong against the shipped code:

- `components/action_role_check.yaml` writes an **object** — `action_allowed: { view, edit, review, error }` — and the templates read the verb-specific bool (`_state: action_allowed.edit` at `edit.yaml.njk:207,270`). The design's `disabled: { _ne: [{ _state: action_allowed }, true] }` compares an object to `true` and is **always disabled**.
- There is no role-based mount redirect. The component header says explicitly "defence in depth only … decide which controls to show"; the only mount redirect on edit is the stale-*status* guard (`edit.yaml.njk:65` `redirect_stale_status`). "Extras inherit the page-level role gate implicitly" is therefore false — an extra with no `visible`/`disabled` gate renders fully clickable for users without the verb role (server-side checks still protect engine writes, but an extra's `CallAPI` to an *app* endpoint is only as protected as that endpoint).

**Fix:** Change the example and prose to `_state: action_allowed.{verb}` (the verb of the page the extra is on), delete the redirect claim, and state plainly that extras get **no** implicit role gating — authors who need it must gate `visible`/`disabled` themselves, and app endpoints called from extras must do their own server-side checks.

### 4. v0 citation: "Resend Reminder only on `in-progress`" is not what v0 does

> **Resolved (auto).** Verified `appointment_reminder_button.yaml` gates on `appointment_date` + `technician.contact_id` presence, not stage. Citation corrected: site-check Save In Progress stands as the lone v0 stage-gating example; the Resend stage gate in the YAML shape is explicitly labelled an illustration, not a v0 citation.

Line 123 cites "Resend Reminder only on `in-progress`" as a v0 stage-gating example. The shared `appointment_reminder_button.yaml` has no stage constraint — it's visible when `appointment_date` and `technician.contact_id` exist. The site-check "Save In Progress" citation (stages `[action-required, in-progress, changes-required]`) is correct and suffices.

**Fix:** Drop or correct the Resend Reminder citation (it's also reused at line 5 and in the YAML example's stage list — the example itself is fine as an *illustration*, just don't attribute the stage gate to v0).

### 5. v0 declares modals in `formHeader`, not `formFooter`

> **Resolved (auto).** Verified v0's modals live in `formHeader` (`devices-assignment-request.yaml`, `technician-on-site.yaml`). Dropped the v0-match justification; the design now says either chrome slot works since modals overlay, `formFooter` is the documented convention, and ports relocate the block (a one-line move). The `formFooter` convention itself is unchanged.

Lines 107 and 117 claim declaring modals in `formFooter` "matches the v0 pattern (`formFooter` + `CallMethod`) and keeps the port path frictionless". v0 declares its modals in **`formHeader`** (`devices-assignment-request.yaml:201,233`; `technician-on-site.yaml:214-252`). The recommendation (a tidy home that overlays anyway) is fine; the v0-match claim is wrong, and a mechanical port moves the modal block between slots.

**Fix:** Say "either chrome slot works since modals overlay at render time; we document `formFooter` as the convention" and drop the v0-match justification, or note ports relocate the block from `formHeader`.

## Design gaps

### 6. The validator as specced cannot produce test case (g) — `buttons.extra` on `view` would be silently ignored, not rejected

> **Resolved (auto).** Option (a) — the design's own test (g) already encoded the rejection intent; the spec prose was internally inconsistent with it. Proposed Change item 3 and the validator files-changed row now spell out the explicit rejection of `pages.view.buttons.extra`, noting `validateAction` does no `pages` structure validation today so the explicit check is required to avoid silent drop.

Proposed Change item 3 and the `makeWorkflowsConfig.js` files-changed row describe the check as "for each verb that supports a bar (`edit`, `review`, `error`), if `pages.{verb}.buttons.extra` is set, assert …". Verification test (g) expects "`buttons.extra` on `view` rejected". Those two contradict: a loop over `edit`/`review`/`error` never visits `pages.view`, and the validator today performs **no** `pages` structure validation at all (`validateAction`, `makeWorkflowsConfig.js:274-304`) and does not reject unknown keys — `pages.view.buttons.extra` would pass through to the view template and be silently dropped.

**Fix:** Either (a) add an explicit rejection: for verbs *without* the slot (`view`), error if `pages.{verb}.buttons.extra` is present — this is the right call given the design's own out-of-scope note ("a follow-on adds `view`"), since silent ignore is exactly the drift the validator exists to prevent; or (b) drop test (g) and document that `buttons.extra` on view is ignored. Pick (a) and word the validator spec to match.

### 7. The reserved set omits the non-signal bar buttons (`button_edit` today; view's Edit-nav button post-Part 39)

> **Resolved.** Added `button_edit` (review) to the reserved set with the rationale spelled out — the collision check is about block ids in the bar, not signals, so nav buttons reserve too. Added test case (f2): `id: button_edit` rejected on review. View needs no entry: the validator rejects `pages.view.buttons.extra` outright (finding #6), so the view Edit-nav id (unnamed in Part 39; `button_edit` the obvious mirror) becomes the concern of the follow-on that opens extras on view.

The reserved-id rationale (line 191) is block-id collisions *in the bar* — duplicate ids, ambiguous Playwright selectors. That rationale applies to every template-shipped block in the bar, not just signal buttons. Today's review bar ships `button_edit` (`review.yaml.njk:195`, a navigation button), and Part 39's view bar carries an Edit navigation button (Part 39 design line 76). Neither appears in `RESERVED_BUTTON_IDS` (Part 39's rebase notes at line 212 omit it too — but that list was explicitly "to be folded into Part 36's design", and Part 36 owns the constant).

**Fix:** Add the nav-button ids to the reserved set for the pages that ship them (`button_edit` on review; whatever id Part 39's view nav button gets — coordinate the name with Part 39 before either lands), or state why only signal-button ids are reserved despite the collision rationale covering nav buttons.

### 8. `RESERVED_BUTTON_IDS` shape vs per-page semantics (residual of Review 1 #5)

> **Resolved.** In the opposite direction from the proposed fix: semantics flattened to **global** — any reserved id rejected on every verb page — keeping the flat-list constant. Per-page semantics would only buy authors the ability to name an edit-page extra `button_approve` (confusion fuel even when collision-free), and global reservation self-protects when buttons move between pages. Added test (f3): `button_approve` in `pages.edit.buttons.extra` rejected, pinning the global semantics the way the review's positive test would have pinned per-page.

Proposed Change item 3 now states per-page semantics — "no entry uses a reserved id matching a template-shipped signal button **on that page**" — and the test cases are per-page ((e) on edit, (f) on error). But the design still describes the constant as one flat list. A flat list can't express verb→ids, and the per-page distinction is untested in the positive direction.

**Fix:** Define the constant as a per-verb map — `RESERVED_BUTTON_IDS = { edit: [...], review: [...], error: [...] }` (plus `view` if finding #7 lands) — and add one positive test: `id: button_approve` in `pages.edit.buttons.extra` **passes** (no approve button on the edit bar). Without that test the implementation can ship global semantics and all listed cases still pass.

### 9. The roadmap dependency note omits Part 39 — and the design's "Files changed" describes templates in a state that doesn't exist yet

> **Resolved (auto).** Roadmap row now reads "depends on Parts 16, 4, 39". The reconciliation banner gained the honest framing the tasks file already had: Part 39 is design-only, every "post-Part 39" template description is aspirational, the constant naming not-yet-existing ids is acceptable, and Part 39's rewrite must preserve the concat wrapper.

The `designs/workflows-module/design.md` files-changed row (line 157) says "add a dependency note (depends on Parts 16, 4)". The design hard-depends on **Part 39**, which is design-only — the shipped templates still carry `button_submit_edit`, `interaction:` payloads, no `button_progress`, and no view bar (`view.yaml.njk:14`: "View is read-only — no buttons"). Every "post-Part 39" description in the files-changed table (edit bar "carries three signal buttons", view bar exists per D4) is aspirational. The tasks file already handles this honestly (`tasks/tasks.md:32-36`: prefer landing Part 39 tasks 2-4 first; the concat wiring is name-agnostic either way) — but the design, which is the source of truth, doesn't say it.

**Fix:** Change the roadmap row to "depends on Parts 16, 4, **39**" and add one sentence to "Why a dedicated part" or the reconciliation banner: the reserved-id names and the three-button edit bar assume Part 39 has landed; if Part 36 lands first, the constant names ids that don't yet exist in templates (acceptable — it guards author config) and Part 39's template rewrite must preserve the concat wrapper.

## Carried over from Review 1 (no resolution annotations)

### 10. Review 1 #6 — the `additional` → `extra` rename is still unjustified

> **Resolved.** Kept `extra`; added the rationale sentence to Proposed Change item 1: ports already rewrite the surrounding config (modal home moves, per-verb role-gate key, interaction→signal vocabulary), so v0's `additional` buys no mechanical-port friction reduction, and `extra` matches the design's template-shipped-vs-extras vocabulary.

The design now cites v0's `buttons.additional` (line 222) but still gives no rationale for the rename. One sentence settles it — e.g. "ports rewrite the slot contents anyway (modal homes move, `method:` names differ per finding #1/#5), so the lower-friction name buys nothing", or rename to `additional` if the port story is meant to be mechanical.

### 11. Review 1 #8 — Part 22 coordination is still deferred, and the facts have shifted in favour of self-owning the spec

> **Resolved.** Self-owned: the Verification e2e bullet now adds the Help-button assertion to the existing `onboarding-happy-path.spec.js` in this part's diff, with no Part 22 coordination (Part 22's rebased plan keeps example-workflow specs as tier 1, so it absorbs the line). The bullet carries the honest caveat that the happy-path spec is itself deferred-verification (written ahead of Part 38 t17 / 43 / 44 prerequisites and not yet runnable), so the assertion verifies nothing at ship time — live verification stays with the build-passes and demo-render checks. Task 6's "coordinate with Part 22" wording to be aligned at consistency review.

Part 22 remains design-only (now in `parts/_next/`), but a spec home already exists: `apps/demo/e2e/workflows/` has three specs today. The Verification section still says "coordinate ordering with Part 22". Cheaper and unblocked: add the one-line Help-button assertion to a spec in the existing folder as part of this part's diff, and let Part 22 absorb it when it lands. Make that the decision rather than deferred coordination.
