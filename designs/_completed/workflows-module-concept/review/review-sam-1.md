# Action authoring

### Actions enum

> **Resolved — adopted Sam's proposal.** Status set stays fixed (engine vocabulary, priority rule depends on it); display attributes (`title`, `color`, `borderColor`, `titleColor`, `icon`) become per-app overridable. Action-authoring Decision 1's "Why static" framing is rewritten to draw the engine-vocabulary-vs-display seam explicitly. The muddled "override at the layout-module level" sentence is dropped. Module-surface manifest gains two new optional vars — `action_statuses_display` and `workflow_lifecycle_stages_display` — both objects keyed by canonical status name, with whichever display fields the app wants to override; unknown keys are silently dropped so apps can't smuggle new statuses through this channel. Merge semantics match the events module's `event_display` precedent. Example added showing an app overriding `action-required` → "To Do" and `changes-required` → "Needs Revision."

Think there is value in allowing module users to overwrite actions enum to provide different titles or colours. But statuses should be fixed.

The following doesn't make sense to me

```
**Why static, not app-configurable.** The enum is the engine's vocabulary; collapsing to one canonical set keeps every consuming app on the same semantics. Apps that want per-app status display variations (e.g. different colors per deployment) override at the layout-module level, not by extending the enum. Apps that need a genuinely different status name (e.g. `todo` vs `action-required`) translate at the display layer — the engine sees one set of names.
```

### Action kinds

> **Resolved — added required `kind:` field.** Action-authoring Decision 2 switched from shape-inference to an explicit, required `kind:` field with three values: `form`, `task`, `sub-workflow`. Each kind has a required companion block (`form` ↔ `form:`, `sub-workflow` ↔ `tracker:`, `task` ↔ neither); mismatches throw at build time inside `makeWorkflowsConfig` with a clear "unknown action kind" or "missing required block" error. Considered alternative names (`shape`, `mode`, `variant`, `render_as`) but `kind` is the canonical tagged-union word and is deliberately distinct from Lowdefy's overloaded `type`. Worked-example YAMLs in the parent design and action-authoring updated to include `kind:` on all three action shapes.

Any value in having a kind field on actions?

### Tracking actions parent and child get linked at runtime

> **Resolved — adopted Sam's bidirectional-link shape.** Tracker actions now carry `child_entity_id` (the child entity's id, set when the child workflow is started). Child workflows now carry `parent_action_id` and `parent_entity_id` back-references. `start-workflow` accepts an optional `parent_action_id` payload field; when set, the engine writes both sides of the link in one server-side handler invocation (new child workflow doc with back-refs, child's N starting action docs, parent tracker action's `child_entity_id` + `in-progress` transition). This replaces the previous two-call setup (`start-workflow` then `submit-action(fields: { key })`) with a single `CallApi`. The engine's tracker subscription becomes a primary-key lookup (`actions.findOne({ _id: parent_action_id })`) instead of a secondary-index scan; the partial index on `key` is no longer needed. The action doc's `key` field returns to being used only for fan-out (per-row keying for non-tracker actions) — the overloading Sam flagged is gone. Multi-parent case is closed by construction (one child has one `parent_action_id`); the worked example I tried to construct (lead-onboarding + customer-success both tracking one installation) wasn't a forcing requirement — apps that need the same physical event to drive multiple parents spawn separate child workflows per parent or read shared entity state independently. Changes propagated to engine Decision 1 + 3, action-authoring Decision 4 (rewritten "How parent and child get linked at runtime" + "Constraint: 1:1"), module-surface (new Decision 3 for `start-workflow` payload contract, existing decisions renumbered 3→4, 4→5), parent design's worked example step 10.

Is key the right field to track relationship here? Feels weird - think we need to move to entity ids

Parent action has a link to custom (user defined page). On this page end-user can specify details for new workflow and entity (new ticket page, etc).

On submit on this page submit endpoint (user defined ) developer calls StartWorkflow request with a parent action id. This then links up to the parent action and sets it to in progress. Also sets a "child_entity_id" on the action.

Data links

- tracking action entity_id is parent entity_id
- tracking action child_entity_id
- child_workflow has parent_action_id and parent_entity_id

### Entity Collection on actions

> **Resolved — adopted, named `entity_collection`.** Schema gains `entity_collection` next to every `entity_id` on action docs and workflow docs (the MongoDB collection connection id, e.g. `leads-collection`). Tracker actions additionally carry `child_entity_collection` next to `child_entity_id`; child workflows carry `parent_entity_collection` next to `parent_entity_id`. Naming matches the files module's `collection` field for cross-module consistency. Engine Decision 1 "Entity-agnostic field shape" rewritten to include the new field; reserved-keys list extended (~20 names now); createAction.js pseudo-code updated. Engine Decision 3 "Parent ↔ child link shape" lists three fields per side. Action-authoring Decision 4's link example updated to include `entity_collection` on the `start-workflow` call. Module-surface Decision 3 `start-workflow` payload contract gains required `entity_collection` field. Parent design worked example steps 1 and 10 updated. UI Decision 1 "shape choices" entry rewritten to pass `entity_collection` through to templates so they can build queries / back-links without external mapping. The `get-entity-workflows` lookup still uses `(entity_type, entity_id)` for the query; returned docs carry `entity_collection` for downstream use.

We need entity collection and entity id on actions so we can find the referenced entity easily. Files module does a similar thing
Everywhere we have entity ids we should also have collection id

# Engine

### Sub-workflow tracker subscription mechanism

> **Resolved — renamed `sub-workflow` → `tracker`; added terminology section answering the direction question.** The action kind `sub-workflow` is renamed to `tracker` across all active design files (parent design, engine, module-surface, action-authoring, ui) — 60+ references updated. `kind: sub-workflow` → `kind: tracker`; "sub-workflow action" → "tracker action"; "Sub-workflow tracker subscription mechanism" → "Tracker subscription mechanism." Workflow-relationship terminology standardizes on "parent workflow" (the one carrying the tracker action) and "child workflow" (the one being mirrored). Decision 3 in the engine sub-design gains a short "Terminology" section answering Sam's direction question explicitly: the data flow is **child → parent** (when the child's status changes, the engine writes the parent's tracker action status; trackers don't push state to the child; the child runs independently). The `submit-pipeline` and `action-groups` alternative-architecture sub-designs are not renamed in this pass — they're future-architecture docs scheduled for separate decisions; they'll rename if adopted.

I don't understand. Is parent updating child or child updating parent?

Maybe sub-workflow is the wrong word - we could standardise on parent and child to make relationships clear.

# Engine

### More logic in workflows plugin request

I think we should move as much logic as possible to the custom request, also see my other design (designs/workflows-module/submit-pipeline/design.md)

I don't know if this request also does event writes? I guess the current submit-action is not so complicated/bad

### MDB Transaction

Think we should consider adding transactions - we do a lot of writes. Always wanted to add transactions to lowdefy api routines with a start transaction and end transaction request. Custom request should also respect same session/transaction - need a way to pass session to request.

Start transaction request should return session so we can pass it to custom request.

Separate design.
