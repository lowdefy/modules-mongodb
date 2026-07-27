# Review 3 — the D6 `GetEventsTimeline` port and the `createEngineContext` ripple

Reviews 1 and 2 predate the uncommitted edit that pulled the timeline port **into** this part as a fifth, cross-stream method (`GetEventsTimeline`, D6) and that rewired the user source through `createEngineContext`. Those two surfaces are the least-reviewed in the design, so this pass concentrates there. The workflow-scoped methods, the user/`schema.js`/`meta` plumbing, `allow_not_required`, and the FSM-inversion hazard are all settled by reviews 1–2 and not revisited.

Verified accurate first: the events module declares **no** dependencies (`modules/events/module.lowdefy.yaml` has no `dependencies:` block), so the events→workflows cycle D6 describes is real and the ownership-inversion fix is sound. `timeline_action_lookup.yaml` does compose `visible_verbs.yaml` + `resolve_action_link.yaml` via `_ref` and carries the latest-event-per-action dedup (`$setWindowFields` partitioned by `actions._id`, then `$group`), exactly as D6 says. `createEngineContext.js:41–51` destructures top-level `user` from `lowdefyContext` (not `connection.user`), matching the design's claim about the latent submit-gate bug.

The three findings below are gaps the port opens that the design doesn't yet close.

## Gaps — under-specified mechanics

### 1. `GetEventsTimeline` reads the events collection + events display config the `WorkflowAPI` connection does not have — the `schema.js` additions list is incomplete

> **Resolved.** Mechanism pinned to a **single direct events aggregation** (not `callApi`): events (`log-events`) and actions share the `MONGODB_URI` database, so today's `$match` events → `$lookup` actions stays one round trip — the `callApi` route was rejected for splitting a heavy read into two. Connection inputs enumerated in "The read methods": `eventsCollection` is the **third** new top-level `schema.js` property (default `"log-events"`), added to "Validated config additions" (corrected from two props to three); `app_name` (already on the connection) serves as the event-card display key — the events module's `display_key` is the same app slug, which `timeline_action_lookup` already conflates — so no new display prop; `reference_field`/`reference_value` move to payload; `event_types` stays client-side on the `EventsTimeline` block (not a method input).

D6 and "The read methods" (line 142) say `GetEventsTimeline` "reads events (referenced to the target), `$lookup`s actions, and runs the ported dedup/attachment rules." But the today's lookup runs inside the **events module's** `get-events` on the `events-collection` (`modules/events/components/events-timeline.yaml:14–17`), and the `WorkflowAPI` connection has no handle to any of the events-side inputs:

- **No events collection name.** The `WorkflowAPI` schema declares `workflowsCollection` and `actionsCollection` but **no `eventsCollection`** (confirmed against `schema.js`: top-level props are `databaseUri, entry_id, endpoints, read, write, databaseName, workflowsCollection, actionsCollection, changeLog, workflowsConfig, changeStamp, app_name, actionsEnum`). A method that queries events needs either a new `eventsCollection` connection property _or_ an events endpoint id under `endpoints` to call via `callApi` — and either is a new closed-schema (`schema.js:4`, `additionalProperties: false`) declaration.
- **No reference parameterization.** `get-events` is parameterized per consumer by `reference_field`/`reference_value` (`contact_ids`, `company_ids`, `activity_ids` — see consumers below), supplied as `_ref` vars at build time. As a connection method, `GetEventsTimeline` must take these as payload; the design's "referenced to the target" doesn't pin where the reference field comes from.
- **No event-display projection.** `get-events` also does the event-card projection — `title`/`description`/`info` keyed off `display_key`/`event_types` (`events-timeline.yaml:51–75`), and the `reference_value` self-filter (`:41–48`). If `GetEventsTimeline` replaces `get-events` end-to-end it must reproduce all of this, which needs the events module's `display_key` + `event_types` config on the connection — config the workflows connection doesn't currently carry. The design only enumerates the action-card projection (`{_id, kind, status, link, message, …sort}`).

The design's `schema.js` work (review-2 #2, "Validated config additions" line 164) lists exactly **two** new top-level properties — `user` and `entities`. `GetEventsTimeline` needs at least one more (the events collection name or endpoint id), and the event-display path needs more config still. Pin which mechanism the method uses (direct collection query vs. `callApi` into a slimmed `get-events`) and enumerate the connection inputs it requires — otherwise the implementer rediscovers a non-trivial new config surface mid-build. This is the largest unpriced piece of the XL estimate.

### 2. Four shipped consumers of `events-timeline` lose action enrichment — "no consumers to migrate" is imprecise

> **Resolved.** D6's parenthetical tightened: "no consumers to migrate" → a deliberate breaking change that names the four shipped `_ref` consumers losing action cards, notes it's a no-op on current data (no workflow events reference those entities' actions), and records the deferred `consumer → workflows` coupling if any re-adopts via `GetEventsTimeline`. The breaking change itself is intentional and accepted — these entities have no workflow actions today, and any future need is served by the new method, not the deleted inline lookup.

D6 (line 76) justifies deleting the inline lookup with _"workflows has not shipped, so there are no consumers to migrate,"_ and "What gets deleted" (line 176) says the generic events timeline "returns to events-only." But the `events-timeline` **component** has four shipped consumers that `_ref` it today and currently run the action lookup unconditionally:

- `modules/contacts/components/tile_events.yaml:9`
- `modules/companies/components/tile_events.yaml:9`
- `modules/activities/pages/view.yaml:323`
- `apps/demo/pages/leads/lead-view.yaml:111`

"No workflow consumers" is true; "no consumers to migrate" is not — these four are consumers of the action-enriched timeline. After the deletion their timelines silently lose action cards. Practically this is likely a no-op on current _data_ (no workflow events reference actions for these entities yet, since workflows hasn't shipped), but two things the design should state explicitly:

a. The component's output shape changes for these four — name them in Ripples so the change isn't invisible.

b. The day any of contacts/companies/activities wants action cards back, it must adopt the workflows-provided timeline — making **contacts/companies/activities → workflows** a new module dependency. D6's cycle analysis reasons only about `events ⇄ workflows`; it doesn't address that the timeline's real consumers are these sibling modules. That's the actual coupling the inversion creates, and it deserves a sentence (even just "deferred; these modules adopt `GetEventsTimeline` if/when they need action cards").

### 3. Changing `createEngineContext` to read `connection.user` strands the existing handler unit tests

> **Resolved.** Added to the submit-gate ripple's files-changed: every handler test's `buildContext` helper (shared across `SubmitWorkflowAction`, `StartWorkflow`, `CancelWorkflow`, `CloseWorkflow`, `SubmitWorkflowAction/dispatchNotifications`) is updated to nest `user` under `connection`, mirroring the real `user: { _user: true }` property — otherwise `context.user` goes `undefined` and the role-array-gated cases fail.

The submit-gate fix (line 144, Ripple line 183) changes `createEngineContext` to read **`connection.user`** instead of the top-level `user` it destructures today (`createEngineContext.js:45`). The files-changed for this ripple lists `createEngineContext.js`, `schema.js`, `workflow-api.yaml` — but **not the tests**, and the change breaks them:

`SubmitWorkflowAction.test.js`'s `buildContext` helper (lines 169–203) returns the `lowdefyContext` with `user` as a **top-level sibling of `connection`**, not under it:

```js
return {
  request, blockId, connectionId, pageId, requestId,
  connection: { …, app_name, workflowsConfig, … },   // no user here
  user,                                                // ← top-level
  callApi,
};
```

This is exactly why the tests pass today (`createEngineContext` reads top-level `user`). Once `createEngineContext` reads `connection.user`, `context.user` becomes `undefined` for every test, `userRoles` collapses to `[]` (`loadWorkflowState.js:171`), and every role-array-gated case fails — including the explicit role tests at `SubmitWorkflowAction.test.js:345` ("No Edit" user) and `:364`/`:396`. The same `buildContext` pattern is used across the other handler test files (`StartWorkflow`, `CancelWorkflow`, `CloseWorkflow`, `SubmitWorkflowAction/dispatchNotifications`).

**Fix.** Add to this part's files-changed: update each handler test's `buildContext` to nest `user` under `connection` (mirroring the real `user: { _user: true }` connection property the design adds). It's mechanical, but it's real work the ripple currently omits, and skipping it turns the submit-gate fix into a red test suite.

## Verified accurate (no action)

- Events module declares no dependencies (`module.lowdefy.yaml`) → the events→workflows cycle and the ownership-inversion fix (D6) are correct.
- `timeline_action_lookup.yaml` composes `visible_verbs.yaml` + `resolve_action_link.yaml` via `_ref` and is the fourth/last consumer of those stages — deleting all three here reaches zero stragglers as D2/D6 claim.
- `computeEngineLinks.js` returns the uncollapsed per-slug verb map and `{}` for custom kinds — consistent with the D6 pass-through branch for `workflow_id: null` (non-workflow) cards needing no link logic.
- The latest-event-per-action dedup is a `$setWindowFields`/`$group` aggregation; "ported verbatim" is honest given line 133's "JS-built aggregations or JS post-processing — implementer's choice."
