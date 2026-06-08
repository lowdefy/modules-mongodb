  
  
  > **Resolved.** D8 now specifies `GetAction` gates on `action_allowed.view`, returning `null` (not a thrown error, matching the overview methods) when the user has no view access. Closes the one unguarded read path. Updated D8 and "The read methods" step 4.

  A. Read authorization on GetAction (genuine, has teeth). Today get_action is a raw $match — no read auth; anyone with an action_id can fetch the doc. Routing through GetAction is
  the moment to decide: does it gate on the view verb (return access_denied/null when the user has no view access), or stay open and let the client render-nothing? The three
  overview methods already filter by visible_verbs server-side, so a deep-link to an action you can't see is the one unguarded path. I'd lean toward GetAction enforcing view — but
  it's a behavior change worth a decision.

  > **Resolved.** Standardized on a fresh name, `allowed`, as the response-contract field across all four methods (chosen over reusing `visible_verbs`/`action_allowed`: `allowed` is the strongest intuition and avoids the `access` collision with the raw doc gate). All target/contract references in design.md renamed; kept `visible_verbs.yaml` filenames (timeline path, D6) and current-state `_state.action_allowed.*` migration references intact.

  B. One name for the per-verb access bag. The overview methods return visible_verbs; GetAction returns action_allowed — same {view,edit,review,error} shape, two names. Since D2
  consolidates the resolution into one JS implementation, the response contract should use one name across all four methods. Cheap consistency win; pick one.

  > **Resolved (reshaped).** Pinned `GetAction` to a **curated allowlist**, not a raw `{ ...actionDoc, … }` spread (the user's concern: a whole-doc spread freezes every engine-internal field into the client contract and ships raw `access`/`links` — the recompute inputs this part deletes). Contract = engine envelope (`_id, type, kind, key, status, action_group, description, due_date, assignees, entity_id, entity_collection, created, updated`, + config-display `title`/`required_after_close`) ∪ form-field values (allowlisted via validated config) ∪ resolved `allowed`, `buttons`. Verified detail surfaces read none of `access`/`workflow_type`/`metadata`/`[slug].links`/`tracker`/`child_*`. Verified detail-page nav is build-time `_module.pageId` (not data-driven), so **no resolved `link` needed** on `GetAction`. Recorded the rule "never ship a raw resolution input when its resolved output is on the response." Allowlist also dissolves the collision concern. Updated D8, read-methods step 4, method table.

  C. Pin the GetAction response shape. We just made Part 40 depend on spreading the response into current_action — so 46 should state the contract explicitly: { ...actionDoc,
  action_allowed, buttons }, and confirm no collision (the doc carries access/links, which are distinct from the resolved action_allowed/buttons). Right now 46 says "doc +
  action_allowed + buttons" loosely; worth nailing down given the spread.

  > **Resolved.** Schema was already pinned (keyed by `entity_collection` → `{ page_id, id_query_key, title }`; resolved `entity_link = { pageId, urlQuery, title }`, `urlQuery = { [id_query_key]: entity_id }`). The real gap — migration — is now explicit: **no host-app migration.** `entities` stays the existing `required` module var, unchanged shape; the connection reads it server-side via `entities: { _module.var: entities }` (mirroring `app_name`), declared as a new top-level property in `schema.js`; overview pages drop their `_module.var: entities` reads; the `makeWorkflowsConfig` entity_collection-coverage validator is retained. Updated the read-methods entity_link bullet + the current-state and deletion references.

  D. The entities map is under-specified. 46 moves the client-side _module.var: entities onto the connection to resolve workflow.entity_link server-side, but doesn't give the schema
  (keyed by entity_collection → { pageId, idQueryKey, title }?) or the host-app migration. New config surface — worth defining.

  > **Verified.** Traced the framework source: `createApiContext.js:22` (`context.user = session.user`) → `createEvaluateOperators.js:20–28` (passes `user` to `ServerParser`) → `callRequest.js:52` (`evaluateOperators` runs **unconditionally**, before/independent of the read/write capability checks) → `callRequestResolver.js:60–70` (resolver gets `connection: connectionProperties`, no top-level `user`). The `_user` → `connection.user` resolution is identical for read and write resolvers. Design updated with the source-confirmed citations (and fixed the stale `createApiContext.js:19` → `:22`).

  Plus one verify-item, not a decision: per-request user resolution for read methods — 46 asserts user: { _user: true } resolves per-request "exactly as changeLog.meta.user does,"
  but that precedent is on the write path; worth confirming Lowdefy resolves connection-property operators for read-method invocations the same way before relying on it.

  > **Resolved.** Method table now specifies `GetEntityWorkflows` per-action shape `{_id, kind, type, status, allowed, message, link}` (with the rationale: entity page hosts the check modal). Open question answered (verified against Part 40 Surfaces table): `GetWorkflowOverview`/`GetActionGroupOverview` **deliberately omit** `_id`/`kind` (full pages, navigate via `action.link`, no modal); the event-timeline modal host gets them from the Part 42 `timeline_action_lookup` path, not these methods — added a note after the table. Part 40 paired wiring (onActionClick kind-branch + linkless-row suppression) recorded as cross-part contract in the Part 40 Ripples bullet.

E. GetEntityWorkflows must project _id and kind per action (from Part 40 #1, DECIDED). The current get-entity-workflows projection ($group.$push in
  get-entity-workflows.yaml) pushes each action as { type, status, visible_verbs, message, link } only — no _id, no kind. Both are on the doc (planActionTransition.js:144,147)
  but dropped by the projection. GetEntityWorkflows (which replaces this aggregation) must add both:
    - kind — so actions-on-entity's onActionClick can branch: kind === 'check' opens the in-context modal (allowlist; every other kind navigates via action.link). DECIDED.
    - _id — so the modal can call GetAction(_event.action._id). Today navigation works only because resolve_action_link bakes the id into link.urlQuery; the modal needs a
      top-level _id.
  Paired Part 40 changes (recorded here for the cross-part contract; owned by Part 40):
    - actions-on-entity onActionClick branches on action.kind (check → modal, else Link to action.link).
    - ActionSteps suppresses the click for linkless rows (keeps the existing disabled-row behavior: linkDisabled = !action?.link), so onActionClick only ever fires for
      actionable rows — the handler never has to no-op a missing link. DECIDED.
  Open: does GetWorkflowOverview / GetActionGroupOverview also need _id/kind per action? Their surfaces render nav links (no modal), so probably not — confirm when those
  methods' projections are pinned (ties to item C).

> **Resolved (reshaped D6).** The events-timeline YAML request isn't a config-embed reader (it already resolves access server-side via the shared stages) — its only tie to this part is the YAML-stage duplication. Established the constraint: the events module is foundational (no deps); its timeline action lookup rides shared YAML to avoid an events⇄workflows cycle (workflows already → events), so the policy can't simply move into the plugin. **Committed direction (replaces D6's "accepted debt"):** a follow-up relocates the action-enriched timeline into an **opt-in workflows-owned method/component** ("events timeline with action cards") — workflows queries events + enriches in the ported JS; apps opt in instead of the plain events timeline. Reaches zero YAML stragglers (all three stages deleted) with no cycle. Breaking change to the generic events timeline is fine — workflows hasn't shipped. Rewrote D6, updated the Part 42 Ripples bullet, and fixed the item-E note (timeline supplies `_id` today; `kind` added by the port).

F. What about events timeline yaml request? 

G. Non-workflow actions (tasks sharing the `actions` collection).

> **Resolved (part 1 — detail read).** The `actions` collection is shared with the future tasks module (`kind: task`, `workflow_id: null`, doc-level access, no FSM). Two changes: (1) `GetWorkflowAction` early-returns `null` for `workflow_id: null` docs before any verb/FSM resolution — honors the tasks-module boundary ("engine ignores `workflow_id: null`") and avoids the `kind: task` → `FSM_TABLES[kind]` undefined hazard; overview methods need no guard (they `$lookup` by `workflow_id`). (2) Renamed `GetAction`→`GetWorkflowAction` and `GetActionGroupOverview`→`GetWorkflowActionGroupOverview` (+ request `get_action`→`get_workflow_action`) so every method name qualifies the shared-collection "action" noun as "workflow action"; endpoint ids unchanged. Tasks read their own docs via their own connection method (doc-level access, same D2 seam). Added a workflow-scope paragraph to D8.
>
> **Resolved (part 2 — cross-stream timeline, now in scope).** Decision: pull the timeline port **into Part 46** (not a follow-up — "do it properly"). The cycle worry dissolves once workflows *owns* the timeline (workflows→events is legal). New cross-stream method **`GetEventsTimeline`**: stream-agnostic dedup/attachment, then branch on `workflow_id` — set → workflow enrichment (verb gate + engine link); null → **pass through** on shared display fields (`status` + `<app-slug>.message`, which tasks write into the same fields). No cross-module merge chaos. All three YAML stages deleted; events module's inline lookup removed (generic timeline → events-only). Task-specific auth + links for task cards deferred to the tasks module (no task docs exist yet; recorded as boundary note in D6 + tasks-module plan). Rewrote D6, intro/size, proposal bullets 1, D2, read-methods section (+ `GetEventsTimeline` behavior + table row), what-gets-deleted, Ripples (Part 42 + new Events-module bullet), Non-goals, Related; added a "Timeline action cards are cross-stream" section to the tasks-module plan.