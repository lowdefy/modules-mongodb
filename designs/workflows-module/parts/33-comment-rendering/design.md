# Part 33 — Comments are standard events rendered on the events timeline

A workflow submit (and the Part 24 fields operation) captures an optional rich-text `comment`. Today that comment is written to `event.metadata.comment` and rendered by a **bespoke "Comments" card** that runs its own query — while the standard `EventsTimeline` never surfaces it, and the workflow view pages don't even render the standard timeline. This part makes the comment a first-class part of the standard event: the engine writes the comment HTML into the event's existing **`display.{app_name}.description`** channel, the standard timeline renders it inline under the auto-generated title, and the bespoke comments card is deleted.

## Proposed change

1. **The comment becomes the event's `description`.** The engine writes the comment's HTML into `display.{app_name}.description` — the secondary rich-text channel the timeline already renders (`EventsTimeline.js:284-287`). No new render path, no new event field.
2. **`metadata.comment` is dropped.** The comment is no longer stored under `metadata`. The event carries it once, in `display.{app_name}.description`. No text shadow in v1.
3. **A single shared helper folds the comment into the event** for both write paths — `SubmitWorkflowAction` (the default log event) and Part 24's `UpdateActionFields` (`action-fields-updated`) — so the two cannot drift.
4. **Runtime comment wins over a static `display.description` override.** The comment is applied as the last layer, after the YAML `event_overrides` and pre-hook merges — so a typed comment always owns that event's description. This answers the Part 32 question (the static `event:` channel stays; comment takes precedence when present).
5. **The bespoke Comments card is deleted, and the standard events timeline is added to the workflow view pages.** `workflow-action-view.yaml`'s `comments_card` (and its `get_comment_events` query / `comment_events_list` state) is removed and replaced with the shared `events-timeline` component, filtered to the action. The action page now shows the full activity timeline — comments included inline — instead of a comment-only list.

## Background: what the code actually does

- **Where the comment is captured.** A `TiptapInput` with `id: comment` on the review/edit surfaces (`workflow-action-review.yaml:140`, `workflow-action-edit.yaml`, `review.yaml.njk:178`). Mandatory on `request_changes`, optional elsewhere. `TiptapInput` writes `{ html, text, markdown, fileList }` to `_state.comment` (`@lowdefy/blocks-tiptap` `useTiptapState.js:49-52`).
- **Where the comment is sent.** The submit/request-changes actions post `comment: { _state: comment }` — the **whole TipTap object** — to the action endpoint.
- **Where the comment is stored today (pre-Part-38).** The current `SubmitWorkflowAction` threads `params.comment` into `buildDefaultLogEventPayload`, which writes `metadata.comment` **only when `typeof comment === "string"`** (`dispatchLogEvent.js:66`). Because the page sends an object, the guard is `false` and the comment is dropped on the floor — a latent bug. [Part 38](../38-engine-rebuild/design.md) rebuilds these call sites into shared load→plan→commit planners; this part lands on that new structure, defining the comment's home (`display.{app_name}.description`) and pinning the wire contract there, so the bug doesn't carry forward.
- **The render channel.** The events timeline renders exactly one secondary rich-text slot: `EventDescription` → `dangerouslySetInnerHTML={{ __html: sanitize(event.description) }}` (`EventsTimeline.js:284-287`). The aggregation maps `display.{app_name}.description → description` (`events-timeline.yaml:43-50`). So `event.description` must be an **HTML string**, sanitized at render.
- **Title resolution is at write time, in the engine.** Per [Part 38](../38-engine-rebuild/design.md), the engine renders event display as plain Nunjucks **strings** during the plan phase — the engine-default title template plus any author/pre-hook overrides — so the timeline receives already-rendered plain strings. This supersedes the older "`display.{app}.title` is a `_nunjucks` operator resolved by `new-event` at read/write time" approach. The comment is raw HTML (not a template); it is folded into the rendered display with no read-time templating.
- **The timeline isn't on the workflow pages.** `workflow-action-view.yaml` renders a bespoke `comments_card` (querying `metadata.comment: { $exists: true }`) plus a `status_history_list`. It does **not** compose the shared `events-timeline` component. Workflow events already carry `references.{entity_ref}: [entity_id]`, so they surface on the **entity** page timeline — but the action's own page has no general timeline.

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
- ensures the `display[appName]` bucket exists before writing (`display[appName] ??= {}`) — a pre-hook/author override merge can produce a `display` without the app key (D7), so writing `display[appName].description` directly would throw,
- sets `display[appName].description = comment.html` when `comment?.html` is a non-empty string,
- is a no-op when there's no comment.

This supersedes the pre-Part-38 inline `metadata.comment` write (in `dispatchLogEvent.js`'s `buildDefaultLogEventPayload`). Post-Part-38 the helper is called once inside the shared event-dispatch planner (`planEventDispatch`) that both the submit and `UpdateActionFields` paths reuse, so the two cannot drift.

### D4 — Runtime comment wins; applied last

A workflow author can set a static per-app `event.{interaction}.display.{app}.description` — the static `event:` display channel baked by [Part 13](../13-resolver-apis/design.md)'s `emitEventOverrides` (**not** Part 32, which dropped the static *status* layer, a different mechanism) — or a pre-hook can return `event_overrides.display`. When the user *also* types a comment, the comment wins for the submitting app's description. Implementation: `foldCommentIntoEvent` runs **after** the engine's event-display merge (the engine-default → YAML-override → pre-hook layers, per [Part 38](../38-engine-rebuild/design.md)), overwriting `display.{app_name}.description` with the comment HTML.

Precedence is per field:

- **title** — an author per-app override wins over the engine-generic title (D7);
- **description** — a runtime comment wins over an author static description.

Both fall out of *merge, then fold-comment-last*, once the merge deep-merges under the app key (D7). The static `event:` display channel **stays**: authors set a default per-app title/description for comment-less interactions — the normal case on **form-submit events, which carry no comment** (the comment rides Part 24's sidebar fields operation, not form submit). The comment only takes precedence for the description on the one event where it's present.

### D7 — Multi-app event display & per-app author title overrides

Event `display` is **app-keyed** (`display.{app}.{title,description,info}`): one event document is read by multiple apps' timelines, each keyed by its own `display_key` (the events-timeline `$<display_key>.title` projection — and an event surfaces in an app's timeline **only when `display.{that-app}` exists**, per the `$ne: null` filter). This is what makes workflows natively multi-app: a team app and a customer portal read the *same* event document but show different messaging.

The engine writes a generic default title for the submitting app. Authors override **per app** via `event.{interaction}.display.{app}.{title,description}` — e.g. an exact, user-named, detail-rich title for the team app and a generic/opaque one for the customer portal. These overrides are **plain Nunjucks template strings rendered by the engine** at plan/write time against the event render context (`user`, `action_type`, `status_after`, …). They are **not** `_nunjucks` operators and are not resolved at read time — matching [Part 38](../38-engine-rebuild/design.md)'s engine-rendered-display model.

For engine title + author title/description + comment to coexist *within one app bucket*, the engine's event-display merge must **deep-merge under the app key** — two levels: `display → {app} → {title,description}`. Today's merge is one level deep at `display` (`mergeEventOverrides.js`'s `{ ...base.display, ...override.display }`), so an app-keyed override replaces the whole app bucket and drops the engine title; **Part 38 carries that shallow merge over unchanged**. So **this part adds the deep-merge under the app key.** It lands after Part 38, so the merge lives wherever Part 38's final structure puts the event-display merge (likely the event-dispatch planner, not today's `mergeEventOverrides.js`) — amend whichever file that is. With deep-merge in place, the comment folds in last (D4) without clobbering the title, and a comment-less form-submit event still renders the author's per-app title.

### D5 — Pin the wire contract: `comment` is the rich-text value, engine takes `.html`

The pages keep sending `comment: { _state: comment }` (the TipTap value). The engine contract is: `comment` is `{ html, text, … } | null`; the engine reads `comment.html`. This fixes the current `typeof comment === "string"` bug (which silently drops object comments) without changing every page's payload. The `required` validation on `request_changes` already guards emptiness at the input.

### D6 — Delete the bespoke card; add the shared timeline to the workflow view pages

Deleting `comments_card` without adding a timeline would leave the action's own view page with no comment surface (only the entity page would show it, via `references`). So this part:

- **removes** `workflow-action-view.yaml`'s `comments_card`, its `get_comment_events` request, the `metadata.comment: { $exists }` filter, and the `comment_events_list` state/list blocks;
- **adds** the shared `_ref: { module: events, component: events-timeline }`, filtered to the action (`reference_field: action_ids`, `reference_value: get_action._id`), so the page shows the full activity stream — submits, status changes, comments inline — in one standard surface.

The `status_history_list` block is left as-is in v1 (it reads the action doc's `status[]`, a different source from events); folding status history into the timeline is a separate concern.

**Dependency — `events.display_key` must equal `workflows.app_name`.** The `events-timeline` component reads events keyed by its `display_key` var (defaulting to the **events** module entry's `_module.var: display_key`), while the engine writes the event's `display` (title + comment-as-description) under the **workflows** entry's `app_name`. The app must wire these equal or the action-page timeline renders empty. This is already a standing invariant — it's why workflow events surface on the entity-page timeline today (Background) — so it's not new work, just a configuration prerequisite worth stating.

## Files changed

### Plugin — `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`

- **`shared/foldCommentIntoEvent.js`** (new) — pure helper: `(eventPayload, comment, appName) → eventPayload` with `display[appName].description` set from `comment.html`. Unit-tested for: html present, html empty/whitespace, comment null, object-vs-string input, no app clobber of `title`, and a **missing `display[appName]` bucket** (created via `display[appName] ??= {}`).
- **Event-dispatch planner** (amend — [Part 38](../38-engine-rebuild/design.md)'s `shared/phases/planners/planEventDispatch.js`, the shared planner both `SubmitWorkflowAction` and `UpdateActionFields` reuse) — three changes, all in this one file: (1) **deep-merge event `display` under the app key** (`display → {app} → {title,description}`) so the engine title + an author per-app override + the comment coexist instead of clobbering (D7); (2) the engine-default event no longer writes `metadata.comment`; (3) call `foldCommentIntoEvent` **after** the merge so the comment wins the description slot (D4). Pre-Part-38 this logic lived across `SubmitWorkflowAction/buildDefaultLogEventPayload` (`dispatchLogEvent.js`) and `mergeEventOverrides.js`; Part 38 consolidates it into the planner, so this is where the fold is called — there is no longer a `handleSubmit.js` orchestration step to thread it through. Unit-test: title + static description + comment coexist under one app key; no `metadata.comment` written. Migrate any pre-Part-38 `metadata.comment` assertions onto `display.{app_name}.description` (see Verification § Test migration).
- **`UpdateActionFields/...`** — Part 24's `planFieldsUpdate` event builder calls `foldCommentIntoEvent` on its `action-fields-updated` payload (so the fields-operation comment renders identically). Owned jointly with Part 24 — see Contract to neighbours.

### Module — `modules/workflows/`

- **`pages/workflow-action-view.yaml`** (amend) — delete `comments_card` (+ `get_comment_events`, `comment_events_list`); add the shared `events-timeline` component filtered to the action.
- **Form action `view` template (Part 16)** — same swap on the form-kind view surface, if/where a comments card exists there. Template-only; handled as a Part 16 follow-on (those files live in `_completed/`).

### Concept-spec amendments

- **[`submit-pipeline/spec.md`](../../../workflows-module-concept/submit-pipeline/spec.md) § Default log event** — the runtime comment is written to `display.{app_name}.description` (last layer, wins over overrides), not `metadata.comment`; the `event:` override channel is per-app (`display.{app}.{title,description}`) Nunjucks template strings; the merge deep-merges under the app key (D7).
- **[`engine/spec.md`](../../../workflows-module-concept/engine/spec.md)** — remove `metadata.comment` from the event metadata shape; note the comment-as-description rule and its precedence.

## In scope

- Comment → `display.{app_name}.description` in both the submit and `UpdateActionFields` event paths, via one shared helper.
- Dropping `metadata.comment`.
- Deep-merging the engine event-display merge under the app key so per-app author title/description overrides and the comment coexist (D7).
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
- **Test migration:** any pre-existing test that asserts `metadata.comment` on an event (pre-Part-38 these were `dispatchLogEvent.test.js`'s four `buildDefaultLogEventPayload` comment cases) is **removed or migrated** to assert `display.{app_name}.description` via `foldCommentIntoEvent` + the planner. No `metadata.comment` assertions remain after this part.
- **Unit:** the event-display merge deep-merges under the app key — engine title + an author per-app `display.{app}.{title,description}` override + the comment all coexist (D7); no layer clobbers another within an app bucket.
- **Unit:** a static `event.{interaction}.display.{app}.description` is overwritten by a runtime comment (D4); with no comment, the static title and description survive and render.
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

- **This part owns** `foldCommentIntoEvent`, the event-dispatch-planner amendments (deep-merge under the app key + the comment fold; pre-Part-38 this was `dispatchLogEvent.js` / `mergeEventOverrides.js`), dropping `metadata.comment`, and the `workflow-action-view.yaml` tile swap.
- **Part 24** calls `foldCommentIntoEvent` from its `action-fields-updated` event builder. If Part 24 lands first, it writes the comment to `display.description` directly and this part factors out the shared helper; if this part lands first, Part 24 imports the helper. Either order works; the helper is the contract.
- **Part 16** (form view template) does the same card-swap on the form-kind view surface as a template-only follow-on (its files are in `_completed/`).
