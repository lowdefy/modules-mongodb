# Part 62 — Changes-requested comment callout

When a reviewer requests changes on an action, the person who picks it up to rework has to hunt through the History timeline to find _what_ was asked for. This part surfaces that reviewer comment as a read-only callout at the **top of the middle column** of the action workspace, shown only while the action is in the `changes-required` stage — so the "what to fix" brief is the first thing the reworker sees.

## Proposed change

1. **A changes-requested callout at the top of the middle column**, above the Part 56 description callout, rendered only when the action is in `changes-required` and a comment exists.
2. **The comment is read from the event, resolved in the `GetWorkflowAction` envelope** — a single gated server-side read that exposes one new field, `changes_requested`. No per-page query, nothing stored on the action doc.
3. **App-scoping is inherited from Part 61 for free** — the envelope reads the comment from the calling app's bucket, so an `internal` reviewer note never reaches another app's callout and a `shared` one does.
4. **Styled to the status, not a generic warning** — the callout takes its colors from the `changes-required` entry in `actionsEnum`, the same source the status pill uses.

## Background

- `request_changes` is an FSM signal whose target stage is `changes-required` (`fsm/tables.js:39,71`). The action's current stage is `action.status[0].stage`.
- The reviewer's comment is folded **verbatim** into the transition's event at `event.{app_name}.description` (Part 33 `foldCommentIntoEvent`); the event is `type: "action-request_changes"` and carries `action_ids` (references are spread to the event's top level by `modules/events/api/new-event.yaml`) and a sortable `date`. The comment is **never** written to the action doc and **never** to `metadata` (Part 33 D2).
- **The comment is mandatory in the UI.** Part 33 D5 made the `request_changes` comment `required` on both surfaces (the form review `change_request_comment` and the check-surface Request Changes modal). So an action reaching `changes-required` through the normal flow always has a comment.
- Part 61 governs _who_ can read that comment: a `shared` comment is written into every app bucket on the event; an `internal` one stays in the writing app's bucket. Reads are unchanged — every consumer reads `event.{app_name}.description`.
- `GetWorkflowAction` (the `get_workflow_action` request, `GetWorkflowAction.js`) is the single envelope every action template reads (`_state.action.*` on form pages, `_state.current_action.*` on the check page). It already runs server-side with `connection.app_name` + `mongoDb` and already does gated projected `findDocs` reads (the action, the workflow, contacts). It returns an explicit allowlisted envelope (`GetWorkflowAction.js:247-277`).
- Part 56 (+ its layout addendum) is where this renders: a conditional **description callout** already sits at the top of the middle column (addendum DA2). It is a small reusable fragment (`universal-fields-callout.yaml`) `_ref`'d individually by each template; `action-workspace.yaml` is layout-only and renders whatever `middle` array the template passes, so there is no single shared composition file.

## Key decisions

### D1 — Read the comment from the event, in the `GetWorkflowAction` envelope

The comment lives on the event (Part 33), so the callout reads the event. It does so **in the envelope** rather than via a per-page query, because the envelope is already the single normalized source the templates read and already runs where the answer is cheap and correct:

- When `status[0].stage === "changes-required"`, `GetWorkflowAction` does one gated read of `connection.eventsCollection ?? "log-events"`: match `{ type: "action-request_changes", action_ids: action._id }`, `sort: { date: -1 }`, `limit: 1`, project `{ "{app_name}.description": 1 }`. It exposes `changes_requested` (the HTML string, or `null`) on the envelope. In every other stage the read is skipped and `changes_requested` is `null`.
- The action is guaranteed to be in `changes-required` when the callout shows, so "the latest `action-request_changes` event for this action" is unambiguous even if the action has cycled (resubmit → review → request changes again) — `sort: date desc, limit 1` takes the most recent.
- **App-scoping comes for free.** The read keys off the **calling** connection's `app_name` (`GetWorkflowAction.js:123`), so an `internal` team note resolves to `null` for the customer app and a `shared` one resolves for any app that sees the event. No callout-specific access logic — it inherits Part 61.

Templates read it from the state path they already read `message`/`status` from: `_state.action.changes_requested` (form) / `_state.current_action.changes_requested` (check).

### D2 — Render at the top of the middle column, above the description callout

The callout sits at the very top of the middle column, above the Part 56 description callout — the "what to fix" brief outranks the neutral description. It is **read-only**, middle-column width (a sentence or two of reviewer comment), and authored as a **sibling fragment** to the description callout — its own component file, `_ref`'d at the top of each template's middle slot ahead of the description callout (so it is authored once, not inline per template — one correct way, no 5-way drift across `view`/`edit`/`review`/`error`/`check`). Both kinds use it identically: form and check actions can both be in `changes-required`.

### D3 — Shown only when a comment is present

The callout renders only when `changes_requested` is non-null. Because the comment is mandatory in the UI (Background), in the normal flow it is always populated when the action is in `changes-required`; the presence check is a defensive guard for the rare comment-less path (legacy data, a non-UI transition). When absent, the callout is omitted entirely — the status pill already conveys the `changes-required` state, so an empty callout would be noise. This mirrors the description callout's "absent when unset" (DA2).

### D4 — Styled to the `changes-required` status, not a generic warning

The callout draws its colors from the `changes-required` entry in `actionsEnum` (`title`/`color`/`borderColor`/`titleColor` — the display fields every status carries, `WorkflowAPI/schema.js:116-132`), the same source the status pill maps through. This binds the callout visually to the status (a consistent "changes required" treatment) rather than introducing a separate generic warning palette.

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
  changes_requested = evt?.[app_name]?.description ?? null;
}
// …add `changes_requested` to the returned envelope allowlist (`:247-277`)
```

`findDocs` passes `options` straight to the driver's `find` (`mongo/findDocs.js`), so `sort`/`limit`/`projection` are supported. The app bucket is **top-level** on the stored event (`new-event.yaml` spreads `display` onto the root), so the projection and read are `{app_name}.description`, not `display.{app_name}.description`.

## Files changed

- **`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`** — add the gated events read above and the `changes_requested` field on the returned envelope. Rides alongside Part 56's other envelope additions (`workflow_id`); null-safe and skipped outside `changes-required`, so unconfigured/other-stage actions are unaffected.
- **New `changes-requested` callout fragment (component file)** — a sibling to `universal-fields-callout.yaml`. Reads `changes_requested` from the kind-appropriate state path; colors from the `changes-required` `actionsEnum` entry; rendered only when non-null. Authored once and `_ref`'d individually by each template (`view`/`edit`/`review`/`error`/`check`), placed at the top of the middle slot above the description callout. Renders through the `Html` block (mirrors the description callout), which sanitizes its `html` prop via DOMPurify automatically (`HtmlComponent`) — the comment is stored verbatim/unsanitized, so this is what makes it safe to render; **not** the `DangerousHtml` block.
- **Templates (`view`/`edit`/`review`/`error`/`action`)** — `_ref` the new fragment into each template's middle slot ahead of the description callout (the same per-template `_ref` pattern `universal-fields-callout.yaml` already uses; `action-workspace.yaml` stays layout-only).
- **Tests** — `GetWorkflowAction.test.js`: in `changes-required`, the envelope resolves `changes_requested` from the latest `action-request_changes` event's `{app_name}.description`; `null` when the latest such event has no description in the calling app's bucket (Part 61 `internal` note from another app); `null` in every other stage (read skipped); newest event wins when the action has cycled.

## Verification

- Action in `changes-required` with a reviewer comment → the callout renders at the top of the middle column, above the description callout, styled with the `changes-required` status colors, read-only, on both form and check pages.
- Outside `changes-required` → no callout, and no events read fires (gated on stage).
- `changes-required` but no comment on the latest request-changes event → callout omitted; status pill still shows the state.
- **App-scoping (Part 61):** an `internal` reviewer note does not appear in another app's callout (`changes_requested` is `null` there); a `shared` one appears for any app that sees the event.
- Cycled action (changes requested twice) → the callout shows the most recent comment.
- E2E: covered alongside the Part 56 workspace specs once a fixture drives an action into `changes-required` with a comment.

## Non-goals

- **Changing how the comment is captured or stored** — Part 33 owns the write; this part only reads.
- **The shared/internal visibility model** — owned by Part 61; this part inherits it.
- **A callout for non-`request_changes` comments** (e.g. an optional approve comment) — approval sends the action to `done`, where there is no rework brief to surface; those comments stay timeline-only.
- **Surfacing the comment author/timestamp in the callout** — that detail lives in the History timeline; the callout is the brief, not the audit record.

## Depends on / relates to

- **Part 56 — three-tier action pages (+ layout addendum)** — provides the action workspace middle column and the description callout this one sits above; the envelope read rides alongside Part 56's other `GetWorkflowAction` additions.
- **Part 61 — multi-app comment visibility** (prerequisite) — defines where the comment is readable per app; this callout reads `event.{calling app_name}.description` and inherits that scoping. Without Part 61 the callout would still work, but an internal/shared distinction would not exist.
- **Part 33 — comment rendering** (shipped) — establishes the comment's home (`event.{app_name}.description`), its verbatim storage, and its mandatory-on-`request_changes` UI gate.
