# Task 1: Expose `changes_requested` on the GetWorkflowAction envelope

## Context

`GetWorkflowAction` (`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js`) is the single server-side read every action template renders from. It already runs with `connection.app_name` + `mongoDb`, does gated projected `findDocs` reads (the action doc, the workflow doc, contacts), and returns an explicit allowlisted envelope (the `return { ... }` near the end of the file). Part 64 already added a `description` field to this envelope, so this task rides alongside that work in the same handler.

Part 62 surfaces the reviewer's `request_changes` comment as a callout shown only while the action is in the `changes-required` stage. The comment lives **on the event** (Part 33 folds it verbatim into `event.{app_name}.description`), never on the action doc. This task adds a single gated read of the events collection to resolve that comment into a new envelope field, `changes_requested`.

Key facts that shape the read:

- The current stage is already computed in the handler as `const stage = action.status?.[0]?.stage ?? null;` (look for the "Step 5: Button resolution" comment). The calling app name is already `const app_name = connection.app_name;`.
- The request-changes event has `type: "action-request_changes"` and carries `action_ids` (references spread to the event's top level by `modules/events/api/new-event.yaml`) and a sortable `date`.
- The app bucket is **top-level** on the stored event (`new-event.yaml` spreads `display` onto the root), so the projection/read path is `{app_name}.description`, **not** `display.{app_name}.description`.
- `findDocs` (`plugins/modules-mongodb-plugins/src/connections/mongo/findDocs.js`) passes `options` straight to the driver's `find`, so `sort`/`limit`/`projection` are supported (the existing handler calls don't pass options, but `GetEventsTimeline` does).
- App-scoping is inherited from Part 61 for free: the read keys off the **calling** connection's `app_name`, so an `internal` note from another app resolves to `null`.

**Read contract:** the latest `action-request_changes` event overall (`sort: { date: -1 }`, `limit: 1`), then this app's bucket on it — `null` if that brief isn't in the calling app's bucket. This is deliberate: taking the latest event (even when the action has cycled) and reading the calling app's bucket avoids resurfacing a stale, already-addressed brief.

The schema for the `WorkflowAPI` connection (`plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`) currently declares `workflowsCollection` / `actionsCollection` / `contactsCollection` but **not** `eventsCollection`, even though `GetEventsTimeline.js` already reads `connection.eventsCollection ?? "log-events"`. This task closes that latent gap ("declare what you read") since this read is the second consumer.

## Task

### 1. Add the gated events read in `GetWorkflowAction.js`

After `stage` is computed (and before the final envelope `return`), add:

```js
// ── Changes-requested brief (Part 62) — read the latest request_changes
//    comment from the event log, gated on stage. The comment lives on the
//    event (Part 33), app-keyed (Part 61); never on the action doc.
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
  // disabled on the input — see Task 4), but legacy image-only rows stored
  // TipTap's empty-doc marker `<p></p>` with the content in `fileList` (not
  // read here). Treat empty/whitespace-only html as "no brief" so the callout
  // is omitted rather than rendered blank.
  changes_requested = html?.replace(/<[^>]*>/g, "").trim() ? html : null;
}
```

`findDocs` is already imported at the top of the file. In every stage other than `changes-required` the read is skipped and `changes_requested` stays `null`.

### 2. Add `changes_requested` to the returned envelope allowlist

Add `changes_requested` as a key on the `return { ... }` object (alongside `description`, `message`, `workflow_closed`, etc.). The envelope is an explicit allowlist — the field must be added by name or it won't ship.

### 3. Declare `eventsCollection` in `WorkflowAPI/schema.js`

Add an `eventsCollection` property alongside `workflowsCollection` / `actionsCollection` / `contactsCollection`, mirroring the shape already declared on `EventsTimeline/schema.js`:

```js
eventsCollection: {
  type: "string",
  default: "log-events",
  description:
    'Events collection name read by GetWorkflowAction (Part 62, to resolve ' +
    'the latest request_changes comment for the changes-requested callout) ' +
    'and by GetEventsTimeline. Defaults to "log-events" (the events ' +
    "module's collection). Host apps need only set this when overriding the " +
    "collection name.",
},
```

### 4. Tests (`GetWorkflowAction.test.js`)

Add cases (mirroring the existing `findDocs` mocking style in that file):

- In `changes-required`, the envelope resolves `changes_requested` from the latest `action-request_changes` event's `{app_name}.description`.
- `null` when the latest such event has no description in the calling app's bucket (Part 61 `internal` note from another app — the bucket key is absent).
- `null` in every other stage (the read is skipped — assert no events `find` fires, or that the field is null without a matching event).
- Newest event wins when the action has cycled (multiple `action-request_changes` events; `sort: date desc, limit 1` selects the most recent).
- (Defensive) whitespace/empty-markup html (`<p></p>`) normalizes to `null`.

## Acceptance Criteria

- `GetWorkflowAction` returns `changes_requested` (HTML string or `null`) on its envelope.
- The events read only fires when `stage === "changes-required"`; otherwise `changes_requested` is `null` and no events query is issued.
- The read matches `{ type: "action-request_changes", action_ids: action._id }`, sorts `date` desc, limits 1, and projects `{app_name}.description` (top-level, not under `display`).
- Empty/whitespace-only html normalizes to `null`.
- `eventsCollection` is declared on `WorkflowAPI/schema.js` with `default: "log-events"`.
- `pnpm test GetWorkflowAction` passes (run `jest` from the repo root).

## Files

- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.js` — modify — add the gated events read and the `changes_requested` envelope key.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js` — modify — declare `eventsCollection`.
- `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/GetWorkflowAction/GetWorkflowAction.test.js` — modify — add the cases above.

## Notes

- This is null-safe and skipped outside `changes-required`, so unconfigured / other-stage actions are unaffected.
- Do **not** write anything to the action doc — `changes_requested` is purely a projection of the event log (Rejected alternatives in the design).
- The read expects a `{ action_ids: 1 }` index on the events collection — documented in Task 5, not created by the module.
