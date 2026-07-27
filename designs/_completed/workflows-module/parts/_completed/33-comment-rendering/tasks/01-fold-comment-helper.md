# Task 1: `foldCommentIntoEvent` helper

## Context

A workflow submit captures an optional rich-text `comment` — the page posts the whole TipTap value (`{ html, text, markdown, fileList }`) as `params.comment`. Part 38's rebuilt engine currently drops it: `planEventDispatch` (`plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/planEventDispatch.js`) writes no comment anywhere (its docblock explicitly defers to this part), and the old `metadata.comment` write was deleted with `dispatchLogEvent.js`.

Part 33 makes the comment the event's **description**: it is written into `display.{app_name}.description` — the secondary rich-text channel the standard `EventsTimeline` already renders via `dangerouslySetInnerHTML(sanitize(event.description))`. The fold logic is a single pure helper with exactly one future call site (the shared event-dispatch planner, wired in task 3), so the submit path and Part 24's `UpdateActionFields` path cannot drift.

Critical invariant (design D4): the comment is **raw user-typed HTML, stored verbatim, never templated**. The planner renders every string in the display tree as a Nunjucks template (`renderEventDisplay` → `renderTree` → `parseNunjucks`); the fold therefore runs _after_ render (task 3), and this helper must pass template syntax (`{{`, `{%`) through untouched.

## Task

Create `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/foldCommentIntoEvent.js` (beside `deepMerge.js`).

Contract — `foldCommentIntoEvent(eventPayload, comment, appName) → eventPayload`:

- `comment` is the rich-text value `{ html, text, fileList, ... } | null` (design D5 wire contract). The helper stores **only** `comment.html`; the emptiness gate reads `comment.text` / `comment.fileList`; `markdown` is ignored.
- The gate (design D3): the comment is non-empty when `comment?.text` is a non-empty, non-whitespace-only string **or** `comment?.fileList` is a non-empty array. Do **not** gate on `html` — TipTap emits `'<p></p>'` for an empty document and nulls only `text` (`useTiptapState.js:44-52`), so a type-then-delete leaves `{ html: '<p></p>', text: null, fileList: [] }` and an `html` gate would store an empty paragraph. The `fileList` clause folds image-only comments (screenshot, no text).
- When the gate passes:
  - ensure the app bucket exists first — `eventPayload.display[appName] ??= {}` (a pre-hook/author override merge can produce a `display` without the app key; writing `display[appName].description` directly would throw),
  - set `eventPayload.display[appName].description = comment.html`.
- No-op (returns the payload unchanged) when:
  - `comment` is `null` / `undefined`,
  - the gate fails — `text` missing/empty/whitespace-only **and** `fileList` missing/empty (e.g. the empty-document value above),
  - `comment` is not the rich-text object (e.g. a plain string — it has no `.text`/`.fileList`, so nothing is written; do **not** special-case strings).
- Never touches `display[appName].title` or any other app's bucket.
- The HTML is assigned verbatim — no escaping, no templating, no trimming of the stored value.

Follow the design's sketch (in-place set on the passed payload, return it). Match the docblock style of the sibling planners (`deepMerge.js`, `planEventDispatch.js`) — reference design D3/D4/D5 and state the runs-post-render invariant.

Create `foldCommentIntoEvent.test.js` beside it (jest, run from repo root with `pnpm test`). Cases (from the design's Files-changed list):

1. text present (`{ html: '<p>hi</p>', text: 'hi' }`) → `display[app].description` set to `comment.html`.
2. the empty-document value (`{ html: '<p></p>', text: null, fileList: [] }`) → no-op.
3. text whitespace-only (`"  \n"`, empty `fileList`) → no-op.
4. image-only (`{ html: '<p><img src="…"></p>', text: null, fileList: [file] }`) → folds — description set to `comment.html`.
5. comment `null` / `undefined` → no-op.
6. comment is a plain string (`"hello"`) → no-op (object-vs-string input).
7. existing `display[app].title` is not clobbered; other app buckets untouched.
8. missing `display[appName]` bucket → created via `??=`, description set, no throw.
9. template-syntax passthrough — HTML containing `{{ workflow.entity_id }}` and a stray `{%` is stored **verbatim**: not interpolated, no throw.

## Acceptance Criteria

- `foldCommentIntoEvent.js` exists in `shared/phases/planners/` with the exact `(eventPayload, comment, appName)` signature.
- All nine test cases pass: `pnpm test foldCommentIntoEvent` from the repo root.
- The helper has no imports from I/O or planner modules (pure; `deepMerge`-style standalone).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/foldCommentIntoEvent.js` — create — the pure fold helper.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/foldCommentIntoEvent.test.js` — create — the nine unit cases above.

## Notes

- Do not call this helper from anywhere yet — task 3 adds the single call site inside `planEventDispatch`. This task is the helper + tests only.
- The emptiness gate is on whether to _write_; when it does write, store `comment.html` as-is (don't store a trimmed copy).
