# Task 1: Fan out shared comments across every app bucket in `foldCommentIntoEvent`

## Context

`foldCommentIntoEvent` is the single chokepoint (Part 33 D3) where a workflow submit's optional rich-text comment is folded into an event's per-app display bucket. Both write paths (the submit pipeline and Part 24's `UpdateActionFields`) route through it, so changing it here changes both consistently.

Today it writes `comment.html` into the `description` of **one** bucket — `display[appName]` — where `appName` is `connection.app_name` of the submitting app:

```js
function foldCommentIntoEvent(eventPayload, comment, appName) {
  const hasText =
    typeof comment?.text === "string" && comment.text.trim().length > 0;
  const hasFiles =
    Array.isArray(comment?.fileList) && comment.fileList.length > 0;

  if (!hasText && !hasFiles) return eventPayload;

  eventPayload.display ??= {};
  eventPayload.display[appName] ??= {};
  eventPayload.display[appName].description = comment.html;

  return eventPayload;
}
```

Part 61 makes a comment **visible to every app that already sees the event** by default. An event's `display` carries one bucket per app the author gave a title for (the submitting app's default title + any per-app title overrides). Writing the comment into **all** of those buckets makes it `shared`; writing into only the submitting app's bucket is `internal` — which is exactly today's single-bucket behaviour.

The helper runs **after** render and the override merge (Part 33 D4), so by the time it runs every title bucket already exists on `display` — the fan-out iterates the keys already present and never invents new ones.

## Task

Modify `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/foldCommentIntoEvent.js`:

1. Add two new positional parameters after `appName`, both with safe defaults:
   - `visibility` — `'shared' | 'internal'`, default `'shared'`.
   - `enableInternalComments` — boolean, default `false`.

2. Keep the emptiness gate exactly as-is (reads `comment.text` / `comment.fileList`; never `html`).

3. After the gate passes, compute the **effective single-bucket predicate**:

   ```
   internalEffective = visibility === 'internal' && enableInternalComments === true
   ```

   - When `internalEffective` is true → write **only** the submitting app's bucket: `display[appName].description = comment.html` (today's behaviour, the `internal` path / Part 33 D4).
   - Otherwise (`shared`, the default, **including any `internal` request from an app that has not enabled internal comments**) → write `comment.html` into the `description` of **every key already present on `display`**. This is the new fan-out. Do not create buckets that don't exist; iterate the existing `display` keys.

4. Preserve the existing defensive guard for the single-bucket path: a pre-hook/override merge can produce a `display` without the app key, so ensure `display ??= {}` and `display[appName] ??= {}` before writing the single bucket. For the shared path, if `display` is somehow empty/absent, fall back to ensuring the submitting app's bucket exists and writing it (so a comment is never silently dropped) — but the normal case is "write into the keys that are there."

5. Update the JSDoc block to document the two new params and the `internal → shared` coercion (an app that has not enabled internal comments coerces any `internal` request back to `shared`, regardless of what the client sent). Keep the existing notes about the emptiness gate, verbatim HTML, and runs-post-render invariant.

Keep the function pure (mutates and returns the passed `eventPayload`); keep `title` untouched on every bucket.

## Acceptance Criteria

- `internal` + `enableInternalComments: true` → writes only `display[appName].description`; other buckets' `description` untouched.
- `shared` (and default-when-absent) → writes `comment.html` into the `description` of every bucket present on a multi-bucket `display`.
- `internal` + `enableInternalComments: false` → coerced to `shared` (fans out to every bucket).
- Empty comment (no `text`, no `fileList`) → no-op regardless of `visibility` / flag, for any bucket.
- `title` is never written or modified on any bucket.
- Existing call signature `foldCommentIntoEvent(payload, comment, appName)` still behaves as `shared` (defaults) — i.e. the new defaults don't break callers that haven't been updated yet.
- `pnpm --filter @lowdefy/modules-mongodb-plugins test foldCommentIntoEvent` passes (extend the existing `foldCommentIntoEvent.test.js` with the new cases).

## Files

- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/foldCommentIntoEvent.js` — modify — add `visibility` + `enableInternalComments` params; fan out on shared; coerce internal→shared when flag off; update JSDoc.
- `plugins/modules-mongodb-plugins/src/connections/shared/phases/planners/foldCommentIntoEvent.test.js` — modify — add unit cases for shared fan-out, internal single-bucket, internal-coerced-when-flag-off, empty-comment no-op, and title untouched.

## Notes

- This is the riskiest path (multi-write), so it carries the heaviest unit-test focus (design D4).
- Do not add a project-wide app registry or a read-time merge — the buckets on the event **are** the audience (design D1, non-goals). The fan-out must only ever write into keys that already exist on `display`.
