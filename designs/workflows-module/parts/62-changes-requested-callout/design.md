# Part 62 — Changes-requested comment callout

When a reviewer requests changes on an action, the person who picks it up to rework has to hunt through the History timeline to find _what_ was asked for. This part surfaces that reviewer comment as a read-only callout at the **top of the middle column** of the action workspace, shown only while the action is in the `changes-required` stage — so the "what to fix" brief is the first thing the reworker sees.

> **Cross-reference — [Part 64](../64-action-description/design.md) lands before this part and defines the layout this callout slots into.** Part 64 deletes `universal-fields-callout.yaml` (the tinted, editable universal-field callout) and establishes a fixed middle-column model: **bare full-width alerts on top** (`workflow_closed_banner` first), then **one content card** whose first child is the plain `action-description.yaml` markdown render, then the floating action bar. This part's changes-requested callout lives in that **bare-alerts slot** — below the `workflow_closed_banner`, above the content card (and therefore above, and outside, the description render that now sits _inside_ the card). So "above the description" still holds, but the precise home is "the bare-alerts slot, below the closed banner". Concretely, two things change for this part's authoring — its fragment `_ref`s into the bare-alerts slot (not ahead of the deleted `universal-fields-callout.yaml`), and the read it adds to `GetWorkflowAction` (the `changes_requested` field) rides alongside Part 64's `description`-source change in the same handler. Wherever the prose below says "description callout", read it as "the `action-description.yaml` render inside the content card".

## Proposed change

1. **A changes-requested callout in the middle column's bare-alerts slot** (Part 64's model: below the `workflow_closed_banner`, above the content card that holds the description render), rendered only when the action is in `changes-required` and a comment exists.
2. **The comment is read from the event, resolved in the `GetWorkflowAction` envelope** — a single gated server-side read that exposes one new field, `changes_requested`. No per-page query, nothing stored on the action doc.
3. **App-scoping is inherited from Part 61 for free** — the envelope reads the comment from the calling app's bucket, so an `internal` reviewer note never reaches another app's callout and a `shared` one does.
4. **Rendered as a native `Alert`** — a `type: warning` Alert matching the `workflow_closed_banner` already in the workspace, so the full-width banners read consistently. The Alert sanitizes the comment HTML for free (`renderHtml` → `HtmlComponent` → DOMPurify).
5. **The request-changes comment is text-only** — inline files are disabled on its input, so the callout only ever renders a text brief and never has to render an attachment.

## Background

- `request_changes` is an FSM signal whose target stage is `changes-required` (`fsm/tables.js:39,71`). The action's current stage is `action.status[0].stage`.
- The reviewer's comment is folded **verbatim** into the transition's event at `event.{app_name}.description` (Part 33 `foldCommentIntoEvent`); the event is `type: "action-request_changes"` and carries `action_ids` (references are spread to the event's top level by `modules/events/api/new-event.yaml`) and a sortable `date`. The comment is **never** written to the action doc and **never** to `metadata` (Part 33 D2).
- **The comment is mandatory in the UI.** Part 33 D5 made the `request_changes` comment `required` on both surfaces (the form review `change_request_comment` and the check-surface Request Changes modal). So an action reaching `changes-required` through the normal flow always has a comment.
- Part 61 governs _who_ can read that comment: a `shared` comment is written into every app bucket on the event; an `internal` one stays in the writing app's bucket. Reads are unchanged — every consumer reads `event.{app_name}.description`.
- `GetWorkflowAction` (the `get_workflow_action` request, `GetWorkflowAction.js`) is the single envelope every action template reads (`_state.action.*` on form pages, `_state.current_action.*` on the check page). It already runs server-side with `connection.app_name` + `mongoDb` and already does gated projected `findDocs` reads (the action, the workflow, contacts). It returns an explicit allowlisted envelope (`GetWorkflowAction.js:247-277`).
- Part 56 (+ its layout addendum) is where this renders: a conditional **description render** already sits at the top of the middle column (addendum DA2). After [Part 64](../64-action-description/design.md) it is the small reusable fragment `action-description.yaml` (was `universal-fields-callout.yaml`, deleted by Part 64) `_ref`'d individually by each template; `action-workspace.yaml` is layout-only and renders whatever `middle` array the template passes, so there is no single shared composition file.

## Key decisions

### D1 — Read the comment from the event, in the `GetWorkflowAction` envelope

The comment lives on the event (Part 33), so the callout reads the event. It does so **in the envelope** rather than via a per-page query, because the envelope is already the single normalized source the templates read and already runs where the answer is cheap and correct:

- When `status[0].stage === "changes-required"`, `GetWorkflowAction` does one gated read of `connection.eventsCollection ?? "log-events"`: match `{ type: "action-request_changes", action_ids: action._id }`, `sort: { date: -1 }`, `limit: 1`, project `{ "{app_name}.description": 1 }`. It exposes `changes_requested` (the HTML string, or `null`) on the envelope. In every other stage the read is skipped and `changes_requested` is `null`.
- **Read contract: the latest `action-request_changes` event overall, then this app's bucket on it — `null` if that brief isn't in my bucket.** `sort: date desc, limit 1` takes the most recent such event even if the action has cycled (resubmit → review → request changes again); the projection then reads the calling app's bucket. One interaction this makes explicit: in a multi-app deployment a cycle can leave the _latest_ request-changes brief marked `internal` (team-only) while the action is back in another app's court — e.g. team requests changes **shared** → customer reworks → resubmits → team requests changes **internal**. The customer is in `changes-required` but the latest event has no customer bucket, so `changes_requested` is `null` and the callout is omitted (the status pill still conveys the state). This is deliberate: the alternative — "latest brief _visible to me_" — would resurface the earlier, already-addressed shared brief, presenting a stale fix-list as the current one, which is worse than showing nothing. The genuinely-odd part (a customer asked to rework with no visible reason) stems from marking a cross-app rework reason `internal` at write time; that's a Part 61 capture concern, not a read-side bug here.
- **App-scoping comes for free.** The read keys off the **calling** connection's `app_name` (`GetWorkflowAction.js:123`), so an `internal` team note resolves to `null` for the customer app and a `shared` one resolves for any app that sees the event. No callout-specific access logic — it inherits Part 61.

Templates read it from the state path they already read `message`/`status` from: `_state.action.changes_requested` (form) / `_state.current_action.changes_requested` (check).

### D2 — Render in the bare-alerts slot, below the closed banner and above the content card

The callout sits in the middle column's bare-alerts slot (Part 64's model) — below the `workflow_closed_banner` (a hard stop outranks a rework brief) and above the content card that holds the description render, so the "what to fix" brief still precedes the neutral description. It is **read-only**, middle-column width (a sentence or two of reviewer comment), and authored as its own component file `_ref`'d into the bare-alerts slot of each template (so it is authored once, not inline per template — one correct way, no 5-way drift across `view`/`edit`/`review`/`error`/`check`). Both kinds use it identically: form and check actions can both be in `changes-required`.

### D3 — Shown only when a comment is present

The callout renders only when `changes_requested` is non-null. Because the comment is mandatory in the UI (Background), in the normal flow it is always populated when the action is in `changes-required`; the presence check is a defensive guard for the rare comment-less path (legacy data, a non-UI transition). When absent, the callout is omitted entirely — the status pill already conveys the `changes-required` state, so an empty callout would be noise. This mirrors the description callout's "absent when unset" (DA2).

The request-changes comment is **text-only** — inline file attachments are blocked on its input (this part disables the Image extension and leaves S3 upload off; see Files changed). So a stored comment's html is always real text; the empty-document case (TipTap's `<p></p>` marker, with content living in `fileList`, which the callout does not read) cannot arise from the normal flow. As a defensive guard for legacy rows predating that block, the envelope normalizes empty/whitespace-only html to `null` (see Envelope read shape) — so the non-null gate never renders a present-but-blank callout.

### D4 — Native `Alert` (`type: warning`), consistent with the closed banner

The callout is a native Lowdefy `Alert` with `type: warning`, `showIcon: true`, a static `message` ("Changes requested"), and the comment html as `description` — the same block and shape as `workflow_closed_banner` (`check-action-surface.yaml:56`). Three reasons:

- **Consistency.** The bare-alerts slot already hosts `workflow_closed_banner` as a `type: warning` Alert; rendering this brief as the same block keeps the workspace's full-width banners visually uniform rather than introducing a bespoke palette.
- **Sanitization for free.** The Alert renders `message`/`description` via `renderHtml` → `HtmlComponent` → `DOMPurify.sanitize` (`@lowdefy/block-utils`). The comment is stored verbatim/unsanitized (Part 33), so this is what makes it safe to render — no `| safe` Html and no `DangerousHtml`.
- **No bespoke chrome.** `type`/`showIcon`/`message`/`description` cover the whole presentation; nothing to hand-style.

**Rejected — status-colored chrome from `actionsEnum`.** An earlier draft styled the callout from the `changes-required` enum colors (`color`/`borderColor`/`titleColor`) so it matched the status pill. Dropped: consistency with the existing `workflow_closed_banner` banner outweighs matching the pill, and the native Alert also hands us sanitization that a custom-styled `Html` block would not. `type: warning` already reads as "needs attention", which fits a rework brief.

### Rejected alternatives

- **Store the comment on the action doc.** Would duplicate data already on the event, contradict Part 33 (comment lives once, on the event), and — critically — **lose Part 61's app-scoping**: an action-doc field is not app-keyed, so an internal reviewer note would leak to every app that can view the action (exactly the failure mode the universal-fields `description` has). It would also need a write on every `request_changes` plus a clear-on-resubmit lifecycle. The "current change-request comment" is a projection of the event log, not action state.
- **A per-page events query** (the pattern an existing production app uses: a `get_changes_requested_event` aggregation wired into each page's `onMount`, gated on status, threading `app_name` through a `$switch` over app slices). Correct source, but it pushes per-template, per-app boilerplate onto every page and makes each page responsible for the app-scoping. The envelope resolves it once, server-side, with `app_name` in hand.
- **Role-gating the callout.** The same comment is already shown to every role of the app via the History timeline on the same page, so gating only the callout by role would be inconsistent and protect nothing. The meaningful boundary is the app, enforced by Part 61.

## Envelope read shape

```js
// GetWorkflowAction.js — after `stage` is computed (`:160`)
let changes_requested = null;
if (stage === "changes-required") {
  const [evt] = await findDocs({
    mongoDb,
    collection: connection.eventsCollection ?? "log-events",
    query: { type: "action-request_changes", action_ids: action._id },
    options: {
      sort: { date: -1 },
      limit: 1,
      projection: { [`${app_name}.description`]: 1 },
    },
  });
  const html = evt?.[app_name]?.description ?? null;
  // Defensive (D3): request-changes comments are text-only (inline files
  // disabled on the input — see Files changed), but legacy image-only rows
  // stored TipTap's empty-doc marker `<p></p>` with the content in `fileList`
  // (not read here). Treat empty/whitespace-only html as "no brief" so the
  // callout is omitted rather than rendered blank.
  changes_requested = html?.replace(/<[^>]*>/g, "").trim() ? html : null;
}
// …add `changes_requested` to the returned envelope allowlist (`:247-277`)
```

`findDocs` passes `options` straight to the driver's `find` (`mongo/findDocs.js`), so `sort`/`limit`/`projection` are supported. The app bucket is **top-level** on the stored event (`new-event.yaml` spreads `display` onto the root), so the projection and read are `{app_name}.description`, not `display.{app_name}.description`.

## Indexes

This is the first reader to match the events collection (`log-events`, the collection backing the WorkflowAPI `eventsCollection`) by `action_ids` — the existing timeline reads match by `reference_field`/`reference_value`. Per the module's index pattern (`docs/workflows/reference/indexes.md`: the module creates no indexes; host apps add them), the read expects:

### Index: `{ action_ids: 1 }` on the events collection (`log-events`)

| Query site                      | Operation                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GetWorkflowAction` (this part) | `find({ type: "action-request_changes", action_ids }, { sort: { date: -1 }, limit: 1 })` on each `changes-required` action-page load |

`action_ids` is highly selective — a single action has only a handful of events — so the leading-field match narrows to a tiny set and the residual `type` filter + `date` sort + `limit 1` run in-memory over a few docs (the same reasoning the `{ workflow_id: 1 }` entry uses for the `actions` collection). A plain `{ action_ids: 1 }` therefore suffices; the timeline's action enrichment likely needs it already, but if absent it must be added. Without **any** index on `action_ids`, this query is a collection scan on a perpetually-growing log on every changes-required page load — the failure mode this entry exists to prevent.

## Files changed

- **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`** — add the gated events read above and the `changes_requested` field on the returned envelope. Rides alongside Part 56's other envelope additions (`workflow_id`); null-safe and skipped outside `changes-required`, so unconfigured/other-stage actions are unaffected.
- **New `changes-requested` callout fragment (component file)** — a native `Alert` block (`type: warning`, `showIcon: true`), the same shape as `workflow_closed_banner`. `message` is the static label "Changes requested"; `description` is bound to `changes_requested` (the kind-appropriate state path), which the Alert renders via `renderHtml` → `HtmlComponent` → `DOMPurify.sanitize`, so the verbatim-stored comment HTML is sanitized at render (no `| safe`, no `DangerousHtml`). `visible` only when `changes_requested` is non-null. Authored once and `_ref`'d individually by each template (`view`/`edit`/`review`/`error`/`check`) into Part 64's bare-alerts slot.
- **Templates (`view`/`edit`/`review`/`error`/`action`)** — `_ref` the new Alert fragment into each template's bare-alerts slot, below the `workflow_closed_banner` and above the content card that holds the `action-description.yaml` render (the same per-template `_ref` pattern the other slot fragments use; `action-workspace.yaml` stays layout-only).
- **Request-changes comment inputs — block inline files** (`templates/{review,view,action}.yaml.njk` and `components/check-action-surface.yaml`). On each `change_request_comment` / `current_action.change_request_comment` `TiptapInput`, set `properties.image.disabled: true` and keep `s3PostPolicyRequestId` unset (the meta's "leave unset to disable image uploads"), so the comment is text-only — no `fileList`, no inline `<img>`. This is what guarantees the callout never has to render an attachment (the decision behind D3 / D-proposal-5). Simplify each input's `validate` to drop the now-dead `fileList` clause, leaving `comment.text` non-empty as the sole gate.
- **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`** — declare `eventsCollection` (string, default `"log-events"`, with a description) alongside the existing `workflowsCollection`/`actionsCollection`/`contactsCollection`. `GetEventsTimeline.js:38` already reads `connection.eventsCollection ?? "log-events"` without it being schema'd; this read is the second consumer, so close the latent gap — "declare what you read". Mirror the shape of `EventsTimeline/schema.js:19`, which already declares it on that connection.
- **`docs/workflows/reference/indexes.md`** — add an events-collection (`log-events`) section documenting the `{ action_ids: 1 }` index this read expects (see Indexes), alongside the existing `actions` / `workflows` entries.
- **Tests** — `GetWorkflowAction.test.js`: in `changes-required`, the envelope resolves `changes_requested` from the latest `action-request_changes` event's `{app_name}.description`; `null` when the latest such event has no description in the calling app's bucket (Part 61 `internal` note from another app); `null` in every other stage (read skipped); newest event wins when the action has cycled.

## Verification

- Action in `changes-required` with a reviewer comment → the callout renders in the bare-alerts slot (below `workflow_closed_banner`, above the content card), as a `type: warning` Alert matching the closed banner, read-only, on both form and check pages.
- Request-changes comment input rejects file attachments (Image extension disabled, no `s3PostPolicyRequestId`) → `fileList` is always empty and the stored comment html is text-only; the callout renders the sanitized comment via the Alert's `renderHtml` path.
- Outside `changes-required` → no callout, and no events read fires (gated on stage).
- `changes-required` but no comment on the latest request-changes event → callout omitted; status pill still shows the state.
- **App-scoping (Part 61):** an `internal` reviewer note does not appear in another app's callout (`changes_requested` is `null` there); a `shared` one appears for any app that sees the event.
- Cycled action (changes requested twice) → the callout shows the most recent comment.
- E2E: covered alongside the Part 56 workspace specs once a fixture drives an action into `changes-required` with a comment.

## Non-goals

- **Changing how the comment is stored** — the comment still lives once on the event, written verbatim by the existing fold; this part adds only a read. (It does make one small _input_-side change — disabling inline files on the request-changes comment input, see Files changed — but the stored shape is unchanged.)
- **The shared/internal visibility model** — owned by Part 61; this part inherits it.
- **A callout for non-`request_changes` comments** (e.g. an optional approve comment) — approval sends the action to `done`, where there is no rework brief to surface; those comments stay timeline-only.
- **Surfacing the comment author/timestamp in the callout** — that detail lives in the History timeline; the callout is the brief, not the audit record.

## Depends on / relates to

- **Part 56 — three-tier action pages (+ layout addendum)** — provides the action workspace middle column and the description render this one sits above; the envelope read rides alongside Part 56's other `GetWorkflowAction` additions.
- **[Part 64 — action `description` rework](../64-action-description/design.md)** (lands first) — deletes `universal-fields-callout.yaml` and introduces `components/action-description.yaml` (the plain description render). This part's callout sits above that render in the same middle-slot space the old description used, and its `changes_requested` envelope read sits beside Part 64's `description`-source change in `GetWorkflowAction.js`. No ordering hazard: Part 64 is self-contained; this part just targets the post-64 fragment.
- **Part 61 — multi-app comment visibility** (prerequisite) — defines where the comment is readable per app; this callout reads `event.{calling app_name}.description` and inherits that scoping. Without Part 61 the callout would still work, but an internal/shared distinction would not exist.
- **Part 33 — comment rendering** (shipped) — establishes the comment's home (`event.{app_name}.description`), its verbatim storage, and its mandatory-on-`request_changes` UI gate.
