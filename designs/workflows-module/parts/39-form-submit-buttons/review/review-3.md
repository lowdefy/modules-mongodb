# Review 3 — Design/task divergences after the review-1/-2 resolutions

Reviewed the **current** design (post review-1 + review-2 resolutions) against the four shipped
templates (`modules/workflows/templates/{edit,view,review,error}.yaml.njk`), the eight task
files under `tasks/`, and the plugin package's `exports` map
(`plugins/modules-mongodb-plugins/package.json:14–21`).

Re-confirmed sound, no further action:

- The `_ref: { path, key }` build-time mechanism and the FSM source-stage map (already verified
  cell-by-cell in reviews 1 and 2).
- The plugin `./fsm` export gap is real and correctly owned here: `package.json:14–21` has named
  entries (`./actions`, `./blocks`, `./connections`, `./metas`, `./types`) plus a `./*` →
  `./dist/*` catch-all, and **no** FSM entry. D3 / task 6 add `./fsm`. Correct.
- The error-template dead-key drops (`form_review` never primed; `fields` display-only) match the
  shipped template exactly (`error.yaml.njk:291–294`, `:350–353`, prime at `:87–102`).

The findings below are all places where a **task file** does the right thing but the **design
document disagrees with it or under-specifies it**. Per CLAUDE.md ("Designs are the source of
truth"), the design should be brought up to the tasks, not the reverse.

## Correctness / consistency

### 1. The `fields`-drop hygiene was never extended to `not_required` in the design — but task 2 drops it

> **Resolved (auto).** Added `not_required` to the `design.md` hygiene enumeration and the `edit.yaml.njk` Files-changed row (payload-only drop, no `Validate` to narrow). Softened the "each button's `Validate` regex narrows" generalization to apply only to buttons that have a `Validate` step, explicitly excluding `not_required` (no `Validate`) and `request_changes` (comment-presence `Validate`, not a `^fields\.` regex). Also corrected the Files-changed row's "submit and not_required each carry payload + `Validate` twice" to note `not_required` has no `Validate`.

Review-2 #1/#2 reframed the `fields` drop as **uniform hygiene** ("don't post dead state") and
extended it across the writable form templates. The design's enumeration of that scope
(`design.md:24`) reads:

> "every writable form-kind payload in this part drops `fields` — `submit` / `progress` on
> `edit` (D1, D2), `approve` / `request_changes` on `review`, and `resolve_error` on `error`"

**`not_required` is missing from that list**, and the `edit.yaml.njk` Files-changed row
(`design.md:230`) only says "Drop `fields` from the `submit` and `progress` payloads." But
`not_required` is a writable form-kind button that posts exactly the same primed-then-resent
dead `fields` bag as `submit` did — `edit.yaml.njk:324–325` (inline) and `:424–425` (modal copy)
send `fields: { _state: fields }`, with no `form`. And **task 2 already drops it**:
`tasks/02-edit-template-signals-progress.md:79` — "remove the `fields: { _state: fields }`
line (keep `action_id`, `signal`, `current_key`, `comment`)".

So the implementation is correct and uniform; the design is the thing that's inconsistent — it
adopted a uniform-hygiene rule, then enumerated five of the six writable payloads. A reviewer
checking design-against-code would flag task 2 as doing undocumented work.

Two sub-points while fixing this:

- `not_required` has **no `Validate` step** (`edit.yaml.njk:305–327` goes straight to `onSubmit`
  → `CallAPI`), so only the *payload* drop applies — there is no `^fields\.` regex to narrow.
- The same `design.md:24` clause "each button's `Validate` regex narrows to drop `^fields\.`"
  over-generalizes: it's also untrue for `request_changes`, whose `Validate` is a comment-presence
  check (`review.yaml.njk:327–329`, `params: comment`), not a `^fields\.` regex. The precise
  per-template Files-changed rows already get this right; only the line-24 summary overstates.

**Fix:** Add `not_required` to the `design.md:24` enumeration and the `edit.yaml.njk`
Files-changed row (`design.md:230`), noting it's a payload-only drop (no `Validate` to narrow).
Soften the "each button's `Validate` regex narrows" generalization to exclude `not_required`
(no validate) and `request_changes` (comment-only validate).

### 2. The design's e2e case (b) example doesn't exercise the FSM source-stage gate; task 7 already corrected it

> **Resolved (auto).** Rewrote `design.md` e2e case (b) to the source-stage assertion task 7 uses: `progress` not rendered on a `done` action while `submit` stays visible, explicitly exercising the FSM source-stage gate rather than the role gate.

`design.md:240` specifies e2e case (b) as:

> "(b) a button absent from a stage's source list is not rendered (e.g. `approve` not shown on
> `edit`)"

`approve` is **never** on the `edit` template — it's a `review.yaml.njk` button
(`review.yaml.njk:251`). Its absence from `edit` is template construction, not source-stage
filtering, so this assertion passes no matter what the visibility mechanism does. It proves
nothing about the D3 gate the test is meant to cover.

`tasks/07-e2e-supplements.md:16–17` silently fixed this — it adds "and `progress` (source list
`[action-required, in-progress]`) is **not** shown once the action is `done`" and the explicit
instruction "Pick assertions that exercise the FSM source-stage gate, not just the role gate."
That's the right test: `progress` *is* on the edit bar, and `done ∉ [action-required,
in-progress]`, so its absence on a `done`-stage edit page genuinely tests the source-stage
membership check (while `submit`, whose source list includes `done`, stays visible).

**Fix:** Update `design.md:240`'s case (b) example to the source-stage assertion task 7 uses
(e.g. "`progress` not rendered on a `done` action, while `submit` is") so the design's test spec
matches the gate it validates.

## Minor

### 3. D4 says view's Edit-nav is gated on "edit access" — but the precedent and task 5 gate only on `page_ids.edit` presence

> **Resolved (auto).** Dropped "and the user has edit access" from `design.md` D4; the Edit-nav `Link` is visible when `page_ids.edit` is configured and is explicitly *not* access-gated (the edit page gates its own writes), matching `review.yaml.njk`'s `button_edit` precedent and task 5. Updated the line citation to `review.yaml.njk:192, :197–205`.

`design.md:185` describes the view Edit button as "a `Link` to `page_ids.edit` (when present and
**the user has edit access**)." But the precedent it cites, `review.yaml.njk`'s `button_edit`,
is **not** access-gated — `review.yaml.njk:192` carries the explicit comment "not gated on
action_allowed; edit page gates its own writes," and its `visible` (`:197–205`) tests only
whether `page_ids.edit` is set. `tasks/05-view-template-button-bar.md:33–39` follows the
precedent exactly (visible on `page_ids.edit` presence, no `action_allowed`).

So the implementation has no "edit access" gate on the nav button (by design — the edit page's
own role check is the real gate). The design prose implies a gate that isn't built and shouldn't
be. **Fix:** Drop "and the user has edit access" from `design.md:185`, or clarify it means
"`page_ids.edit` is configured," matching review's Edit button and task 5.

### 4. Consistency question: `fields` is dropped as dead state, but `form` is kept on the same display-only surfaces

> **Resolved.** `form` is deliberately kept — it is **not** dead state. Verified against Part 38: `planFormDataMerge` (38 design.md:328, task 11) consumes `params.form` **signal-agnostically** (merge order `params.form → params.form_review → form_overrides`, uniform deep-merge per the now-resolved Q6) to accumulate `workflow.form_data.{action}` and produce the `submitted_form` event-render binding. Additionally, the review surface allows **in-place edits to `form`** (not only `form_review`), so `payload.form` can carry real reviewer edits. The `fields`-vs-`form` asymmetry is therefore principled: `fields` was relocated to its own op by Part 24 (genuinely dead on submit), while `form` stays live on every signal. Documented the rule explicitly in D1 ("Why `fields` drops but `form` stays").

The hygiene rule drops `fields` from `review`/`error`/`view` because those templates render the
universal fields in `display` mode, so `_state.fields` is primed-then-resent dead state. But the
**main `form`** is equally display-only on `review` and `view`: `review.yaml.njk:134–143` renders
it via `DataDescriptions` (read-only) and only `form_review` is editable (`:171–176`); `view`
renders `form` read-only and never makes it editable. Yet `form: { _state: form }` is kept on
`review`'s `approve`/`request_changes` payloads (`review.yaml.njk:308–309`, `:347–348`) and on
`view`'s new `request_changes` (`tasks/05:118`). By the design's own "don't post dead state"
argument, `form` on those payloads is the same primed-then-resent dead state as `fields`.

(`form` is *not* dead on `edit` and `error` — both make it editable and validate `^form\.` — so
keeping it there is correct. The question is only the `review`/`view` display surfaces.)

This may be deliberate — Part 38's `approve` / `request_changes` handlers might consume `form`
for a final form_data snapshot, in which case it's a live payload and should stay. I can't
confirm either way without the Part 38 engine (the FSM tables / handlers don't exist in the tree
yet). **Fix:** State the rule explicitly in D1 — either the hygiene principle covers all
display-mode-resent state (then drop `form` from `review` `approve`/`request_changes` and `view`
`request_changes` too) or `form` is deliberately exempt because the engine consumes it (then say
so, so the `fields`-vs-`form` asymmetry reads as principled rather than accidental). Low
confidence; flagging for an explicit decision rather than asserting a defect.
