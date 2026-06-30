# Review 1

Scope check first: the design's factual claims hold up against source.

- `applyUpdateFieldsRule(fields, kind)` and its `if (kind === "check") return fields;` branch are exactly at `planActionTransition.js:23-29`; the call site is `planActionTransition.js:205`; the insert path spreads `...payload.fields` verbatim at `:195` (so start-time seeding is genuinely untouched). ✓
- The test the design says to rewrite exists: `planActionTransition.test.js:107` (`check kind update: payload.fields is a verbatim passthrough (universal keys written)`), asserting `result.doc.assignees`/`due_date` are written. ✓
- Both check surfaces send `fields` on `submit`/`progress` and run the `^current_action\.fields\.` `Validate` before submit (`check-action-surface.yaml:371,443,461`; the workspace page mirrors this). ✓
- The converged fragments exist with the var interfaces the design wires (`universal-fields-chips.yaml`, `universal-fields-modal.yaml`, `action-description.yaml`, `modules/shared/layout/title-block.yaml`), and `_ref: ../shared/...` resolves module-root-relative to `modules/shared/...`. ✓
- `current_action.assignee_docs` / `current_action.due_date` are present in the modal: the open handler spreads the full `GetWorkflowAction` response into `current_action` (`check-action-modal.yaml:102`) and the current inline surface already reads `current_action.assignee_docs` (`check-action-surface.yaml:169`), so the chips' source is real. ✓

Findings below.

## Documentation / comment consistency

### 1. The status-history/pruning rationale also lives in `check-action-modal.yaml`, which the design doesn't update

D4 says "only the explanatory comment in `check-action-surface.yaml` changes," and Files changed lists only the surface (plus the engine and `action.yaml.njk`). But the pruning rationale is duplicated in the modal **container** too: `check-action-modal.yaml:49-65` (header) and the inline comments at `:91-98` and `:111-114` justify the single-`SetState` `set_current_action` pattern entirely by the `current_action.status` List being pruned when hidden. Once this part deletes that List, `current_action.status` is bound by no block and never pruned — so that justification is stale in the modal file, exactly as it would be in the surface.

The workspace page already carries the corrected wording (`action.yaml.njk:39-43`): "This page omits the status-history List, so `current_action.status` is never bound by a block and never pruned — but the single-SetState pattern is preserved for parity."

**Fix:** Add `check-action-modal.yaml` to Files changed and converge its header + `set_current_action` comments to the `action.yaml.njk:39-43` wording. The _behavior_ (single SetState, derive mode from `_request`) stays — only the comment is wrong after the List is gone.

## Design vs mockup fidelity

### 2. The chosen mockup (Option B) depicts an eyebrow and a subtitle that D3 removes — so no mockup shows the as-built header

The mockup's Option B (`mockups/mockup.html:296-315`) renders the full `title-block`: a `.eyebrow` ("Onboarding") **and** a `.sub` subtitle ("Review and accept the qualification."). D3 and the chosen-option callout (`mockup.html:273`) both strip the eyebrow _and_ pass no `description`/`doc`, so there is **no subtitle**. The as-built header is therefore: status pill (left) · bare 23px title · chips — which no mockup actually depicts.

This matters because Option B's own note already warns the "big title + eyebrow can feel page-sized inside a modal" (`mockup.html:295`); removing the eyebrow and subtitle leaves the large `<h2 class="text-2xl font-semibold">` (`title-block.yaml:183`) standing alone with nothing above or below to balance it. The header that was visually validated is not the header being built.

**Fix:** Add (or revise Option B to) a mockup of the true target — pill · bare title · chips, no eyebrow, no subtitle — and confirm the lone large title reads acceptably in the 750px modal. If it looks unbalanced, Option A (the compact `level: 4`-style title) is the fallback the design should explicitly weigh against, not assume away.

### 3. `title-block` is sized for full-page headers; it will render heavier than the mockup

The real component is page-scaled in ways the mockup under-represents:

- Status pill: `title-block.yaml:102` is `padding:15px 14px; font-size:15px` — the mockup's `.pill.lg` is `padding:8px 14px; font-size:14px` (`mockup.html:227`), i.e. roughly half the vertical height. The shipped pill is markedly chunkier.
- Title: `<h2 class="text-2xl font-semibold">` (`title-block.yaml:183`).
- `page-actions` Box carries `style: { margin: 16 }` (`title-block.yaml:213-214`), which will sit _inside_ the modal Card whose own `layout.gap` is 16 — stacking margin onto gap and pushing the chips off the right/top edges asymmetrically.

**Fix:** Render the real component in the 750px modal (build + screenshot, or a mockup using the real pill/title metrics) before committing to it. In particular check the `page-actions` `margin:16` against the Card gap — it may need overriding to `0` in the modal context. Note this is also the empty-subtitle case: with no `description`/`doc`, `title-block.yaml:184-196` still emits an empty `<div class="text-text-secondary text-sm">`, leaving a small dead gap under the title (same as the workspace page — consistent, just confirm it's acceptable in the tighter modal).

## Engine

### 4. Removing the `kind` branch also changes the pre-hook auxiliary update path — the audit scope is wider than the two surfaces

> **Resolved.** Reshaped rather than audited around: the engine rule is re-gated on transition `source` instead of `kind`. `source === "user"` strips universal keys (uniform across kinds, replacing the check exception); `auxiliary`/`cascade` pass them through, so the hook/cascade seeding path this finding flagged is *preserved by design* — no silent drop to audit for. D1 now scopes the guarantee to user submits, non-goal #2 flips from "deferred" to "preserved," and the engine/test bullets switch to the source gate (added an auxiliary-source passthrough test). Aligns with "don't over-restrict / absence of a caller is not absence of need."

The design frames the behavioral change as "both check surfaces stop sending `fields`," and the engine branch becomes dead "with both check surfaces no longer sending `fields`." But `applyUpdateFieldsRule` is also reached by the **auxiliary/cascade** signal path: `planSubmit.js:88` plans `payload: { fields: aux.fields, ... }`, and hook payloads forward author-declared `fields` (`buildHookPayload.js:38`). After the branch is removed, a pre-hook that seeds `assignees`/`due_date` onto an **already-existing** check action via `fields` will silently stop persisting them (the insert/upsert spawn path still writes them — only the update path strips).

Non-goal #2 acknowledges this direction ("no transition can carry universal fields for any kind"), so it's intended — but the **audit** in Files changed names only `planSubmit.test.js` / `SubmitWorkflowAction.test.js` and the two surfaces. No demo workflow seeds universal fields via hook `fields` (grep of `apps/demo/modules/workflows/` is clean), but production hooks aren't visible from this repo.

**Fix:** Widen the audit note to explicitly include hook-declared `fields` (the auxiliary path), not only client surfaces — and state plainly that mid-life universal-field seeding via a check transition is being removed for _all_ callers, so any such hook must move to `UpdateActionFields`.

## Behaviour

### 5. The field-edit reseed wipes an in-progress comment in the modal

> **Resolved.** Dropped the `current_action.comment` / `change_request_comment: null` resets from the **field-edit** `on_complete` reseed on both surfaces (modal authors its reseed without them; `action.yaml.njk`'s existing field-edit reseed loses them). The `GetWorkflowAction` response never carries those keys, so omitting the resets preserves a typed comment while everything else refreshes. The **post-signal** reseed keeps its resets (the transition consumed the comment). D5 updated; "one correct way" = field-edit reseeds preserve comments, signal reseeds clear them.

D5's `on_complete` reseed is "the same spread+seed the open handler runs." The open handler — and the workspace page's field-edit reseed (`action.yaml.njk:942-943`) — set `current_action.comment: null` and `current_action.change_request_comment: null`. So in the modal: a reviewer types a comment, opens the ✎ edit modal to fix a due date, hits Update → `on_complete` reseeds → the typed comment is wiped. Editing a side field is not a transition and shouldn't discard submission-in-progress text.

This is pre-existing on the workspace page and replicating it keeps the surfaces consistent (the design's stated goal), so it's not a regression _introduced_ here — but the modal is explicitly "a quick in-context shortcut" (design ¶3), where type-comment-then-edit-due-date is a plausible flow, so the papercut bites harder.

**Fix:** Consider dropping the `current_action.comment` / `current_action.change_request_comment` resets from the **field-edit** `on_complete` reseed specifically (they belong on the post-_signal_ reseed, where the action transitioned). Apply to both surfaces to preserve "one correct way." If kept as-is for consistency, add a one-line note in D5 acknowledging the comment loss is deliberate.

## Minor

### 6. D3 "configured exactly as the workspace page configures it" is imprecise on the status path

> **Resolved (auto).** D3 now reads "configured as `action.yaml.njk` does, except it reads the `current_action.stage` scalar (D4) in place of the page's `status.0.stage` (equivalent values)" — no longer claiming identical wiring.

The workspace page passes `status: current_action.status.0.stage` (`action.yaml.njk:78-79`); the modal (Files changed line 90) passes `status: current_action.stage` (the scalar). Both resolve to the same value, and the scalar is the correct choice in the modal per D4 — but "exactly as" overstates it. Minor wording: say "configured as the workspace page does, reading the `current_action.stage` scalar (D4) in place of the page's `status.0.stage` — equivalent values."
