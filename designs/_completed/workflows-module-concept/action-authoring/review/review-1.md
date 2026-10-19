# Review 1 — Action Authoring sub-design

Critical review of `designs/workflows-module/action-authoring/design.md` and `spec.md`. Focus on the resolver pipeline, the form components library, build-time operators, and the action YAML grammar. Verified against the actual modules-mongodb codebase.

## Critical findings

### 1. `_build.var` is used in `makeWorkflowApis` output but is not a verified Lowdefy operator

> **Resolved.** Changed `_build.var: action_type` to `_var: action_type` in the `makeWorkflowApis` generated-endpoint examples in both `design.md` (Decision 5) and `spec.md`. `_var:` is the correct operator per CLAUDE.md for reading `_ref`-level vars attached when the resolver `_ref`'s the template.

Decision 5 ("`makeWorkflowApis` — the per-action endpoint generator") shows the generated endpoint shape:

```yaml
- id: '{workflow_type}-{action_type}-submit'
  type: Api
  routine:
    - id: submit
      type: CallApi
      properties:
        ...
        payload:
          action_id: { _payload: action_id }
          current_type: { _build.var: action_type }
```

Verified against the codebase: `_build.var` does not appear anywhere in `modules/` or `apps/demo/`. The build-time-operator family in this repo uses `_build.object`, `_build.array`, `_build.if`, `_build.if_none`, `_build.eq`, `_build.ne`, `_build.function`, `_build.switch`, `_build.args` (the latter as `__build.args` inside `_build.function` callbacks — see [modules/contacts/api/update-contact.yaml:81-90](../../../../modules/contacts/api/update-contact.yaml)). No `_build.var`.

The CLAUDE.md guidance distinguishes `_var` (`_ref`-level vars at build time) from `_module.var` (module entry vars). The design's likely intent is to inject `action_type` as a `_ref`-level var when emitting the generated YAML — which would be `_var: action_type`, not `_build.var: action_type`. The resolver builds the YAML string at build time; the emitted YAML resolves `_var: action_type` against the vars the resolver attached when it `_ref`'d the template.

Fix: change `_build.var: action_type` to `_var: action_type` everywhere in the generated-endpoint examples (Decision 5 and the action-authoring spec.md). If the resolver is supposed to bake `action_type` in as a literal string at build time, the literal-string approach is cleaner (the resolver emits `current_type: qualify` directly, no operator needed).

### 2. Component-library shape (`vars:` + `config:` blocks) breaks from existing component convention

> **Resolved.** Added an explicit clarifying sentence in Decision 6 immediately before the `controlled_list.yaml` example: the two-key shape (`vars:` + `config:`) is library-specific and distinct from `exports.components` (which ship a block tree directly at the top level, e.g. `modules/contacts/components/basic-contact-selector.yaml`). The library shape exists because the resolver dereferences components programmatically and needs the vars schema to validate author input; library components are never `_ref`'d by app YAML.

Decision 6 specifies form-library components at `components/fields/{component}.yaml` with two top-level keys:

```yaml
# components/fields/controlled_list.yaml
vars:
  key: { type: string, required: true }
  ...
config:
  id: { _module.var: key }
  type: ControlledList
  ...
```

Verified against existing components: zero use this two-key shape. Existing components emit a block tree directly at the top level. Examples:

- [modules/contacts/components/basic-contact-selector.yaml](../../../../modules/contacts/components/basic-contact-selector.yaml) — top-level block tree, reads vars via `_module.var: label` and `_var: ...` inline.
- [modules/layout/components/page.yaml](../../../../modules/layout/components/page.yaml) — same shape.
- [modules/events/components/events-timeline.yaml](../../../../modules/events/components/events-timeline.yaml) — same shape.

The proposed two-key shape (`vars:` + `config:`) is **necessary** for the library because the resolver needs to know the vars schema to validate author input — that's why this is a new shape. But the design should be explicit that this is a new, library-only convention distinct from how `exports.components` work, and that the library components are dereferenced by the resolver (not by `_ref` from app YAML).

Fix: the spec already states the latter ("Apps never `_ref` library entries directly"). The design.md text should add a one-line statement that the two-key shape is **specific to library components** and is distinct from the existing `exports.components` shape. Otherwise readers familiar with existing components will be confused.

### 3. Resolver pattern (`_ref: { resolver }`) is a v1 milestone, not "supported by Lowdefy"

> **Rejected.** Parallel to module-surface review #2 — trust the upstream Lowdefy module-system spec. Resolvers are module-internal (apps never write `_ref: { resolver }` themselves), and if the upstream capability differs from the spec, the failure surfaces via a normal `lowdefy build` error and gets resolved then. No design change.

Decision 5 introduces five resolvers and states the resolver-invocation pattern works inside `module.lowdefy.yaml`. Verified against the codebase:

- Zero existing modules ship JS resolvers (`grep -rn "resolver:" modules/*/module.lowdefy.yaml` returns nothing).
- No `modules/*/resolvers/` directories exist.

The upstream Lowdefy capability is real per the cited `lowdefy-design/designs/module-system/technical-decisions.md`, but this codebase has no precedent. Three of the five resolvers fire from inside `module.lowdefy.yaml` (`makeActionPages`, `makeWorkflowApis`, `makeWorkflowsConfig`, `makeActionFormConfigs`) and one (`makeActionsForm`) fires from inside a Nunjucks template — the latter is already flagged as "Open question" in the design.

The first four invocations are also new ground. The design treats `_ref: { resolver }` from `module.lowdefy.yaml` as a settled capability; the spike already proposed for `makeActionsForm` should be extended to cover all four invocations (run `lowdefy build` against a minimal resolver that emits one page; verify it appears in the dist).

Fix: extend the existing Open Question (`makeActionsForm` recursion) to a broader "Verify resolver invocation across all five resolvers in a build spike before relying on the pipeline." If `_ref: { resolver }` doesn't work as documented for the four manifest-level invocations either, the entire resolver pipeline needs a different shape.

## Important findings

### 4. `access:` block on actions has no codebase precedent

> **Resolved.** Added a new Decision 3 ("Action access semantics") to `action-authoring/design.md` formalizing the two-part shape: (1) **per-app verb maps** keyed by `app_name` controlling UI affordances per deployment, with module-defined verb vocabulary `view` / `edit` / `review` (the latter two imply `view`); apps without a key for a given app deployment hide the action entirely there. (2) **Role gate** at `access.roles` controlling who can interact regardless of app, resolved from `_user: roles` (sourced from `apps.{app_name}.roles` on the `user_contacts` doc), with check `(access.roles empty) OR (intersection > 0)`. Both gates compose AND. Checks run at build-time (`makeActionPages` filters page emission per app verbs), query-time (`get-entity-workflows` filters per app verbs + role gate), and submit-time (`submit-action` re-checks role gate before any writes). Mirrored a tightened version into `action-authoring/spec.md` under a new "Access" section. Existing decisions 3-6 renumbered 4-7; engine sub-design's "Decision 4" cross-ref to action-authoring's tracker decision updated to "Decision 5"; internal decision-cross-refs within action-authoring/design.md also updated.

The YAML examples for form, task, and tracker actions use:

```yaml
access:
  my-team-app: [view, edit]
  roles: [account-manager]
```

Verified: no existing module uses this shape on any entity. The user-admin module (which is the closest analogue — per-app access flags) stores access state in `user.app_attributes.{app_name}` on the user document, not in YAML config. The user-account module uses Lowdefy's native page-level `auth:` config in `lowdefy.yaml`, not a per-resource `access:` block.

This isn't wrong — the design is committing to a new authorization shape for actions specifically. But the design under-explains:

- How `access.{app_name}: [view, edit]` interacts with the `action_role_check` component (UI sub-design). Is `access` a build-time filter (resolver drops actions not accessible to the current app) or a runtime filter (component checks user roles against `access.roles`)?
- Both, per the design — but the interplay isn't called out.
- What "verb" means in the verb list. The design uses `view` and `edit` as if they map to page kinds (`-view`, `-edit`, `-error`). Is `edit` access required to submit the action? Is `view` access required to see the action at all?

Fix: add a "Access semantics" sub-section under Decision 2 or Decision 4 spelling out:

- `access.{app_name}` is a verb list; the resolver filters per-action page generation based on this list (form actions only emit `edit` page when the list contains `edit`).
- `access.roles` is a runtime role-gate; the `action_role_check` component reads the current user's roles and decides whether to render verb buttons.
- The verb vocabulary: `view`, `edit` (form actions), with `view` implied if `edit` is present.

### 5. `status_map.{stage}.{app_name}` nested keying has no direct precedent — but the closest analogue is `event_display`

> **Resolved.** Added a one-line cross-reference to the events module's `event_display.{app_name}.{event_type}` pattern (and the [docs/idioms.md "Event display"](../../../../docs/idioms.md#event-display) anchor) in the `makeWorkflowsConfig` build-time-validation entry for `status_map`, with a note that the workflows nesting (`status_map.{stage}.{app_name}`) groups per-stage display together for the engine's per-stage transitions.

Action YAMLs use `status_map: { <stage>: { <app_name>: { message, link } } }` for per-stage / per-app display config. The closest existing pattern is the events module's `event_display.{app_name}.{event_type}: { title }` ([modules/events/api/new-event.yaml:11-14](../../../../modules/events/api/new-event.yaml), [docs/idioms.md "Event display"](../../../../docs/idioms.md#event-display)).

The shape is consistent in spirit (app-keyed display config) but differs in nesting order:

- Events: `event_display.{app_name}.{event_type}.title`
- Workflows: `status_map.{stage}.{app_name}.message`

Either ordering works; the workflows nesting groups per-stage display together which makes sense given that the engine evaluates per-stage transitions. Worth a one-line note in the design pointing at the events module's parallel pattern so authors recognize the family resemblance.

Fix optional: cross-reference the events module's `event_display` pattern in Decision 4 when introducing `status_map`.

### 6. The "Why explicit, not inferred" rationale paragraph still appears in the spec — should be design-only

> **Rejected.** Spot-check during the review already confirmed `spec.md` carries only the validation rules, not the rationale paragraph. No action needed; finding self-resolved.

`spec.md` is meant to carry implementation-ready decisions, not the rationale for decisions taken. The "Why explicit, not inferred" paragraph in Decision 2 (line 114 of action-authoring/design.md) explains the trade-off between explicit-`kind` and shape-inference. This belongs in `design.md` (where it currently is); checking that spec.md doesn't also carry it.

Spot-check: the spec keeps the validation rules but doesn't carry the rationale paragraph. ✓ Correct as-is.

## Minor findings

### 7. `_module.var:` inside library component `config:` blocks reads vars passed at resolver-substitution time, not module entry vars

> **Resolved.** Changed `_module.var:` → `_var:` for every var read inside the `controlled_list.yaml` library example's `config:` block in both `design.md` (Decision 6) and `spec.md`. Library components now use `_var:` consistently for author-supplied vars (matching CLAUDE.md guidance); `_module.var:` stays reserved for genuine module entry vars (e.g. `app_name`, `workflows_config`).

The library example uses `_module.var: key`, `_module.var: title`, etc. inside `controlled_list.yaml`'s `config:` block. Existing modules use `_module.var:` to read module entry vars (e.g. `_module.var: app_name`). In library components, the resolver substitutes vars at build time — these aren't actually module entry vars.

Either the resolver evaluates the `_module.var:` operators at build time with the author-supplied vars in scope (which would be a custom resolver behavior), or the operator should be `_var:` (matching `_ref`-level var convention per CLAUDE.md). Mixing `_module.var` and `_var` semantics in different contexts is confusing.

Fix: change `_module.var:` to `_var:` in library component `config:` blocks. The resolver's job is to substitute `_var:` operators against author-supplied vars; `_module.var:` should stay reserved for module entry vars (e.g. `app_name`).

### 8. `change_stamp` reference on workflow / action writes is implied but not stated

> **Resolved.** Added explicit `created` and `updated` fields to the engine sub-design's `createAction.js` pseudo-code with an inline comment stating that change stamps are generated server-side from the handler's context (not via the events module's `change_stamp` component, since the plugin handler doesn't evaluate Lowdefy operators). Apps that override `change_stamp` at the events module entry get the override on event log writes only; workflow / action doc stamps follow a fixed JS-generated shape.

The engine sub-design's createAction.js pseudo-code includes `_id`, `workflow_id`, `type`, `entity_type`, `entity_id`, `entity_collection`, plus universal fields and references — but no `created` or `updated` change stamps. Per the idiom doc and existing modules (contacts, companies, user-admin), all writes should carry `_ref: { module: events, component: change_stamp }`.

This may be intentional (the plugin handler doesn't run Lowdefy operators, so it would generate the stamp via `new Date()` + the request's `user` context server-side instead of `_ref`'ing the component). But the design should state this explicitly — engine writes generate change stamps in JS, not via the cross-module component reference.

Fix: add a one-line note in the engine's createAction.js pseudo-code (or in action-authoring's "What an author writes" intro) clarifying that change stamps on workflow and action docs are generated server-side by the plugin handler, not via the events module's `change_stamp` component. Apps that override `change_stamp` (per the idiom) get the override at the events-write layer; workflow / action doc stamps follow a fixed shape.

### 9. `workflow_lifecycle_stages` has only three keys — `priority` field is moot

> **Resolved.** Clarified in Decision 1 that the workflow lifecycle stages enum carries only display fields (`title`, `color`, `borderColor`, `titleColor`, optional `icon`) — no `priority`. The engine doesn't apply the priority rule to workflow status pushes; those are guarded by a same-stage no-op check inside `pushWorkflowStatus`. Added a pointer to engine sub-design "Idempotency" for the guard mechanism. `spec.md` already framed this correctly (line 58).

Action statuses have eight entries with priorities (Decision 1 line 22). Workflow lifecycle stages have three entries (`active`, `completed`, `cancelled`). The engine doesn't use priority on workflow stages — `pushWorkflowStatus` uses a same-stage no-op guard, not a priority comparison.

The action-authoring sub-design and the spec both describe `workflow_lifecycle_stages` as "mirrors the shape with a smaller set" — implying priorities exist there too. Verified against the engine sub-design's Idempotency section: workflow status pushes are NOT covered by the priority rule explicitly because the enum has no priority ordering.

Fix: in Decision 1, clarify that `workflow_lifecycle_stages` entries do NOT carry `priority` (only display fields: `title`, `color`, etc.). Or, if they do carry priority for some future use, state that priority is currently unused at runtime.

## Open questions

1. **Resolver invocation spike (extended).** The existing `makeActionsForm` recursion spike (finding #3) should be extended to all five resolvers — verify the manifest-level invocation pattern works before relying on the pipeline.
2. **Access semantics formalization.** Finding #4 raises the question of how `access.{app_name}` and `access.roles` compose. Worth a small "access semantics" decision rather than scattered references across multiple sub-designs.

## Next steps

Resolve via `/r:design-action-review workflows-module/action-authoring`. The substantive items are #1 (`_build.var` is invalid syntax), #2 (component-library shape is new), #3 (resolver invocation needs a spike), and #4 (access semantics need formalizing). The rest are smaller clarifications.
