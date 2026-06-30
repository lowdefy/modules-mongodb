/**
 * Fold a workflow submit's optional rich-text comment into the event's
 * `display.{app}.description` slot(s) (Part 33 D1/D3/D4/D5; Part 61 D1/D4).
 *
 * The comment is the event's *description* — the secondary rich-text channel
 * the standard `EventsTimeline` renders via
 * `dangerouslySetInnerHTML(sanitize(event.description))`. There is no
 * `metadata.comment` and no new event field; the comment lives once, here.
 *
 * Wire contract (D5): `comment` is the whole TipTap value
 * `{ html, text, markdown?, fileList? } | null`. The helper stores **only**
 * `comment.html`; the emptiness gate reads `comment.text` / `comment.fileList`
 * (`markdown` is ignored).
 *
 * Emptiness gate (D3): a comment is non-empty when `comment.text` is a
 * non-empty (non-whitespace-only) string **or** `comment.fileList` is a
 * non-empty array. The gate does NOT read `html` — TipTap emits `'<p></p>'`
 * for an empty document and nulls only `text` (`useTiptapState.js:44-52`), so a
 * type-then-delete leaves `{ html: '<p></p>', text: null, fileList: [] }` and
 * an `html` gate would store an empty paragraph. The `fileList` clause folds an
 * image-only comment (screenshot, no text).
 *
 * Visibility (Part 61 D1/D3/D4): `visibility` is the writer's per-comment choice
 * — `'shared'` (default) or `'internal'`. An event is visible to an app iff that
 * app has a bucket on `display`, so visibility is implemented purely by *which*
 * buckets receive the comment's description:
 *   - **shared** — write `comment.html` into the `description` of **every** key
 *     present on `display` (each app bucket the rendered event already has). The
 *     comment travels wherever the event travels.
 *   - **internal** — write into **only** the submitting app's bucket
 *     (`appName`); this is Part 33's original single-bucket behaviour.
 * `internal` is honoured ONLY when the submitting app's connection has opted in
 * via `enableInternalComments` (Part 61 D2): the engine never trusts the client
 * for who-sees-what, so a flag-off app's `internal` request is coerced to the
 * collaboration-safe `shared` default. Anything other than an honoured
 * `internal` (absent, `'shared'`, an unrecognised value) is `shared`. `shared`
 * itself only ever reaches buckets the author already created, so the client can
 * never widen visibility beyond the event's existing audience.
 *
 * Runs-post-render invariant (D4): the comment is raw user-typed HTML, stored
 * **verbatim** — never escaped, trimmed, or templated. The planner renders
 * every string in the display tree as a Nunjucks template
 * (`renderEventDisplay`), so this fold must run *after* render; folding raw
 * HTML pre-render would compile a comment containing `{{`/`{%` (throwing, or
 * interpolating against the render context — a data-exposure path). It must also
 * run after the override merge so every title bucket exists to write into.
 *
 * Pure: mutates and returns the passed `eventPayload`. No-op (returns it
 * unchanged) when there is no comment or the gate fails — including when
 * `comment` is not the rich-text object (e.g. a plain string: it has no
 * `.text`/`.fileList`, so nothing is written). Never touches `title`.
 *
 * @param {Object} eventPayload — the event payload carrying `display`.
 * @param {{ html?: string, text?: string, fileList?: any[] } | null} comment
 * @param {string} appName — the display bucket key (workflows entry app_name).
 * @param {'shared'|'internal'} [visibility='shared'] — writer's per-comment choice.
 * @param {boolean} [enableInternalComments=false] — connection opt-in; gates `internal`.
 * @returns {Object} the same `eventPayload`.
 */
function foldCommentIntoEvent(
  eventPayload,
  comment,
  appName,
  visibility = "shared",
  enableInternalComments = false,
) {
  const hasText =
    typeof comment?.text === "string" && comment.text.trim().length > 0;
  const hasFiles =
    Array.isArray(comment?.fileList) && comment.fileList.length > 0;

  if (!hasText && !hasFiles) return eventPayload;

  // A pre-hook/author override merge can produce a `display` without the app
  // key — ensure the submitting app's bucket exists before writing into it.
  eventPayload.display ??= {};
  eventPayload.display[appName] ??= {};

  // `internal` is honoured only when the connection opted in; otherwise the
  // request is coerced to `shared` (the engine never trusts the client for who
  // sees what — Part 61 D2). Everything else is `shared`.
  const isInternal = visibility === "internal" && enableInternalComments === true;

  if (isInternal) {
    eventPayload.display[appName].description = comment.html;
  } else {
    // Shared: fan out into every bucket the rendered event already has.
    for (const key of Object.keys(eventPayload.display)) {
      (eventPayload.display[key] ??= {}).description = comment.html;
    }
  }

  return eventPayload;
}

export default foldCommentIntoEvent;
