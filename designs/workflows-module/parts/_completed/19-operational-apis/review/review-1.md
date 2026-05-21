# Review 1 — Design vs. concept spec, neighbouring parts, and shipped engine code

Reviewing [`designs/workflows-module/parts/19-operational-apis/design.md`](../design.md) against the concept docs (`workflows-module-concept/module-surface/spec.md`, `engine/spec.md`, `action-authoring/spec.md`), the neighbouring part designs (5, 6, 7, 12, 13, 17, 18, 20, 21, 23), and the shipped engine handlers under `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/`. No code in scope yet — this is design-vs-design + design-vs-shipped-handlers review.

## Real findings

### 1. "Access enforcement … all three implementations must match" misframes what each layer enforces

> **Resolved.** Rewrote `design.md:58-66` to spell out what each layer enforces (build: verb only; query: verb + role; submit: role only; verb at submit is implicit). Composite-policy framing replaces the "all three must match" claim.

`design.md:58-66` says the same two-part check runs at build time (part 12), query time (here), and submit time (part 6), and that "All three implementations must match."

That over-claims symmetry. Each layer can only enforce what it has the inputs for:

- **Build time** (part 12, [`12-resolver-pages/design.md:22`](../../12-resolver-pages/design.md)) runs the **verb filter only** — there is no user at build time, so the role gate is structurally unreachable. Concept spec [`action-authoring/spec.md:146`](../../../workflows-module-concept/action-authoring/spec.md): "Build-time (`makeActionPages`): per-app verb filter on page emission."
- **Query time** (here) runs **verb filter + role gate**. Both layers.
- **Submit time** (part 6, [`06-submit-action-writes/design.md:51`](../_completed/06-submit-action-writes/design.md)) runs the **role gate only**. The verb filter is implicit because the page wouldn't have been emitted at build time without the verb. Concept spec [`engine/spec.md:194`](../../../workflows-module-concept/engine/spec.md): "Verb-filter check at submit-time is implicit (page wouldn't have been generated if verb wasn't allowed in current app)."

What needs to match is the **composite policy** — every action a user can submit must also be visible to them via `get-entity-workflows`, and every page emitted to them must pass the role gate when submitted. The mechanical check at each layer differs.

**Suggested fix:** rewrite `design.md:58-66` to:

> Access enforcement is split across three layers — each layer enforces what its inputs allow:
>
> - **Build time** (part 12): per-app verb filter on page emission. No role gate (no user context).
> - **Query time** (here, `get-entity-workflows` + `get-workflow-overview`): per-app verb filter AND role gate.
> - **Submit time** (part 6): role gate re-check. Verb filter is implicit — the page wouldn't have been emitted if the verb wasn't allowed.
>
> The composite policy must be consistent: a user can submit an action iff query time would have surfaced it.

### 2. `get-entity-workflows` "filter actions where `access.{app_name}` must include `view`" omits the `view` ⊆ `edit`/`review` implication

> **Resolved.** Changed the filter rule at `design.md:43` to "must intersect `[view, edit, review]`" with a link to the action-authoring verb-implication table. `get-workflow-overview` inherits via "same rule as `get-entity-workflows`".

`design.md:43` says the verb check is "must include `view`". The concept's per-app verb table at [`action-authoring/spec.md:130-132`](../../../workflows-module-concept/action-authoring/spec.md) says `edit` and `review` both **imply `view`**:

| Verb | Effect |
| --- | --- |
| `view` | Shows action in `actions-on-entity`; ... |
| `edit` | Renders submit form. **Implies `view`.** |
| `review` | Renders a dedicated review page. **Implies `view`.** |

So an action with `access.{app_name}: [edit]` (no explicit `view`) should still appear in `get-entity-workflows`. Today's wording would silently drop it.

**Suggested fix:** change `design.md:43` to:

> Filter actions per access rule: `access.{vars.app_name}` must intersect `[view, edit, review]` (per the verb-implication table in action-authoring spec) AND `access.roles` must intersect with `_user.roles` (empty / missing roles = no gate).

The same wording should land in the `get-workflow-overview` access filter description at `design.md:54` ("same rule as `get-entity-workflows`" then propagates the fix). The build-time check in part 12 has the same shape — confirm part 12's verb gating treats `edit`/`review` as implying `view` for the visibility decision (it currently emits the specific page per verb, which is correct — but the `actions-on-entity` data feed needs the union check).

### 3. "Empty roles = no gate" is ambiguous between missing key and empty array

> **Resolved.** Folded into the #2 rewrite: `design.md:43` now reads "empty or missing `access.roles` = no gate" (covers both the array-empty and key-missing shapes).

`design.md:43`: "(empty roles = no gate)".

Concept at [`action-authoring/spec.md:138`](../../../workflows-module-concept/action-authoring/spec.md): "Empty/missing means no role gate." Both shapes pass.

The design's shorthand could be read as "only `[]` short-circuits, a missing `access.roles` key is a bug." Spell out both shapes — the implementation will need an explicit `roles == null || roles.length === 0` (or the Mongo equivalent: `$or: [{ 'access.roles': { $exists: false } }, { 'access.roles': { $size: 0 } }, { 'access.roles': { $in: user.roles } }]`).

**Suggested fix:** "empty or missing `access.roles` = no gate". Same change applies to the `get-workflow-overview` filter.

### 4. `_user.roles` source not specified — pulled from where?

> **Resolved.** Added a paragraph at the top of the "Access enforcement" section pointing at the module's `user_schema.roles_path` var (default `roles`) and noting that the plugin-handler alternative would need a `WorkflowAPI/schema.js` bump. Cross-references the routine-vs-handler open question.

`design.md:43` and `:54` reference `_user.roles` without qualifying it. The concept ([`action-authoring/spec.md:140`](../../../workflows-module-concept/action-authoring/spec.md)) anchors it: "Roles resolve from `_user: roles` — the user's effective roles for the current app, sourced from `apps.{app_name}.roles` on the `user_contacts` doc." The path is also configurable per the module manifest's `user_schema: { roles_path }` var ([`module-surface/spec.md:59`](../../../workflows-module-concept/module-surface/spec.md)).

If `get-entity-workflows` is a Lowdefy routine, `_user: roles` is the operator and the `roles_path` var must be threaded in. If it's a plugin handler, it reads from `lowdefyContext.user` and must consult the `user_schema` connection property (currently not on `WorkflowAPI/schema.js` — would need a part-3 schema bump).

**Suggested fix:** add a one-liner under both API sections: "Resolves user roles via the module's `user_schema.roles_path` var (default `roles`); the routine reads `_user: { _module.var: user_schema.roles_path }`." Or, if the open question on "routine vs plugin handler for reads" lands on plugin handlers, document the schema bump.

### 5. `get-workflow-overview` does not specify keyed-action multiplication

> **Resolved.** Both API sections now spell out keyed-action multiplication. `get-entity-workflows`: "Keyed actions surface as N rows in `actions[]` (one per instance, identified by `key`), kept together within their group slot." `get-workflow-overview`: "Keyed actions surface as N rows (one per instance, identified by `key`), kept together within their parent action's sort slot."

`design.md:48-56` defines the response as `{ workflow, actions: [] }` but omits the keyed-action behaviour the concept spec calls out at [`module-surface/spec.md:222`](../../../workflows-module-concept/module-surface/spec.md):

> "Keyed actions surface as N rows, one per instance, kept together within their parent action's sort slot."

This is a real shape commitment — without it, the consumer (part 17's `workflow-overview` page at [`17-shared-pages/design.md:41`](../../17-shared-pages/design.md): "Keyed actions render as N cards within their group slot") cannot assume one row per instance.

**Suggested fix:** add to `design.md:48-56`:

> Keyed actions surface as N rows in the response (one per instance, identified by `key`), kept together within their parent action's `sort_order` slot.

Same for `get-entity-workflows` at `design.md:37-46` — the per-group grouping already collapses to "one row per action doc", but the wording should be explicit since part 18's [`18-entity-components/design.md:22`](../../18-entity-components/design.md) reads it: "Keyed actions render as N rows within their group slot, one per instance."

### 6. "`display_order` ASC" sort-key origin is undocumented

> **Resolved.** `design.md:45` now reads "Sort workflows by `display_order` ASC (workflow-level field written by `StartWorkflow` from `workflowsConfig.{type}.display_order`; see [part 5](../_completed/05-start-cancel-handlers/design.md)), tie-break `created.timestamp` DESC."

`design.md:45`: "Sort workflows by `display_order` ASC, tie-break `created.timestamp` DESC."

`display_order` is a workflow-level field on the workflow doc (part 5 writes it from the `workflowsConfig` entry — [`StartWorkflow.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/StartWorkflow/StartWorkflow.js) reads it from the workflow config). Concept at [`engine/spec.md`](../../../workflows-module-concept/engine/spec.md) and [`action-authoring/spec.md`](../../../workflows-module-concept/action-authoring/spec.md) call this out implicitly via the worked example, but the design doesn't say where the value comes from.

Worth a one-liner anchoring it: "`display_order` is the workflow-level field written by `StartWorkflow` at creation, sourced from `workflowsConfig.{type}.display_order` (see part 5)."

### 7. `references` reserved-key collision deferral leaves `close-workflow` and `cancel-workflow` writes underspecified

> **Resolved.** Added a shared "`references` pass-through" note at the top of "In scope" pointing at the handlers' `RESERVED_WORKFLOW_KEYS` defense (shipped `CancelWorkflow.js`; adopted by part 23's `CloseWorkflow`). The routine layer does not re-validate.

`design.md:70` defers references-collision validation: "concept says reserved keys win silently in v1; no throwing." Concept anchors this at [`engine/spec.md:240`](../../../workflows-module-concept/engine/spec.md): merge-order spreads `references` first, then core fields override.

But the **operational APIs are the public callers** that supply `references`. The merge-order rule lives inside the handler ([`CancelWorkflow.js:4-17`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) deletes a fixed `RESERVED_WORKFLOW_KEYS` list before spreading). The design says nothing about whether the Lowdefy routine layer (part 19) re-validates payload `references` or just passes them through.

Part 23 already calls this out for `close-workflow` at [`23-close-workflow-handler/design.md:22`](../../23-close-workflow-handler/design.md): "defended via the same `RESERVED_WORKFLOW_KEYS` deletion pattern shipped in `CancelWorkflow.js:4–18` — engine spec's 'merge order' rule covers action-doc `$set` writes, but the workflow close write combines `$set` with `$push: status`, and merge-order alone doesn't protect against a malicious `references: { status: [...] }` …"

That same protection needs to land for `CancelWorkflow` (the close handler defends; the cancel handler already does — see the shipped `RESERVED_WORKFLOW_KEYS` block above). The risk is the **action sweep** on cancel/close, which does a flat `$set` plus a `$push` on each non-terminal action — the handler's `$push` for `status` is safe by merge order, but if part 8 / future code ever adds a `$set` of references onto the swept actions (e.g. "spread the workflow's `references` onto every swept action"), the same `references.status` injection becomes possible on the action side.

**Suggested fix:** add a one-line note under each API:

> The handler defends against reserved-key collisions on workflow doc writes via the `RESERVED_WORKFLOW_KEYS` deletion pattern shipped in [`CancelWorkflow.js`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js); the Lowdefy routine in this part passes `references` through unchanged.

This also lets the API spec stay shipper-friendly without re-validating in the routine.

### 8. `start-workflow` return type `{ workflow_id, action_ids }` is correct but undocumented as ordered/indexed

> **Resolved.** Appended to `design.md:17`: "`action_ids` preserves input order — either the order of payload `actions: []` when supplied, or the order of YAML `starting_actions:` when not."

`design.md:17`: "Returns `{ workflow_id, action_ids }`."

The shipped handler returns `action_ids` as an array, but the design doesn't say whether order matches the input `actions: []` (or the YAML `starting_actions:`) — a real concern for callers who want to `_payload: action_ids.0` to grab the first action's id. Same gap in [`05-start-cancel-handlers/design.md:27`](../_completed/05-start-cancel-handlers/design.md). Worth picking up here since part 19 owns the public contract.

**Suggested fix:** "`action_ids` preserves the input order — either the order of payload `actions: []` when supplied, or the order of YAML `starting_actions:` when not."

### 9. Open question "Routine vs. plugin handler for reads" lacks decision criteria

> **Resolved.** Committed to Lowdefy routines (matching the prior lean). Promoted the question out of "Open questions" and added a "Read path: Lowdefy routines (not plugin handlers)" section under "In scope" capturing the three trade-offs the implementer would otherwise re-discover (`_user` access, connection separation, `makeActionPages` parity). Dropped the matching "Out of scope" deferral and the cross-reference in the access-enforcement section.

`design.md:71-72, 91-92`: "Lean routines for reads in v1."

That's the right lean, but the design defers without spelling out the actual trade-offs. Three things the deciding implementer will want to know:

1. **`_user` access**: a Lowdefy routine can use the `_user` operator directly. A plugin handler needs `lowdefyContext.user` plus a schema declaration for `user_schema` (today's `WorkflowAPI/schema.js` doesn't expose it).
2. **Connection separation**: routines hit `workflows-collection` + `actions-collection` (read-only `MongoDBCollection` connections — [`module-surface/spec.md:131-135`](../../../workflows-module-concept/module-surface/spec.md)). Plugin handlers all go through `workflow-api`'s shared client. Mixing routines (reads) with handlers (writes) splits the read/write connection lifecycles, which is the original rationale for three separate connection exports — keeping the lean is consistent with that.
3. **`makeActionPages` parity**: the build-time access check (part 12) is JS, not a Mongo aggregation. If the query-time check stays in a routine, the verb-list + role-gate JS lives in two places (routine YAML's `_js` and `makeActionPages.js`). Plugin handler would consolidate to one JS implementation.

**Suggested fix:** capture these in the open question so the implementer doesn't re-discover them, and either commit to the lean (routines) with rationale, or move it to "in scope" with a note that part 12's check is duplicated.

### 10. `get-workflow-overview` empty/inaccessible workflow response: undefined behavior for "workflow exists, no access" vs. "workflow does not exist"

> **Resolved.** Folded into the #5 rewrite. `design.md:56` now reads: "if no visible actions, return `{ workflow: null, actions: [] }` and the page redirects back to its host entity page (`actions-on-entity`). The access-vs-existence distinction is intentionally collapsed for security — callers can't tell whether the workflow is absent or simply inaccessible."

`design.md:56`: "if no visible actions, return `{ workflow: null, actions: [] }` so the page can redirect."

Two different states collapse to the same response:

- `workflow_id` doesn't exist (404-equivalent).
- Workflow exists but the user can see no actions (403-equivalent for actions, plus the implicit workflow-doc visibility — does the workflow itself have access rules separate from its actions?).

The concept at [`module-surface/spec.md:220`](../../../workflows-module-concept/module-surface/spec.md) collapses them: "If the workflow itself has zero visible actions for this caller, the API returns `{ workflow: null, actions: [] }` and the page redirects back." So the collapse is intentional in concept.

But the design's "page can redirect" wording leaves an ambiguity: redirect **where**? Back to entity page? To a 404? To a fallback? Worth a one-liner so part 17's `workflow-overview` page implementer doesn't guess.

**Suggested fix:** add to `design.md:91`: "The page redirects back to the entity page (`actions-on-entity` host); 404 chrome is not used because the access-vs-existence distinction is intentionally collapsed for security."

### 11. `tracker_fired` in the cancel/close return shape is shipped as `null` until part 10 lands — design should pin the contract

> **Resolved.** Both `cancel-workflow` and `close-workflow` "Returns" lines now pin the v1 ship contract: "The shape is fixed; in v1 ship, `event_id` and `tracker_fired` are `null` until parts 8 and 10 light them up."

`design.md:25, 35`: "Returns `{ action_ids, event_id, tracker_fired }`."

The shipped `CancelWorkflow` at [`CancelWorkflow.js:132`](../../../../plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/CancelWorkflow/CancelWorkflow.js) returns `{ action_ids, event_id: null, tracker_fired: null }`. Part 10 replaces `tracker_fired: null` with the fire array ([`10-tracker-subscription/design.md:16`](../../10-tracker-subscription/design.md): "the subscription replaces it with the fire array").

The design currently doesn't pin the v1 ship value. Two readers (part 18, part 17) might assume the field is always an array. Worth pinning the contract:

**Suggested fix:** "Returns `{ action_ids, event_id, tracker_fired }`. In v1 ship, `event_id` and `tracker_fired` are `null` until parts 8 and 10 light up; the field shape is fixed but the values won't be populated until those parts land."

### 12. `close-workflow` API not yet in the spec's API list

> **Resolved.** Updated `designs/workflows-module-concept/module-surface/spec.md` to add `close-workflow` to (a) the `exports.api` block, (b) the `api:` `_ref` list, and (c) the APIs table. The precondition is met inside this PR.

`design.md:7`: "ship the static module-shipped Apis … `start-workflow`, `cancel-workflow`, `get-entity-workflows`, `get-workflow-overview`, and `close-workflow` (added by [part 23](../23-close-workflow-handler/design.md))."

Concept [`module-surface/spec.md:34-40`](../../../workflows-module-concept/module-surface/spec.md) lists only four:

```
api:
  - id: start-workflow
  - id: cancel-workflow
  - id: get-entity-workflows
  - id: get-workflow-overview
```

The concept spec needs updating to add `close-workflow` (Part 23 owns the addition — see part 23 design's contract to part 19/20). Since this design references the addition, flag it as a precondition: the concept-doc edit must land before this part can claim the manifest exports list is right.

**Suggested fix:** under "Depends on" at `design.md:74-76`, add: "Concept-doc edit (`module-surface/spec.md` API list) adding `close-workflow` — owned by [part 23](../23-close-workflow-handler/design.md). Precondition for this part's exports list."

Part 20 already lists all five in its design ([`20-module-manifest/design.md:27`](../../20-module-manifest/design.md)); the concept spec is the laggard.

## Minor

### 13. Missing entry in the spec table for `close-workflow`

> **Resolved.** Concept-spec table now carries a `close-workflow` row pointing at the part 19 + 23 owners; folded into the #12 fix.

Concept [`module-surface/spec.md:139-145`](../../../workflows-module-concept/module-surface/spec.md) describes the four APIs in a table. With `close-workflow` added, this table needs a fifth row. Same precondition as #12.

### 14. "Workflow author" vs "App author" terminology

> **Resolved.** Renamed "author-initiated" → "user-initiated" in part 19 (`design.md:31`), part 23 (`design.md:7,11`), and the top-level workflows-module `design.md:109`. Frozen `_completed/` and consistency-review artifacts left unchanged per the implemented-parts convention.

`design.md:29` calls close "Author-initiated normal termination". The term "author" in the rest of the concept spec refers to the workflow YAML author (a developer). Here it actually means an end-user / business action — closing a workflow because business decided to stop pursuing. Inconsistent with concept usage.

**Suggested fix:** change to "User-initiated" or "Operator-initiated" — anything that distinguishes the runtime actor from the build-time author. Part 23's design has the same wording (`23-close-workflow-handler/design.md:7,11`) and would benefit from the same fix.
