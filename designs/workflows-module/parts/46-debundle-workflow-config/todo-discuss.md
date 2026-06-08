  
  
  A. Read authorization on GetAction (genuine, has teeth). Today get_action is a raw $match — no read auth; anyone with an action_id can fetch the doc. Routing through GetAction is
  the moment to decide: does it gate on the view verb (return access_denied/null when the user has no view access), or stay open and let the client render-nothing? The three
  overview methods already filter by visible_verbs server-side, so a deep-link to an action you can't see is the one unguarded path. I'd lean toward GetAction enforcing view — but
  it's a behavior change worth a decision.

  B. One name for the per-verb access bag. The overview methods return visible_verbs; GetAction returns action_allowed — same {view,edit,review,error} shape, two names. Since D2
  consolidates the resolution into one JS implementation, the response contract should use one name across all four methods. Cheap consistency win; pick one.

  C. Pin the GetAction response shape. We just made Part 40 depend on spreading the response into current_action — so 46 should state the contract explicitly: { ...actionDoc,
  action_allowed, buttons }, and confirm no collision (the doc carries access/links, which are distinct from the resolved action_allowed/buttons). Right now 46 says "doc +
  action_allowed + buttons" loosely; worth nailing down given the spread.

  D. The entities map is under-specified. 46 moves the client-side _module.var: entities onto the connection to resolve workflow.entity_link server-side, but doesn't give the schema
  (keyed by entity_collection → { pageId, idQueryKey, title }?) or the host-app migration. New config surface — worth defining.

  Plus one verify-item, not a decision: per-request user resolution for read methods — 46 asserts user: { _user: true } resolves per-request "exactly as changeLog.meta.user does,"
  but that precedent is on the write path; worth confirming Lowdefy resolves connection-property operators for read-method invocations the same way before relying on it.

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