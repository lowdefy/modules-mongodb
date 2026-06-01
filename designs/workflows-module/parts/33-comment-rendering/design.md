# Part 33 — Comments are standard events rendered on the events timeline

A workflow submit (and the Part 24 fields operation) captures an optional rich-text `comment`. Today that comment is written to `event.metadata.comment` and rendered by a **bespoke "Comments" card** that runs its own query — while the standard `EventsTimeline` never surfaces it, and the workflow view pages don't even render the standard timeline. This part makes the comment a first-class part of the standard event: the engine writes the comment HTML into the event's existing **`display.{app_name}.description`** channel, the standard timeline renders it inline under the auto-generated title, and the bespoke comments card is deleted.

## Proposed change

1. **The comment becomes the event's `description`.** The engine writes the comment's HTML into `display.{app_name}.description` — the secondary rich-text channel the timeline already renders (`EventsTimeline.js:284-287`). No new render path, no new event field.
2. **`metadata.comment` is dropped.** The comment is no longer stored under `metadata`. The event carries it once, in `display.{app_name}.description`. No text shadow in v1.
3. **A single shared helper folds the comment into the event** for both write paths — `SubmitWorkflowAction` (the default log event) and Part 24's `UpdateActionFields` (`action-fields-updated`) — so the two cannot drift.
4. **Runtime comment wins over a static `display.description` override.** The comment is applied as the last layer, after the YAML `event_overrides` and pre-hook merges — so a typed comment always owns that event's description. This answers the Part 32 question (the static `event:` channel stays; comment takes precedence when present).
5. **The bespoke Comments card is deleted, and the standard events timeline is added to the workflow view pages.** `simple-view.yaml`'s `comments_card` (and its `get_comment_events` query / `comment_events_list` state) is removed and replaced with the shared `events-timeline` component, filtered to the action. The action page now shows the full activity timeline — comments included inline — instead of a comment-only list.

## Background: what the code actually does

- **Where the comment is captured.** A `TiptapInput` with `id: comment` on the review/edit surfaces (`simple-review.yaml:140`, `simple-edit.yaml`, `review.yaml.njk:178`). Mandatory on `request_changes`, optional elsewhere. `TiptapInput` writes `{ html, text, markdown, fileList }` to `_state.comment` (`@lowdefy/blocks-tiptap` `useTiptapState.js:49-52`).
- **Where the comment is sent.** The submit/request-changes actions post `comment: { _state: comment }` — the **whole TipTap object** — to the action endpoint.
- **Where the comment is stored today.** `SubmitWorkflowAction` passes `params.comment` through `handleSubmit.js:138` → `buildDefaultLogEventPayload`, which writes `metadata.comment` **only when `typeof comment === "string"`** (`dispatchLogEvent.js:66`). Because the page sends an object, this guard is `false` and the comment is currently dropped on the floor — a latent bug this part fixes by pinning the contract.
- **The render channel.** The events timeline renders exactly one secondary rich-text slot: `EventDescription` → `dangerouslySetInnerHTML={{ __html: sanitize(event.description) }}` (`EventsTimeline.js:284-287`). The aggregation maps `display.{app_name}.description → description` (`events-timeline.yaml:43-50`). So `event.description` must be an **HTML string**, sanitized at render.
- **Title resolution is at write time.** The default event's `display.{app}.title` is stored as a `_nunjucks` operator that the events module (`new-event`) resolves server-side at write time, so the timeline receives a plain string. The comment can be written the same way — as a resolved string at write time — with no read-time templating.
- **The timeline isn't on the workflow pages.** `simple-view.yaml` renders a bespoke `comments_card` (querying `metadata.comment: { $exists: true }`) plus a `status_history_list`. It does **not** compose the shared `events-timeline` component. Workflow events already carry `references.{entity_ref}: [entity_id]`, so they surface on the **entity** page timeline — but the action's own page has no general timeline.

## Key decisions

### D1 — Comment renders via `display.{app_name}.description`, not a new field

The timeline already has a title + secondary-rich-text model. The auto-title (`{{user}} marked {{action_type}} as {{status_after}}`) is the headline; the comment is the body. This is exactly what `EventDescription` renders. Reusing `description` means **zero block changes** — the comment shows up the moment the field is populated. A `request_changes` row becomes: title "Sam marked review as changes-required" + the comment HTML in the card below it.

### D2 — Drop `metadata.comment` entirely

The comment lives once, in `display.{app_name}.description` (an HTML string). No `metadata.comment`, no `{ text, html }` shadow.

- **Why no text shadow:** the only consumers proposed for a text shadow were search and email rendering — both out of scope here (email is a Part 33 non-goal; no search-over-comments need exists). Per "build for what exists," it's dropped. If full-text search over comments surfaces later, add a `text` projection then — it's additive.
- **Migration:** existing events with `metadata.comment` keep it (harmless, unread after the tile is deleted). No backfill. New events write `display.description` only. (A one-shot migration to lift legacy `metadata.comment` into `display.{app}.description` is possible but not required for v1 — call it out as deferred.)

### D3 — One shared helper, applied in both write paths

Both the submit pipeline and Part 24's `UpdateActionFields` accept a `comment` and emit an event. The "fold comment into the event's description" logic is a single pure helper — `foldCommentIntoEvent(eventPayload, comment, appName)` — called by both, so the behaviour can't diverge. It:

- reads the comment's `html` (accepting the `{ html, text }` rich-text value; ignores `markdown` / `fileList`),
- sets `display[appName].description = comment.html` when `comment?.html` is a non-empty string,
- is a no-op when there's no comment.

This supersedes the current inline `metadata.comment` write in `dispatchLogEvent.js` and is the single point Part 24's `planFieldsUpdate` event builder also calls.

### D4 — Runtime comment wins; applied last

A workflow author can set a static `event.{interaction}.display.description` (Part 32 Layer 2) or a pre-hook `event_overrides.display.description` (Layer 4). When the user *also* types a comment, the comment wins. Implementation: `foldCommentIntoEvent` runs **after** `mergeEventOverrides` (i.e. after layers 2 and 4), overwriting `display.description` with the comment HTML. This mirrors the existing intent in `dispatchLogEvent.js` (comment folded so "a YAML override … cannot clobber the user's comment") — but corrected for the new target field, where merge order would otherwise let a static description win.

This resolves Part 32's deferred question: the static `event:` description channel **stays** (authors can set a default description for comment-less interactions); the runtime comment simply takes precedence for that one event when present.

### D5 — Pin the wire contract: `comment` is the rich-text value, engine takes `.html`

The pages keep sending `comment: { _state: comment }` (the TipTap value). The engine contract is: `comment` is `{ html, text, … } | null`; the engine reads `comment.html`. This fixes the current `typeof comment === "string"` bug (which silently drops object comments) without changing every page's payload. The `required` validation on `request_changes` already guards emptiness at the input.

### D6 — Delete the bespoke card; add the shared timeline to the workflow view pages

Deleting `comments_card` without adding a timeline would leave the action's own view page with no comment surface (only the entity page would show it, via `references`). So this part:

- **removes** `simple-view.yaml`'s `comments_card`, its `get_comment_events` request, the `metadata.comment: { $exists }` filter, and the `comment_events_list` state/list blocks;
- **adds** the shared `_ref: { module: events, component: events-timeline }`, filtered to the action (`reference_field: action_ids`, `reference_value: get_action._id`), so the page shows the full activity stream — submits, status changes, comments inline — in one standard surface.

The `status_history_list` block is left as-is in v1 (it reads the action doc's `status[]`, a different source from events); folding status history into the timeline is a separate concern.

## Files changed

### Plugin — `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`

- **`shared/foldCommentIntoEvent.js`** (new) — pure helper: `(eventPayload, comment, appName) → eventPayload` with `display[appName].description` set from `comment.html`. Unit-tested for: html present, html empty/whitespace, comment null, object-vs-string input, no app clobber of `title`.
- **`SubmitWorkflowAction/dispatchLogEvent.js`** (amend) — `buildDefaultLogEventPayload` stops writing `metadata.comment`; the handler calls `foldCommentIntoEvent` **after** `mergeEventOverrides` so the comment wins (D4). Update the layer-ordering doc comment (it currently describes folding into `metadata.comment`).
- **`SubmitWorkflowAction/mergeEventOverrides.js`** (amend) — drop the stale "comment folded into metadata.comment" note; the merge no longer touches comment.
- **`UpdateActionFields/...`** — Part 24's `planFieldsUpdate` event builder calls `foldCommentIntoEvent` on its `action-fields-updated` payload (so the fields-operation comment renders identically). Owned jointly with Part 24 — see Contract to neighbours.

### Module — `modules/workflows/`

- **`pages/simple-view.yaml`** (amend) — delete `comments_card` (+ `get_comment_events`, `comment_events_list`); add the shared `events-timeline` component filtered to the action.
- **Form action `view` template (Part 16)** — same swap on the form-kind view surface, if/where a comments card exists there. Template-only; handled as a Part 16 follow-on (those files live in `_completed/`).

### Concept-spec amendments

- **[`submit-pipeline/spec.md`](../../../workflows-module-concept/submit-pipeline/spec.md) § Default log event** — the runtime comment is written to `display.{app_name}.description` (last layer, wins over overrides), not `metadata.comment`.
- **[`engine/spec.md`](../../../workflows-module-concept/engine/spec.md)** — remove `metadata.comment` from the event metadata shape; note the comment-as-description rule and its precedence.

## In scope

- Comment → `display.{app_name}.description` in both the submit and `UpdateActionFields` event paths, via one shared helper.
- Dropping `metadata.comment`.
- Comment-beats-static-override precedence.
- Deleting the bespoke comments card and rendering the standard timeline on the workflow view page(s).

## Out of scope / deferred

- **Editing or deleting comments after the fact** — events are immutable; a future "edit comment" is a new operation.
- **Threading / replies** — flat timeline only.
- **Standalone comments (no transition).** Every comment today rides a submit or a fields-update; there is no "just post a comment, no state change" write path. Adding one is a new operation, not a rendering change.
- **Email / notification rendering of comments** — separate channel; needs the `text` shadow, which is why text is reconsidered there, not here.
- **Full-text search over comments** — would reintroduce a `text` projection; add when a real need surfaces.
- **Backfill of legacy `metadata.comment` into `display.description`** — old events keep their `metadata.comment` (unread); no migration in v1.
- **Folding `status_history` into the timeline** — left as a separate block reading the action doc.

## Verification

- **Unit:** `foldCommentIntoEvent` sets `display[app].description` from `comment.html`; no-ops on null/empty; doesn't touch `title`; identical result whether called from submit or fields paths.
- **Unit:** a static `event.{interaction}.display.description` override is overwritten by a runtime comment (D4); with no comment, the static description survives.
- **Integration (demo):**
  - Submit `request_changes` with a comment → the entity-page timeline and the action view-page timeline both show the auto-title + comment HTML inline; no `metadata.comment` is written.
  - Submit with no comment → event has only a title (or the static override description if declared); no empty description card.
  - The deleted comments card no longer renders; the action page shows the standard timeline.
  - Part 24 `UpdateActionFields` with a comment → the `action-fields-updated` event renders the comment inline the same way.
- E2E coverage lands in [Part 22](../_next/22-workflows-e2e-suite/design.md).

## Depends on / relates to

- **[Part 24 — universal-fields](../24-universal-fields/design.md)** — shares the `comment` param on the `UpdateActionFields` operation; both paths call `foldCommentIntoEvent`. Part 24's open question "does the sidebar surface a comment field" is unaffected — wherever a comment is captured, it renders the same way.
- **[Part 32 — drop static overrides](../_completed/32-drop-static-overrides/design.md)** — the static `event:` description channel stays; this part pins comment-beats-static precedence, closing Part 32's deferred question.
- **[Part 38 — engine rebuild](../38-engine-rebuild/design.md)** — `foldCommentIntoEvent` slots into the shared event-dispatch planner both handlers reuse.

## Contract to neighbours

- **This part owns** `foldCommentIntoEvent`, the `dispatchLogEvent.js` / `mergeEventOverrides.js` amendments, dropping `metadata.comment`, and the `simple-view.yaml` tile swap.
- **Part 24** calls `foldCommentIntoEvent` from its `action-fields-updated` event builder. If Part 24 lands first, it writes the comment to `display.description` directly and this part factors out the shared helper; if this part lands first, Part 24 imports the helper. Either order works; the helper is the contract.
- **Part 16** (form view template) does the same card-swap on the form-kind view surface as a template-only follow-on (its files are in `_completed/`).
