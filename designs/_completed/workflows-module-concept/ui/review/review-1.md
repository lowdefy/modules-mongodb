# Review 1 — UI sub-design

Critical review of `designs/workflows-module/ui/design.md` and `spec.md`. Focus on per-action page generation, templates, and the three entity-page UI components. Verified against the actual modules-mongodb codebase.

## Critical findings

### 1. `onInit` vs `onMount` — design uses both inconsistently across blocks; need to pick one

> **Resolved.** Changed `onInit` to `onMount` in the `actions-on-entity` block sketch in both `design.md` (line 150) and `spec.md` (line 122). Added an inline comment in the spec and a follow-on note in the design pointing at the events-timeline precedent ([modules/events/components/events-timeline.yaml](../../../../modules/events/components/events-timeline.yaml)) and explaining the rationale (entity page owns page-level `onInit`; component fetches on mount to avoid blocking page render). The other `onInit` usages in design.md (line 65) and spec.md (line 27) are on **pages** (form-action edit pages), which is the correct event for page-level data fetches; left unchanged.

`actions-on-entity` block-level sketch uses `onInit` ([ui/design.md:149-158](designs/workflows-module/ui/design.md), [ui/spec.md:122-130](designs/workflows-module/ui/spec.md)):

```yaml
events:
  onInit:
    - id: load
      type: CallApi
      properties:
        endpointId: { _module.endpointId: { id: get-entity-workflows, module: workflows } }
        ...
```

Existing modules' components use different event names depending on the case:

- [modules/notifications/pages/all.yaml](../../../../modules/notifications/pages/all.yaml) uses `onInit` (with `type: SetState` first, then `type: Request` steps).
- [modules/events/components/events-timeline.yaml](../../../../modules/events/components/events-timeline.yaml) uses `onMount` (for the data-fetch).

Both events exist in Lowdefy and have different semantics: `onInit` fires once on page initialization (before render); `onMount` fires when the block mounts (after the block is on the DOM). For a component that fetches data and renders results, **`onMount` is the standard pattern in this codebase** — that's what events-timeline does, and `actions-on-entity` is structurally identical (fetch on mount, iterate results, render). The notifications page uses `onInit` because it's a page (not a component), and the data fetch needs to happen before the page renders.

`actions-on-entity` is a component that gets dropped onto an entity page, not a page itself. The entity page has its own `onInit` for entity-loading; the `actions-on-entity` block should fetch via `onMount` to avoid blocking the entity page's render.

Fix: change `onInit` to `onMount` in the `actions-on-entity` sketch in both `design.md` and `spec.md`. (Both files have the same code block; same fix.)

### 2. `CallApi` is a client action, not a server `type:` — verify the routine context

> **Resolved.** Added a one-line note to the `actions-on-entity` runtime-behaviour description in `design.md` explaining that `type: CallApi` (not `type: Request`) is deliberate — the workflows module's data-access path goes through its Api layer; `WorkflowAPI` plugin request types aren't directly callable from blocks, so `CallApi` invokes `get-entity-workflows` which then routes through the engine. Avoids the confusion of readers familiar with the `Request` pattern from other modules.

The `actions-on-entity` sketch uses `type: CallApi` inside the `onMount`/`onInit` events block. Verified against the codebase:

- `CallApi` is a Lowdefy **action type** for invoking an Api endpoint from a client-side event handler. See uses in [modules/contacts/api/update-contact.yaml:58](../../../../modules/contacts/api/update-contact.yaml) (server-side routine step) and various server-side routines.
- Client-side fetches in components typically use `type: Request` against a request defined on the block, not `type: CallApi`. Example: [modules/notifications/pages/all.yaml](../../../../modules/notifications/pages/all.yaml) uses `type: Request` inside `onInit`.

The distinction matters because:

- `CallApi` invokes an Api endpoint (server-routed, runs the Api's routine server-side, returns the routine's return value).
- `Request` invokes a request definition on the current page/block (runs server-side but doesn't go through the Api routine layer).

For `actions-on-entity` to fetch via the workflows module's `get-entity-workflows` Api, `CallApi` is correct — that's the Api-invoking action. But the design should clarify that the workflows module's data-access path is "always through the Api" (consistent with the module's stance that `WorkflowAPI` plugin requests aren't directly callable from blocks). This isn't wrong; it's just worth stating that the choice of `CallApi` over `Request` is deliberate.

Fix optional: one-line note in the `actions-on-entity` description explaining that it uses `CallApi` (not `Request`) because the data path goes through the module's Api layer.

### 3. Resolver-driven page generation is a new pattern — same issue as action-authoring review

> **Rejected.** Parallel to module-surface review #2 and action-authoring review #3 — trust the upstream Lowdefy module-system spec. Resolvers are module-internal (apps never write `_ref: { resolver }`); if the upstream capability differs from the spec, a `lowdefy build` error surfaces it during implementation. No design change.

The UI sub-design assumes the page resolver pipeline works (`makeActionPages` is invoked from `module.lowdefy.yaml`'s `pages:` block). Verified against the codebase: no existing module uses resolver-driven page generation. Every module (companies, contacts, user-account, user-admin) ships static pages.

This is flagged in the action-authoring review (finding #3) and the engine review (resolver invocation spike). The UI sub-design inherits the risk — if the resolver pipeline doesn't work as the upstream Lowdefy module-system docs claim, the entire page-generation strategy needs a redesign.

Fix: cross-reference the action-authoring spike open question. No new content needed; just acknowledge the dependency.

## Important findings

### 4. Layout module exports components, not pages — design's "layout-module page" reference is slightly off

> **Resolved.** Replaced `_module.pageId: { id: page-layout, module: layout }` with `_ref: { module: layout, component: page }` in both `design.md` (line 114) and `spec.md` (line 74). Verified the layout module's actual export names against [modules/layout/module.lowdefy.yaml](../../../../modules/layout/module.lowdefy.yaml) — exports are `page`, `card`, `floating-actions`, `auth-page` (components, not pages). Added a parenthetical to both files clarifying that layout exports components, not pages.

[ui/design.md:114](designs/workflows-module/ui/design.md) states: _"the workflows module just uses `_module.pageId: { id: page-layout, module: layout }` to compose the surrounding chrome."_

Verified against [modules/layout/module.lowdefy.yaml](../../../../modules/layout/module.lowdefy.yaml): the layout module exports **components** (`page`, `card`, `floating-actions`, `auth-page`), not pages. There is no `pages/` directory in the layout module.

The correct reference for surrounding chrome is `_ref: { module: layout, component: page }` — a component reference, not a page reference. This is how existing pages compose layout chrome (see [modules/companies/pages/all.yaml](../../../../modules/companies/pages/all.yaml) for the pattern).

Fix: change the `_module.pageId: { id: page-layout, module: layout }` reference to `_ref: { module: layout, component: page }` (or whatever the correct layout-component name is — `page` is the most likely). This appears in `design.md` only, not the `spec.md`; check both.

### 5. Per-action `pages.{verb}.template` override has no precedent; mechanism is unclear

> **Resolved — dropped for v1.** Removed the "Per-action override path" item from the form-action-templates list in `design.md` (Decision 2); collapsed the list to one item (App-theme-agnostic). Added a paragraph stating that apps with bespoke action pages compose against the form components library (custom fields by name, or app-side custom blocks) and explaining the override was dropped because path resolution, vars contract, and layering semantics weren't specified. `spec.md` updated to match. The override is purely additive in v1.x if real apps surface it as a need — no migration cost to add later.

[ui/design.md:115](designs/workflows-module/ui/design.md): _"Each generated page checks the action's YAML for a `pages.{verb}.template` field; if set, the resolver `_ref`s that template instead of the module default."_

This is a new capability the design proposes. Verified against the codebase: no existing module supports per-action template overrides in YAML. The mechanism is plausible — the resolver reads the action's `pages.edit.template` path and substitutes it for `templates/edit.yaml.njk` — but the design doesn't specify:

- Path resolution: is `pages.edit.template` relative to the workflow YAML file's location, or absolute, or relative to the app root?
- Variable contract: the override template receives the same `vars` as the default template? If the default's vars contract changes between v1.x and v2.x, app-shipped overrides break silently.
- Reach-through escape: can the override `_ref` the module default in turn, plus extra stuff? Or is it always a full replacement?

Fix: defer or specify. If real apps don't have demonstrable need for per-action template overrides in v1, drop the feature. If keeping it, the design needs to specify path resolution, the vars contract, and whether the override is full replacement vs. layered.

Recommendation: drop for v1, add to Open Questions for re-evaluation after first consumer. The module-default templates plus the form-components-library composition should cover the realistic v1 needs.

### 6. Status-selector filtering on `task-edit` says "allowed transitions" but the priority rule's exceptions aren't covered

> **Resolved.** Extended the "Status-selector behavior" rules in both `design.md` Decision 4 and `spec.md` to include: (1) same-stage allowed for the current action (matches engine's `currentActionId` self-exception — re-save without stage change to update assignees only); (2) selector disabled with a "no transitions available" message when current stage is `not-required` (priority 0, universal terminal). The `force: true` UI exclusion stays as-is.

[ui/design.md:178-184](designs/workflows-module/ui/design.md): the task-edit status selector filters to allowed transitions via the priority rule. Decision 4 says:

> - From current stage, only stages with strictly lower priority are valid transitions.
> - `force: true` overrides aren't typically exposed through the UI.

This is good, but two exceptions from the engine's priority rule aren't reflected:

- **`currentActionId` self-exception**: same-stage transitions are allowed for the action being submitted. On task-edit, that means re-saving an action without changing its stage (e.g. updating `assignees` only). The filter should include the current stage to support this.
- **Universal-terminal exception**: `not-required` (priority 0) is terminal once written — only `force: true` moves it. The filter should exclude `not-required` if the current stage is `not-required` (which is unreachable via the priority rule anyway since 0 is the lowest, so the strict-less-than rule already excludes it). But the design should be explicit.

Fix: extend the "Status-selector behavior" section to include:

- Same-stage allowed for the current action (matches engine's `currentActionId` self-exception).
- If current stage is `not-required`, no valid transitions exist (selector should be disabled, not just filtered to empty).

### 7. `action_role_check` reads `_user: profile.roles` but the events module's convention is `_user: roles`

> **Resolved.** Updated `action_role_check` descriptions in both `design.md` and `spec.md` to read `_user: roles` (sourced from `apps.{app_name}.roles` on the `user_contacts` doc — the same source the user-admin module manages, matching the demo app's `userFields.roles: user.roles` config). Added a cross-reference to action-authoring Decision 3 "Action access semantics" so the component is anchored to the canonical access-check definition. The component now explicitly implements the same query-time check the engine runs in `get-entity-workflows` / `submit-action`.

[ui/design.md:174](designs/workflows-module/ui/design.md): _"Reads the current user's roles via `_user: profile.roles`."_

Verified against the codebase — Lowdefy's `_user:` operator reads from the session's user object. The roles path depends on the auth provider's user-fields config. In [apps/demo/lowdefy.yaml:69-74](../../../../apps/demo/lowdefy.yaml):

```yaml
userFields:
  id: user.id
  profile: user.profile
  app_attributes: user.app_attributes
  global_attributes: user.global_attributes
  roles: user.roles
```

The roles field is named `roles` (not `profile.roles`). So `_user: roles` is the canonical access path.

The module-surface sub-design's `vars.user_schema.roles_path: roles` is consistent with this. The UI sub-design's text is wrong — it should reference `_user: roles` (or read the path from `_module.var: user_schema.roles_path` for flexibility).

Fix: change `_user: profile.roles` to `_user: roles` in the `action_role_check` description. Cross-reference `vars.user_schema.roles_path` from module-surface for the configurable case.

## Minor findings

### 8. `task-view` comments-timeline says "events where `references.action_ids` includes" but `references` is spread to root

> **Resolved.** Fixed the query path in both `design.md` Open Question #3 and `spec.md` Open Question #3: `references.action_ids` → `action_ids` (references spread to event-doc root by the events module's `new-event` routine, so the query path is `action_ids`). Added a parenthetical explaining why in design.md.

[ui/design.md:106-108](designs/workflows-module/ui/design.md) and [ui/spec.md:67-68](designs/workflows-module/ui/spec.md): task-view's comments timeline reads from events filtered by `references.action_ids` includes the current `action_id`.

But the engine sub-design's references write contract says references are spread to doc root (no `references` key on the stored doc). The events module follows the same shape — see [modules/events/api/new-event.yaml:9-25](../../../../modules/events/api/new-event.yaml). The actual query path is `{ action_ids: <current_action_id> }`, not `{ references.action_ids: <current_action_id> }`.

Fix: change `references.action_ids` to `action_ids` in both files. The reference is spread to doc root by the events module's `new-event` routine.

### 9. `display_order` is a workflow-level field but `actions-on-entity` says "iterates returned workflows in `display_order`"

> **Resolved.** Updated the iteration rule in both `design.md` and `spec.md`: workflows are sorted by `display_order` ASC primary, with `created.timestamp` DESC as tie-breaker (newest first). This matters when an entity carries multiple instances of the same workflow type — e.g. a `lead` with both a historical and a current `onboarding` workflow. Newest-first matches the "current state at the top" convention also used by status arrays (`status[0]` is the current stage).

The design says workflows are sorted by `display_order` ([ui/design.md:140](designs/workflows-module/ui/design.md)). The engine's schema has `display_order` on workflow docs. But how does `display_order` map onto multiple instances of the same workflow type? If a `lead` has two `onboarding` workflows (e.g. one historical, one current), do they get the same `display_order`?

This is a corner case the UI sub-design doesn't address. Worth a one-line note: `display_order` is per-workflow-type (set in workflow YAML); ties between same-type instances are broken by `created.timestamp` (newest first or oldest first — pick one).

### 10. `actions-on-entity`'s "Restricted" tile is an Open Question — but v1 hides

> **Resolved.** Aligned the two references: the "states to handle" entry now commits explicitly to "v1 commits to 'hide'; a future 'Restricted' tile UX is a v1.x decision," and the Open Questions list drops the "Restricted tile" mention (now just covers the completed-workflow tile UX and the workflow-header milestone label). No conflicting language.

[ui/design.md:172](designs/workflows-module/ui/design.md): _"v1 default: hide."_ Decision 3 line 188 (Open Questions): _"completed-workflow collapsed-tile UX detail — exact look-and-feel of the collapsed tile, the 'Restricted' tile for fully access-restricted workflows."_

These two say different things — v1 hides; the Open Question says "Restricted tile" is undecided. Pick one. If v1 hides, drop "Restricted tile" from the Open Questions list and leave it for v1.x. If v1 shows a tile, specify the shape now.

Fix: align — drop "Restricted tile" from Open Questions; commit to "hide" for v1; the future tile UX is a v1.x decision.

## Open questions raised by this review

1. **Per-action template override** (finding #5): defer or specify. Recommendation: drop from v1.
2. **Multi-instance same-type workflow ordering** (finding #9): pick a tie-breaker (newest first or oldest first).
3. **Component vs page reference for layout chrome** (finding #4): confirm the layout module's component name (`page` is the most likely; verify in [modules/layout/module.lowdefy.yaml](../../../../modules/layout/module.lowdefy.yaml)).

## Next steps

Resolve via `/r:design-action-review workflows-module/ui`. The substantive items are #1 (`onInit` vs `onMount`), #4 (layout chrome reference is wrong), #5 (per-action template override), and #7 (`_user: profile.roles` is wrong). The rest are clarifications.
