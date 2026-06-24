# Review 3 — Empty-comment gate, live test pointer, pre-rename filenames

Verified the tasked design (and tasks 01–06) against the current branch. The core
claims hold: `planEventDispatch.js` matches every cited line (default title `:20-21`,
closed handler enum throwing at `:149-153`, render context `:158-175`, merge → render
at `:197-209`, no `metadata.comment`, docblock deferring to this part at `:46-49`);
`mergeEventOverrides.js:28-31` still shallow-merges `display`; `deepMerge.js` exists
with the right semantics (recursive on plain objects, replace on arrays/null,
non-mutating); `planSubmit.js:188-202` is the step-7 call site with `params` in scope;
`renderTree.js`/`parseNunjucks.js` confirm every display string passes the Nunjucks
compile, so the post-render fold ordering (D4) is right. All cross-part claims check
out — Part 24's planner route and still-open sidebar question, Part 40's
timeline-carry-over + answered modal question + 33-before-40 pinning in
`implementation-plan.md` (both tables), Part 42's D6, Part 32's deferred question,
Part 13's `emitEventOverrides` attribution, and the spec line refs (`submit-pipeline/
spec.md:271,:273,:58,:327`; no `metadata.comment` in `engine/spec.md`). Tasks 05/06
pin the timeline placement the design leaves abstract (after `status_history_card`;
top page-blocks level outside the `_build.if` chrome) — no gap there.

One supporting observation: the bespoke card renders the author from
`created.by.name` (`simple-view.yaml:274`), but the standard change stamp writes
`created: { timestamp, user: { name, id } }` (`docs/idioms.md` § Change stamps;
`EventsTimeline.js:246,512-513` reads `created.user`) — so the card shows a blank
author today. One more latent bug the D6 swap deletes rather than carries.

The findings below are the gaps.

## Correctness

### 1. An "empty" TipTap comment is `{ html: '<p></p>', text: null }` — both of the design's emptiness guards let it through, producing empty description cards

> **Resolved.** Valid on all three legs. The fold gate (D3) now reads the editor's own emptiness signals: fold when `comment.text` is a non-empty string **or** `comment.fileList` is non-empty — the `fileList` clause goes beyond the review's text-only fix so an image-only comment (screenshot, no text) isn't silently dropped; the user judged that silent drop an unexpected bug, not an acceptable trade-off. `comment.html` is still what's stored. D5's "required already guards emptiness" claim replaced with the tightened validate: both review surfaces' `request_changes` validate now passes on the same text-or-fileList condition (new task 07), so a type-then-deleted mandatory comment fails at the input. Unit case lists updated in D3/Files-changed/Verification and task 01 (empty-document value → no-op; image-only → folds).

D3 gates the fold on "`comment?.html` is a non-empty string", and D5 claims "the
`required` validation on `request_changes` already guards emptiness at the input."
Neither holds against the actual value shape:

- **TipTap returns `<p></p>` for an empty document.** `useTiptapState.js:44-52`
  (`@lowdefy/blocks-tiptap`) emits `html = editor.getHTML()` as-is and nulls only
  `text` (`:47`: `editor.getText().trim() === '' ? null : editor.getText()`). A user
  who types and then deletes everything leaves
  `_state.comment = { html: '<p></p>', text: null, markdown: '', fileList: [] }`.
- **`'<p></p>'` passes the fold's gate.** It's a non-empty, non-whitespace string —
  the unit case list ("html empty/whitespace", design `:85`) doesn't catch it. The
  fold writes `display.{app}.description = '<p></p>'`, and the timeline's guard is
  `hasDescription = !!event.description` (`EventsTimeline.js:473`) — an empty
  description card renders under the title.
- **The `required` validation passes too.** On both review surfaces the validate is
  `pass: { _ne: [{ _state: comment }, null] }` (`review.yaml.njk:362-369`,
  `simple-review.yaml:255-262`) — the type-then-delete value is a non-null object, so
  a textually empty comment satisfies "required" on `request_changes`. D5's claim is
  wrong for this path, independent of the fold.

**Fix:** gate the fold on **`comment.text` being a non-empty string** — the block
already computes the editor's own emptiness signal there (`:47`), so the engine
doesn't have to parse HTML — while still storing `comment.html` as the description.
Update D3/D5 and the unit list: `{ html: '<p></p>', text: null }` → no-op;
`{ html: '<p>hi</p>', text: 'hi' }` → folds. Optionally also tighten the
`request_changes` validate to check `comment.text` (module YAML, both review
surfaces), but the engine-side gate is the one that must hold — it covers every
caller, including the optional-comment surfaces (`edit`/`error`/approve) where no
validation exists at all. (Known trade-off worth one line in D3: an image-only
comment has `text: null` and would be dropped — fine per "build for what exists.")

## Test impact

### 2. The live `metadata.comment` assertions are in `mergeEventOverrides.test.js`, not the deleted `dispatchLogEvent.test.js` — and one of them encodes precedence D4 deliberately inverts

> **Resolved (auto).** Verification § Test migration now points at `mergeEventOverrides.test.js:45-68` and names the two fates: the YAML-clobber regression migrates onto `display.{app_name}.description`; the pre-hook-overrides-comment case is deleted, not migrated. D4 gained the one-line acknowledgment that a pre-hook can no longer override/scrub a typed comment — an intended behaviour change, fold-last by design. Task 02 already directed both test changes correctly; no task edits needed.

Verification § Test migration points at "pre-Part-38 … `dispatchLogEvent.test.js`'s
four `buildDefaultLogEventPayload` comment cases" — that file is gone (Part 38). The
assertions that actually exist on this branch are in
`mergeEventOverrides.test.js:44-68`:

- *"YAML override on metadata.foo does NOT clobber default metadata.comment
  (regression: layer 3 folded into layer 1)"* — asserts `metadata.comment` survives a
  YAML override; migrates naturally onto `display.{app}.description` + the fold.
- *"pre-hook override on metadata.comment overrides layer-1 runtime comment"* —
  asserts a **pre-hook can override the runtime comment**. D4 inverts this on
  purpose: the fold runs *after* the merge (and render), so post-Part-33 a pre-hook
  **cannot** override or scrub a typed comment. This test must be **deleted**, not
  migrated — porting its assertion onto `description` would contradict D4.

The blanket rule ("any pre-existing test that asserts `metadata.comment` … is removed
or migrated") technically covers both, but the stale pointer sends the implementer
hunting for a deleted file, and nothing in the design acknowledges that the pre-hook
precedence flip is intended behaviour change, not collateral. **Fix:** point
Verification § Test migration (and task 02, which already says "migrate stale tests")
at `mergeEventOverrides.test.js:44-68`, and add one line to D4: a pre-hook
`event_overrides` can no longer override the comment — the fold is last by design.

## Minor

### 3. The design states post-rename filenames as current fact — Part 38 task 18 is pending; carry the naming caveat in design.md, not only in tasks

> **Resolved (auto).** Overtaken by events: Part 38 tasks 18–19 landed (PR #72, merged during this action-review) — `pages/workflow-action-{view,review,edit}.yaml` now exist on the tree, so the design's filenames are current fact and no caveat is needed. The stale "whichever name exists" caveat in `tasks.md` was updated to state the rename has landed.

The design cites `workflow-action-view.yaml`, `workflow-action-review.yaml:140`, and
`workflow-action-edit.yaml` throughout (Background `:15,:20`, D6, Files-changed
`:93`). Those files don't exist yet — the pages are `simple-view.yaml`,
`simple-review.yaml` (whose `:140` is indeed the TiptapInput, so the line numbers are
right), `simple-edit.yaml`; the rename is Part 38 task 18
(`18-display-surface-renames.md`), currently **pending** per Part 38's task tracker.
`tasks.md:27` and task 05 carry the "whichever name exists at implementation time"
caveat, but design.md itself never acknowledges it — a reader verifying the design
against the tree finds three nonexistent files. **Fix:** one line in Background or
Files-changed: filenames are post-Part-38-task-18 names; pre-rename equivalents are
`pages/simple-{view,review,edit}.yaml`. (Alternatively pin "38 task 18" next to "38
task 15" in the implementation-plan dependency cell — but the one-line note is
enough.)
