# Review 1 — Page-template design coverage and contract alignment with parts 12 / 15 / 18

## Contract mismatches

### 1. `chrome` var name vs. `pages.{verb}.*` shape — design contradicts part 12's actual emission

> **Resolved.** Renamed the resolver's top-level var from `chrome` → `page_config` (parallels `action_config`; avoids overloading "chrome" which the codebase uses broadly for page framing). Dropped `pages` from `ACTION_FIELDS_FOR_TEMPLATE` so there's one canonical path. Updated [makeActionPages.js](modules/workflows/resolvers/makeActionPages.js), its test, [resolvers/README.md](modules/workflows/resolvers/README.md), [part 12 design.md](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/design.md), and [part 12 task 02](02-make-action-pages.md). Part 16's section rewritten against `page_config.*`. All `makeActionPages` tests pass.

The design's "Per-action template chrome overrides" section (lines 64–66) describes overrides as `pages.{verb}.title`, `pages.{verb}.requests`, `pages.{verb}.formHeader`, `pages.{verb}.formFooter`, `pages.{verb}.modals.{name}`, `pages.error.buttons.submit.{title, modal}`. But the resolver in [makeActionPages.js:51-66](modules/workflows/resolvers/makeActionPages.js) already lifts that slice into a flat top-level template var named `chrome` (`chrome: action.pages?.[verb] ?? {}`), explicitly so "templates consume it directly instead of digging through action_config.pages.{verb}".

Pick one and document it:

- **Option A — keep `chrome:` (recommended, matches shipped resolver).** Rewrite the section as `chrome.title`, `chrome.requests`, `chrome.formHeader`, `chrome.formFooter`, `chrome.modals.{name}`, `chrome.buttons.submit.{title, modal}` (the last on `error.yaml.njk` only). Note that `action_config.pages` is still picked into the template by [makeActionPages.js:17](modules/workflows/resolvers/makeActionPages.js) (in `ACTION_FIELDS_FOR_TEMPLATE`) but the per-verb chrome should be read off `chrome.*`, not `action_config.pages.{verb}.*`. Decide whether `pages` should drop out of `ACTION_FIELDS_FOR_TEMPLATE` to remove the duplicate path.
- **Option B — switch to `action_config.pages.{verb}.*`.** Update [makeActionPages.js:65](modules/workflows/resolvers/makeActionPages.js) to drop the `chrome` var, and rewrite this part's section against the `action_config.pages.{verb}` path. More keystrokes per template lookup but keeps the action-config blob whole.

This isn't a "documentation polish" finding — templates and the resolver are wired through opposite vocabularies right now, and the first template that lands will pick one and fossilise it.

### 2. `not_required` button row in the vocabulary table omits the `view`/`edit` toggle rule

> **Resolved.** Adopted edit-only, opt-in via `page_config.buttons.not_required.visible: true`. Dropped the view-surface placement entirely — view is read-only, and adding a write button there violates that contract. Updated [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md) (template description, button vocabulary table, new "`not_required` opt-in" subsection) and amended the concept spec ([ui/spec.md](designs/workflows-module-concept/ui/spec.md), [ui/design.md](designs/workflows-module-concept/ui/design.md)) to match. Also documented the additional gates: `_state.action_allowed === true` (from `action_role_check`) and stage priority > 0 (hides once already `not-required`).

The button vocabulary table (lines 38–44) lists `not_required` with template `view`/`edit` and event `onSubmit` (if on `edit`). The concept spec ([ui/spec.md § Template-shipped button vocabulary](designs/workflows-module-concept/ui/spec.md)) is more specific: it ships on `view.yaml.njk` always, and **optionally** on `edit.yaml.njk`. The design's "Optional `not_required` button on `edit` if `view` is also in the access list" (line 17) hints at this gating but doesn't state the rule cleanly: the toggle is **per-action opt-in**, not "view also in access". The opt-in surface is missing — there's no documented author switch (`pages.edit.buttons.not_required: true`? a top-level action flag? the action's `interactions.not_required:` map?). Without that, the template has no signal for whether to render the button on `edit`.

**Fix:** Pick the opt-in surface and document it here. Two candidates:

- (a) Treat `not_required` as an `access.{app_name}` verb in its own right (concept currently lists only `view`/`edit`/`review`/`error`).
- (b) Author signal via `pages.edit.buttons.not_required.visible: true` (matches v0's `edit.buttons.not_required.visible` knob in [`dist/.../edit.yaml.njk:191-196`](dist/workflows-module/ui/current_workflow_utils/templates/edit.yaml.njk)).

Option (b) is the minimal change and matches v0's surface; option (a) is cleaner but reshapes the access vocabulary. Either way, lock it before the template lands.

### 3. Missing `Edit` button on `review.yaml.njk`

> **Resolved.** Adopted option (a): `Edit` ships on `review.yaml.njk` as a **navigation button**, separate from the interaction-button vocabulary. Renders iff `page_ids.edit` is defined (edit verb in this app's access list). Links to `-edit` with `input: { skip_status_redirect: true }` so the edit page's stale-URL guard (allowlist `[action-required, in-progress, changes-required]`) doesn't redirect away from `in-review`. v0-parity override knobs `page_config.buttons.edit.visible` and `page_config.buttons.edit.disabled` exposed. Updated [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md) (template description, button-vocabulary section split into "interaction buttons" vs. "navigation buttons") and [concept ui/spec.md](designs/workflows-module-concept/ui/spec.md) to match. The "immutable vocabulary" claim now applies to interaction buttons only — navigation is a distinct category.

v0's review template ships an `Edit` button ([`dist/.../review.yaml.njk:235-264`](dist/workflows-module/ui/current_workflow_utils/templates/review.yaml.njk)) — a `Link` to `page_ids.edit` with `input.skip_status_redirect: true`. That input is what lets reviewers re-open the edit page after status has moved to `in-review` (v0's edit-page `onMount` has a guard at lines 71–82 that otherwise redirects away from `edit` once status leaves `[action-required, in-progress, changes-required]`).

The part 16 design's button vocabulary (lines 38–44) lists five buttons and calls them "immutable, fixed across templates" but doesn't list `Edit`. Either:

- (a) Add `Edit` to the vocabulary table for `review.yaml.njk`. It doesn't fit the "fires an event + calls `update-action-{action_type}`" shape — it's pure navigation — so document it as a navigation button separate from the interaction buttons, gated on `page_ids.edit is defined` (i.e. edit verb in access).
- (b) Explicitly drop `Edit` and document the rationale (e.g. reviewers can no longer round-trip back to edit; if they `request_changes` the action returns to `changes-required` and the assignee re-opens edit). This is a real behavior change from v0 that consumers will hit.

### 4. Status-stage `onMount` redirect guards are unspecified for `edit`, `view`, `review`

> **Resolved.** Added "Stale-URL redirect guards (all templates)" subsection in [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md). Allowlists hardcoded per template (`edit: [action-required, in-progress, changes-required]`, `review: [in-review, error]`, `error: [error]`, `view`: no guard), `_input: skip_status_redirect` retained as the edit-page escape hatch for the review→edit round-trip. Rejected schema-driven allowlist (`allowed_on.{verb}` on `action_statuses`): the allowlists don't reduce cleanly to priority or per-stage flags, and pushing them to the enum just relocates the same decision without reducing risk. New statuses trigger a deliberate template review.

The design documents the stale-URL guard for `error.yaml.njk` (line 32: redirect to `-view` when `status[0].stage !== 'error'`), but the v0 templates also carry status-aware redirect guards on `edit` and `review`:

- v0 `edit.yaml.njk:71-82`: skip-redirect to `-view` unless `status[0].stage ∈ [action-required, in-progress, changes-required]` (or `input.skip_status_redirect` is true).
- v0 `review.yaml.njk:67-75`: skip-redirect to `-view` unless `status[0].stage ∈ [in-review, error]`.

Either the part 16 templates preserve these guards (likely the right call — they prevent users opening stale URLs after status moves) or they explicitly drop them. The design is silent. Add a paragraph next to "Stale-URL guard on `onMount`" stating which guards each template carries, and where the stage allowlists come from (hardcoded? read from `global.action_statuses`? read from the engine's status-priority order?).

A hardcoded allowlist will break the moment someone adds a new status; reading from `global.action_statuses.{stage}.allowed_on.{verb}` (or similar) keeps the templates schema-driven.

### 5. `current_key` / `fields` payload contract — payload assembly not specified

> **Resolved.** Added "Button payload" subsection in [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md) committing the full payload shape: `action_id` from `_request: get_action._id`, `current_key` from `_request: get_action.key`, `form` / `form_review` / `fields` / `comment` from state subtrees, plus `current_status` only on task `submit_edit`. State-path conventions documented per CLAUDE.md's "Input block IDs match data paths" rule — universal-field inputs use `id: fields.assignees` etc., comment uses `id: comment` (top-level scalar, not nested under `event.metadata.*`). Comment-to-event mapping moved to the API boundary: added "Comment mapping" subsection in [part 13 design.md](modules-mongodb/designs/workflows-module/parts/_completed/13-resolver-apis/design.md) defining the 4-layer merge order (engine default < YAML `event_overrides` < runtime comment < pre-hook overrides) and the resolver-side `comment: { _payload: 'comment' }` emission. Resolver shipped + tested. Handler-side wiring (handleSubmit + dispatchLogEvent) documented as a pending part-6 follow-up under "Pending handler work" — fold-in, not a new part.

The button-vocabulary table (line 46) says every button "calls `update-action-{action_type}` with the right `interaction` + `form` / `form_review` / `fields` / `current_key` payload". The submit-pipeline spec confirms the payload shape ([submit-pipeline/spec.md:281-303](designs/workflows-module-concept/submit-pipeline/spec.md)). But the template never builds this payload manually in v0 — and the design doesn't say where it lives in v1 either. Three questions are open:

- Where does `current_key` come from? Submit-pipeline says `{ _request: get_action.key }`. Confirm this in the template design (and confirm `get_action` is the request id the template wires up — see Finding 6).
- Where does `fields` come from? Universal-fields block writes to `_state.fields`? Or each universal input writes directly to `_state.fields.{assignees|due_date|description}`?
- Where does the `comment` from `event.metadata.comment` (line 28) get assembled? Is it `_state.comment` that the button merges into `payload.event.metadata.comment`, or does the comment flow as a top-level field?

Without these answers, every button block has to be re-designed when the templates land. Pin them now.

## Coverage gaps

### 6. `get_action` and entity fetch requests — no provenance

> **Resolved.** Added "Module-shipped requests" subsection and "Template `onMount` sequence" subsection in [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md). Three requests ship under `modules/workflows/requests/`: `get_action` (matches by `_url_query.action_id`), `get_workflow` (matches by `_request: get_action.workflow_id` — needed because form_data lives on the workflow doc), `get_entity` (templates substitute `{{ entity_collection }}` from part 12's build-time var into the `connectionId` at Nunjucks render time). Fixed 8-step `onMount` sequence documented for all four templates.

The design says templates wire the form body, button vocabulary, and `onMount`, but doesn't say where `get_action` and entity-fetch requests come from. Part 12's design ([12-resolver-pages/design.md:31](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/design.md)) explicitly punts this to part 16: "page-level `events.onInit`, `requests:`, and the `get_action` request `_ref` live inside the template (part 16), not the shell."

That means part 16 must:

- Define and ship the `get_action` request (or `_ref` it from a module-internal `requests/` directory).
- Define how the action's entity is fetched. v0 templates use a per-app request file (`get_{{ entity_key }}.yaml`) keyed on `entity_key`. v1 has dropped `entity_key` in favor of `entity_collection` ([part 21](designs/workflows-module/parts/21-entity-type-to-collection/design.md)). So the v1 fetch needs to be `get_entity` that takes `entity_collection` as a `connectionId`-shaped var.
- Wire both into each template's `onMount` (currently the design only describes the error-page guard; the other three are silent on what happens at mount).

Add a "Module-shipped requests" subsection that lists the requests templates rely on and their `_ref` paths.

### 7. No mention of `action_role_check` integration

> **Resolved.** Adopted option (a): templates run `action_role_check` (part 18's shared primitive) in `onMount` as step 6, populating `_state.action_allowed`. Buttons gate visibility on `_state.action_allowed === true` (covered in the button-vocabulary updates that follow in findings #2/#3/#5/#16). Documented in [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md) under "Template `onMount` sequence".

v0 templates fire `action_role_check.yaml` in `onMount` (e.g. [`dist/.../edit.yaml.njk:98-101`](dist/workflows-module/ui/current_workflow_utils/templates/edit.yaml.njk)) and gate every submit/approve/request_changes button on `_state.action_allowed === true`. v1's part 18 ships `action_role_check` as a reusable access-check primitive. The design here doesn't mention it.

Three possibilities:

- (a) Templates run `action_role_check` on mount and gate buttons on the resulting state. Document it as a per-template `onMount` step alongside the stale-URL guard.
- (b) The check now runs server-side only (engine's role gate at submit time, plus query-time filtering in `get-entity-workflows`), and the template surfaces "unauthorized" via the API error response. This is a real UX regression from v0 (users see disabled buttons in v0; in v1 they'd see post-click errors).
- (c) The check lives in a parent component (e.g. `actions-on-entity` decides whether to even link here).

The concept spec ([ui/spec.md § action_role_check](designs/workflows-module-concept/ui/spec.md)) says it's "used by templates to conditionally render verbs". That commits to (a). Mirror that in this design and list it in the template `onMount` sequence.

### 8. `formHeader` / `formFooter` placement vs. the universal-fields band

> **Resolved + Deferred to part 24.** Split universal-fields surface into [part 24 — universal-fields](../../../24-universal-fields/design.md) (new dedicated design covering the cross-cutting questions: where editable vs. read-only, lifecycle rules including `required_after_close`, interaction model — kept on `submit_edit` not split into `update_metadata`, role gating — same `access.roles` as parent action, display rules including tracker compact mode). Part 16 now references the part-24 component via `_ref` in `mode: edit` (on `edit.yaml.njk`) or `mode: display` (elsewhere) — no inline universal-field authoring. Added "Block ordering inside `layout.card`" subsection in [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md) locking the order: `title → formHeader → universal-fields → form body → form-review body (review only) → comment → formFooter → buttons`. Added part 24 to the Wave 6 implementation plan ahead of 16/17/18 so the `_ref` target exists when consumers compose it.

The design says (line 14) `edit.yaml.njk` ships a "universal-fields block" plus a form body, and (line 65) `pages.{verb}.formHeader` and `pages.{verb}.formFooter` pass through. The order isn't specified. v0 templates render `formHeader` then the form, then `formFooter`, then the buttons — but v0 didn't have a separate universal-fields band; everything was authored.

Open: does the universal-fields band live above or below `formHeader`? Above or below the form body? The natural answer is `formHeader → universal-fields → form body → formFooter → buttons` (chrome wraps everything authored), but lock it in the design so the template doesn't get re-shuffled later.

### 9. Page block type — `PageHeaderMenu` vs. `layout.page`

> **Resolved.** Expanded the "Layout-module composition" subsection in [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md) to nail down that the template's top-level block is a single `_ref: { module: layout, component: page }` — no hard-coded `PageHeaderMenu`. Also updated the misleading example in [concept ui/spec.md](designs/workflows-module-concept/ui/spec.md) "Form-action page YAML shape" — the example showed `type: PageHeaderMenu` with inline page-level `events.onInit` and `requests:`, none of which match what part 12 actually emits. Replaced with the shell's actual `_ref` shape (action_config / page_config / workflow_type / entity_collection / page_ids) and a one-paragraph note that templates own the layout-module wrap, not the shell.

The design says (line 58) the page is wrapped in `layout.page`. Part 12's design ([12-resolver-pages/design.md:25](modules-mongodb/designs/workflows-module/parts/_completed/12-resolver-pages/design.md)) names the page shell `type: PageHeaderMenu` in its example. Concept spec ([ui/spec.md:130-141](designs/workflows-module-concept/ui/spec.md)) says module-shipped pages compose `layout.page`, not a hard-coded `PageHeaderMenu` — the host app picks the variant via `layout`'s `page_type` var.

Part 12's example is misleading (a hangover from earlier iterations); part 16 should explicitly call out that the template's top-level block is the `_ref` to `layout.page` shown in concept spec, with no hard-coded `PageHeaderMenu` anywhere. Flag this so a reader doesn't copy-paste the part-12 example into the part-16 template.

## Verification gaps

### 10. The "form-card chrome parity with v0" verification points at the wrong file

> **Resolved.** Rewrote the verification line in [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md) — fixed the `makeActionsForm.js` line reference to point at line 12 (the `useCard` rule), and dropped the v0 token-parity goal (card chrome is the host layout module's concern, not part 16's). Added an "Outer-card suppression (v0 parity)" subsection committing the rule: template inspects `action_config.form[0]?.form` at Nunjucks render time and suppresses the outer `layout.card` when truthy, matching v0's `!vars.form[0]?.form` heuristic. Explicitly documented the `box`-first edge case (v0's heuristic suppresses incorrectly for `box`, which has a `form:` slot but emits a transparent Box). v1 accepts the v0 behavior verbatim to keep app migrations clean per user direction; a per-component `owns_outer_chrome` flag is flagged as a later improvement.

Line 84: "see [`dist/.../makeActionsForm.js:1-9`](dist/workflows-module/ui/current_workflow_utils/resolvers/makeActionsForm.js)". The contents at lines 1-9 are the `makeCard` helper. The actual rule the design wants to verify ("suppress card when the first form entry owns its own outer chrome") is at [`makeActionsForm.js:12-13`](dist/workflows-module/ui/current_workflow_utils/resolvers/makeActionsForm.js): `const useCard = !vars.init && !vars.form[0]?.form && vars.useCard && vars.form.length > 0;`

Also, this entire verification point is now stale: part 15's design ([15-resolver-form-builder/design.md:95](designs/workflows-module/parts/_completed/15-resolver-form-builder/design.md)) commits to "Form-body chrome (the `Card` wrap that v0's `makeActionsForm` carried inline) belongs to part 16's `layout.card` composition — this resolver emits the block tree only, no outer container." So `makeActionsForm` v1 has no `useCard` knob, and the "suppress card when the first form entry owns its own outer chrome" rule has to be implemented in the template — which means the verification point's question becomes: does the template wrap the substituted block tree in `layout.card`, and how does it suppress the wrap when the first authored entry already owns its outer chrome?

Rewrite the verification line: drop the v0 reference; state the template-side rule. Candidate: "`edit.yaml.njk` and `error.yaml.njk` wrap the form body in `layout.card`. Suppression of the wrap when the form's first authored entry owns its own outer chrome (v0 condition: `!form[0]?.form`) is either preserved (template inspects `action_config.form[0]?.form` and conditionally drops the card) or explicitly dropped with rationale."

This also raises a deeper question: how does the template know the form's first entry has its own chrome without parsing the substituted tree? The substitution happens inside the `_ref: { resolver }` call; the template only sees `action_config.form` (raw, with `component:` names) before substitution. v0 used the raw shape (`vars.form[0]?.form`); v1 can do the same — pin it.

### 11. Manual-only a11y check is too thin for this surface

> **Resolved.** Expanded the manual a11y bullet in [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md) with the explicit framework-vs-template split: Lowdefy's Ant Design–backed blocks already cover `aria-required` / `aria-invalid` / modal focus trap / standard keyboard navigation, so the template-level sweep focuses on what's actually compositional: required-field asterisk visibility, submit-button disabled-with-reason, end-to-end keyboard flow across `layout.floating-actions` + confirm modal + form, and Affix-based sticky-bar tab order. No automated a11y assertions here — that's part 22's e2e turf if it lands.

Line 85: "Manual a11y pass: keyboard nav reaches every button; form labels read." Forms are the most a11y-sensitive surface in the module. At minimum, add: required-field indication (visible AND `aria-required`), error association (`aria-describedby` to validation messages), disabled-button announcement (sticky button bar means a disabled-submit needs screen-reader-friendly disabled state with reason), focus management on modal open/close. This level of detail belongs in part 22's e2e suite anyway, but flag it here so the part-16 PR ships with the test plan, not just a 30-second keyboard sweep.

## Cross-design consistency

### 12. Open question on `form_review` merge order conflicts with the design body

> **Resolved.** Removed the open question — it duplicated content already in the design body. Locked the rendering mechanism for the substantive sub-question: review template uses `DataView` with `formConfig: action_config.form` for the read-only main form (v0 parity); `makeActionsForm` is only used for the writable `form_review` block, with `mode: 'review'` to filter `viewOnly` entries. View template uses the same `DataView` approach for its read-only main form. Reasoning documented in [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md) — per [part 15](designs/workflows-module/parts/_completed/15-resolver-form-builder/design.md), the resolver's `mode` var only controls the `viewOnly` filter, not a read-only render, so calling `makeActionsForm` would produce editable inputs. `DataView` is the correct read-only renderer.

Open question 1 (line 90): "Read-only main form above, editable review fields below. Document the rendering order in the template." But "In scope" already says (lines 25–26) `review.yaml.njk` renders "Read-only main form display" with "Writable `form_review` block via `_ref: { resolver: makeActionsForm.js, vars: { form: <action_config.form_review> } }`". So the order is already decided in the design body. Move this from open questions to a one-liner in the body, or delete it from open questions if it's already documented.

Note v0's review template ([`dist/.../review.yaml.njk:138-148`](dist/workflows-module/ui/current_workflow_utils/templates/review.yaml.njk)) uses a `DataView` block for the read-only main form (not a recursive `makeActionsForm` call with a read-only mode). v1's part 15 introduces a `mode: 'edit' | 'view' | 'review' | 'error'` var so the resolver can apply per-mode filters (the `viewOnly` rule). Confirm in this part: does the review template render the main form via `_ref: { resolver: makeActionsForm.js, vars: { form: action_config.form, mode: 'review' } }` (and the resolver outputs read-only-rendered fields), or does it still use a `DataView` for the main read-only render and reserve `makeActionsForm` only for the writable `form_review`? The design says "Form body rendered read-only" but doesn't name the mechanism.

### 13. Open question on `not_required` after terminal status — answer it inline

> **Resolved.** Subsumed by finding #2's resolution: `not_required` now lives on edit only (not view), gated on `_state.action_allowed === true` AND stage priority > 0 in `global.action_statuses` (hides once already `not-required`). Post-close availability is governed by `required_after_close: true` per part 24's universal-fields lifecycle rules — when set, the edit page (and thus `not_required`) remains accessible after terminal status. Removed the open question from [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md)'s open-questions list.

Open question 2 (line 91) is "Hide once terminal. Confirm against the `required_after_close` field semantics." The answer is already inferable from the action schema (`required_after_close` exists for this exact case). Either resolve it in the design ("Hide `not_required` once the action's status priority ≥ terminal-status priority") or, if there's a real ambiguity (does `not_required` itself become disabled for sub-statuses or just for terminal-`done`?), state the ambiguity. As-is, the bullet doesn't carry actionable information.

## Minor

### 14. The "Page-event vocabulary" section duplicates the button table

> **Resolved.** Rewrote the "Page-event vocabulary" subsection in [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md) — points readers at the button table for `onSubmit` / `onApprove` / `onRequestChanges` (no duplication) and explains the one handler not in the table: `onMount`, with a pointer to the "Template `onMount` sequence" subsection where the author's `page_config.events.onMount` is step 8 (tail).

Lines 49–52 list `onMount` / `onSubmit` / `onApprove` / `onRequestChanges` per template. The button vocabulary table on lines 38–44 already names these in the "Author event handler fired" column. The page-event section adds nothing except `onMount`. Either fold `onMount` into the table (with a row that's not a button — e.g. "Page lifecycle | every template | `onMount` | n/a") or keep the section but cut everything except `onMount` (since the rest is in the table).

### 15. Per-action template overrides — drop the version label or commit to it

> **Resolved.** Dropped the "v1.x" label in [design.md:70](designs/workflows-module/parts/16-page-templates/design.md). Now reads "Deferred; revisit if real apps need it." Concept-spec wording untouched (out of scope for this part).

Lines 70 and 54 (concept) both call per-action `pages.{verb}.template` overrides "purely additive in v1.x". v1.x is a versioning commitment the design doesn't otherwise make. Either drop the version label ("deferred; revisit if real apps need it") or define the version cadence somewhere. Right now it's vague-precise: "v1.x" sounds like a promise but isn't.

### 16. `pages.error.buttons.submit.{title, modal}` conflicts with "Button vocabulary (immutable, fixed across templates)"

> **Resolved.** Reworded button-vocabulary section in [part 16 design.md](designs/workflows-module/parts/16-page-templates/design.md): button **identity** (which buttons render, which `interaction` they fire) is immutable; button **chrome and visibility** (`title`, `disabled`, `visible`, optional confirm `modal`) are overridable per a new "Chrome and visibility overrides" table covering all five interaction buttons + `Edit`. Lifted the v0 surface: `.visible` (boolean, separate from `_state.action_allowed` per user clarification — access gates "can write at all", `.visible` gates "should render given page state"), `.disabled` (for "show but block" UX), `.title` (only on error-page `resolve_error` — the one button whose copy varies per app), and `.modal: { title?, content? }` on `submit_edit` / `not_required` / `resolve_error`. Approve / request_changes have dedicated modals; `Edit` is a pure link. Updated "Per-action page chrome overrides" subsection to point at the new table instead of restating the error-button override inline.

Line 36 calls the button vocabulary "immutable, fixed across templates." Line 67 says authors can override the error page's resolve button's `title` and `modal` via `pages.error.buttons.submit.{title, modal}`. That's a contradiction: titles and confirmation modals are part of the button's surface; if they're overridable, the vocabulary isn't immutable. Reword: "Button **identity** (which buttons render, which interaction they fire) is immutable; **button chrome** (title, confirmation-modal copy) is overridable on a per-button basis where the table indicates." Then call out which buttons across the four templates support which chrome overrides (currently only the error-page `submit` is mentioned; v0 has more — `edit.buttons.submit.modal`, `edit.buttons.not_required.modal`, `review.modals.request_changes.client_change`).
