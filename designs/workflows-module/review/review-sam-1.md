# Action authoring

### Actions enum

Think there is value in allowing module users to overwrite actions enum to provide different titles or colours. But statuses should be fixed.

The following doesn't make sense to me

```
**Why static, not app-configurable.** The enum is the engine's vocabulary; collapsing to one canonical set keeps every consuming app on the same semantics. Apps that want per-app status display variations (e.g. different colors per deployment) override at the layout-module level, not by extending the enum. Apps that need a genuinely different status name (e.g. `todo` vs `action-required`) translate at the display layer — the engine sees one set of names.
```

### Action kinds

Any value in having a kind field on actions?


### Tracking actions parent and child get linked at runtime

Is key the right field to track relationship here? Feels weird - think we need to move to entity ids

Parent action has a link to custom (user defined page). On this page end-user can specify details for new workflow and entity (new ticket page, etc).

On submit on this page  submit endpoint (user defined ) developer calls  StartWorkflow request with a parent action id. This then links up to the parent action and sets it to in progress. Also sets a "child_entity_id" on the action.

Data links
- tracking action entity_id is parent entity_id
- tracking action child_entity_id
- child_workflow has parent_action_id and parent_entity_id 


### Entity Collection on actions

We need entity collection and entity id on actions so we can find the referenced entity easily. Files module does a similar thing
Everywhere we have entity ids we should also have collection id


# Engine

### Sub-workflow tracker subscription mechanism

I don't understand. Is parent updating child or child updating parent?

Maybe sub-workflow is the wrong word - we could standardise on parent and child to make relationships clear.


# Engine


### More logic in workflows plugin request
 
I think we should move as much logic as possible to the custom request, also see my other design (designs/workflows-module/submit-pipeline/design.md)

I don't know if this request also does event writes?  I guess the current submit-action is not so complicated/bad


### MDB Transaction

Think we should consider adding transactions - we do a lot of writes. Always wanted to add transactions to lowdefy api routines with a start transaction and end transaction request. Custom request should also respect same session/transaction - need a way to pass session to request.

Start transaction request should return session so we can pass it to custom request.

Separate design.


