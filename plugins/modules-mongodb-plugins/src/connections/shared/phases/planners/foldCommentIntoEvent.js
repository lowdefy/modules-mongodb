/**
 * Fold a workflow submit's optional rich-text comment into the event's
 * `display.{appName}.description` slot (Part 33 D1/D3/D4/D5).
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
 * Runs-post-render invariant (D4): the comment is raw user-typed HTML, stored
 * **verbatim** — never escaped, trimmed, or templated. The planner renders
 * every string in the display tree as a Nunjucks template
 * (`renderEventDisplay`), so this fold must run *after* render; folding raw
 * HTML pre-render would compile a comment containing `{{`/`{%` (throwing, or
 * interpolating against the render context — a data-exposure path).
 *
 * Pure: mutates and returns the passed `eventPayload`. No-op (returns it
 * unchanged) when there is no comment or the gate fails — including when
 * `comment` is not the rich-text object (e.g. a plain string: it has no
 * `.text`/`.fileList`, so nothing is written).
 *
 * @param {Object} eventPayload — the event payload carrying `display`.
 * @param {{ html?: string, text?: string, fileList?: any[] } | null} comment
 * @param {string} appName — the display bucket key (workflows entry app_name).
 * @returns {Object} the same `eventPayload`.
 */
function foldCommentIntoEvent(eventPayload, comment, appName) {
  const hasText =
    typeof comment?.text === "string" && comment.text.trim().length > 0;
  const hasFiles =
    Array.isArray(comment?.fileList) && comment.fileList.length > 0;

  if (!hasText && !hasFiles) return eventPayload;

  // A pre-hook/author override merge can produce a `display` without the app
  // key — ensure the bucket exists before writing into it.
  eventPayload.display ??= {};
  eventPayload.display[appName] ??= {};
  eventPayload.display[appName].description = comment.html;

  return eventPayload;
}

export default foldCommentIntoEvent;
