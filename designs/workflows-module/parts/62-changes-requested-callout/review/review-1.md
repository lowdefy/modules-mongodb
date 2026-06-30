# Review 1

Scope: `designs/workflows-module/parts/62-changes-requested-callout/design.md`. Verified against `GetWorkflowAction.js`, `foldCommentIntoEvent.js`, `planEventDispatch.js`, `new-event.yaml`, `EventsTimeline.js`, `universal-fields-callout.yaml`, `action-workspace.yaml`, the `action_statuses` enum, and Parts 33/56/61.

Most of the design checks out against the code: the event `type` really is `action-request_changes` (`planEventDispatch.js:196`, `eventType = \`action-${signal}\``), `action_ids`and`date` are spread to the event root (`new-event.yaml` `\_object.assign`of`references`+`date: \_date now`), the app bucket is top-level so `{app_name}.description`(not`display.{app_name}.description`) is the correct read path, `findDocs`forwards`sort`/`limit`/`projection` to the driver (`mongo/findDocs.js`), `connection.app_name` keys the read (`GetWorkflowAction.js:123`), and the `changes-required`enum entry carries`color`/`borderColor`/`titleColor`/`title` (`action_statuses.yaml:37-42`). The status-color mechanism in D4 is real: templates resolve pill colors by `\_ref`'ing `../shared/enums/action_statuses.yaml` and keying on stage (`check-action-surface.yaml:96-127`), so the callout fragment can do the same. The findings below are where the design is silent or optimistic.

## Correctness & Security

### 1. The callout must sanitize the comment HTML; the design doesn't say so, and the obvious template (`universal-fields-callout.yaml`) does not

> **Rejected.** Premise is wrong. Lowdefy's `Html` block delegates to `HtmlComponent`, which runs `DOMPurify.sanitize` on its `html` prop on every mount/update (`@lowdefy/block-utils/dist/HtmlComponent.js`). The `{{ description | safe }}` in `universal-fields-callout.yaml` only disables nunjucks autoescaping (so operator-injected HTML reaches the block intact) — the block itself still sanitizes. The unsanitized variant is the separate `DangerousHtml` block. So mirroring the description callout's `type: Html` already sanitizes verbatim comment HTML; there is no XSS path. `EventsTimeline` sanitizes manually only because it's a custom React block that can't use `HtmlComponent`, and it does so correctly. Added a one-line note to Files-changed making the safe-render property explicit (use `Html`/`Alert`, not `DangerousHtml`).

The comment is stored **verbatim, unsanitized** — `foldCommentIntoEvent.js` writes `comment.html` with an explicit "stored verbatim — never escaped, trimmed, or templated" contract. The **only** place this exact string is rendered today is the timeline, which runs it through `DOMPurify.sanitize` (`EventsTimeline.js:33-35,286`). The callout introduces a **second render path** for the same user-typed HTML.

The design points at the description callout as the fragment to mirror (DA2, line 19), but `universal-fields-callout.yaml` renders its HTML through `_nunjucks` with `{{ description | safe }}` — i.e. **no sanitization**. If the changes-requested callout copies that pattern, a reviewer can store `<img src=x onerror=…>` in a mandatory request-changes comment and it executes for the reworker — an XSS path that the timeline render of the same comment is protected against.

Fix: render the callout through a sanitizing path (the `EventsTimeline` block's DOMPurify approach, or a sanitizing block), **not** a raw `| safe` Html block. State this explicitly in the design — it's a security requirement, not an implementation detail. (Note: `universal-fields-callout.yaml` rendering its own user-entered description with `| safe` looks like the same latent issue; worth confirming separately, but Part 62 should not inherit it.)

### 2. Image-only / empty-html comments produce a present-but-blank callout

The presence gate (D3) is "render when `changes_requested` is non-null." But `changes_requested` is `comment.html` only. `foldCommentIntoEvent`'s emptiness gate passes a comment when `comment.text` **or** `comment.fileList` is non-empty — so an **image-only** comment (screenshot, no text) is folded, and its `comment.html` may be an empty `<p></p>` with the attachment living in `fileList`, which the callout never reads. Result: a non-null-but-visually-empty callout, exactly the "empty callout would be noise" outcome D3 says it avoids.

The design should either (a) gate on non-empty rendered content rather than non-null, or (b) decide what to do with `fileList` attachments on a request-changes comment (the timeline surfaces them; the callout, as specified, drops them). At minimum, acknowledge that the callout shows `description`-html only and that fileList-only comments are out of scope.

## Multi-app semantics

### 3. "Latest event, then project the calling app's bucket" can suppress the callout for an app that has an earlier shared brief

D1 (line 28) claims the read is "unambiguous even if the action has cycled" because `sort: date desc, limit 1` takes the most recent `action-request_changes` event. That's true for _latest-overall_, but the query takes the global latest **then** projects `{app_name}.description`. Combined with Part 61's `internal` option, consider: customer submits → team requests changes **shared** (customer reworks) → customer resubmits → team requests changes **internal**. The action is back in `changes-required` (the customer's court), but for the customer app the latest request-changes event has **no customer bucket**, so `changes_requested` is `null` and **no callout shows** — even though an earlier shared brief exists and the action is theirs to rework.

This may be the _intended_ semantics (the current brief is internal, so showing a stale prior-cycle brief would be misleading, and the status pill still conveys state). But the design asserts unambiguity without naming this interaction. Decide and document: is the contract "latest overall, null if not visible to me" (current spec), or "latest visible to me"? They differ exactly in the cycled-internal case, and a reworker staring at a `changes-required` pill with no brief is a real UX outcome.

## Performance

### 4. New query pattern on `log-events` has no stated supporting index

The read matches `{ type: "action-request_changes", action_ids: action._id }` with `sort: { date: -1 }`. This is a **different access pattern** from the only existing reader of this collection, `GetEventsTimeline`, which matches by `reference_field`/`reference_value` (`GetEventsTimeline.js:60-64`). Nothing in the design or the events module indexes `{ action_ids, type, date }`, so on a growing `log-events` collection this fires a scan-and-sort on **every** action-page load while in `changes-required`.

The design resolves the "open question" rule poorly here — it should confirm whether a supporting index exists (e.g. `{ action_ids: 1, type: 1, date: -1 }`) or add one to the Files-changed / index plan, rather than leaving it implicit. Cheap on a small log; not on a real one.

## Cross-references & minor

### 5. `connection.eventsCollection` is not declared in `WorkflowAPI/schema.js`

The envelope snippet reads `connection.eventsCollection ?? "log-events"`. `GetEventsTimeline.js:38` uses the identical expression, so the pattern is proven — but `eventsCollection` is **absent** from `WorkflowAPI/schema.js` (which declares `workflowsCollection`, `actionsCollection`, `contactsCollection` at `:61,66,149`). This is a pre-existing gap that Part 62 becomes the second consumer of. Worth a one-line note that the var is undeclared (so apps overriding the events collection name today rely on an unschema'd property), or fold a schema addition in. Not blocking.

### 6. The "rides alongside Part 56's other envelope additions (`workflow_id`, `entity_link.name`)" reference is stale against the source

> **Resolved (auto).** Confirmed against source: `entity_link` is `{ pageId, urlQuery, title }` (`GetWorkflowAction.js:235-241`) with no `name`, and there is no entity-name `findDocs` read. Dropped `entity_link.name` from the Files-changed sibling reference (now just `workflow_id`, which is present at `:252`) and removed "and Part 56's entity-name read" from the Background list of existing gated reads.

Background (line 18) and Files-changed (line 76) lean on Part 56's `entity_link.name` as a sibling envelope addition this read "rides alongside." `workflow_id` is present in `GetWorkflowAction.js:252`, but `entity_link.name` (Part 56 D10) is **not** in the current source — `entity_link` carries only `pageId`/`urlQuery`/`title` (`GetWorkflowAction.js:235-241`). So Part 56 is only partially landed in code, and the illustrative reference points at something that doesn't exist yet. The foundation Part 62 actually needs (the middle-column description-callout fragment) _does_ exist (`universal-fields-callout.yaml`), so this is cosmetic — but drop or correct the `entity_link.name` cross-reference so it doesn't read as a verified dependency.

### 7. "The middle column already composes a conditional description callout … shared by all templates" slightly overstates the structure

> **Resolved (auto).** Confirmed: `action-workspace.yaml` is layout-only and renders whatever `middle` array each template passes; `universal-fields-callout.yaml` is `_ref`'d individually by all five templates (`action`/`review`/`error`/`view`/`edit`). Reworded Background, D2, and Files-changed to describe the per-template `_ref` reality (a reusable fragment `_ref`'d per template, no single composition file) while keeping the "authored once" intent; also corrected the Files-changed wiring entry from `action-workspace.yaml` to the templates.

There is no single shared middle-column composition file. `action-workspace.yaml` is layout-only and renders whatever `middle` array each template passes; the description callout is `_ref`'d **individually** in each of the five templates (`view`/`edit`/`review`/`error`/`action`), the same way `universal-fields-callout.yaml` is consumed. The "authored once" goal is achievable (a new shared fragment `_ref`'d per template), but "the middle-column composition" implies a single composition point that doesn't exist. Minor wording; align the Files-changed description with the per-template `_ref` reality so the implementer doesn't go looking for a shared composition file to edit.
