# Review 1 — Module Surface sub-design

Critical review of `designs/workflows-module/module-surface/design.md` and `spec.md`. Focus on the four-API surface, the `submit-action` routine, and the manifest shape. Verified against the actual modules-mongodb codebase.

## Critical findings

### 1. `notifications.send-notification` API contract is mischaracterized

> **Resolved as proposed.** Three edits: (1) tightened the `event.notifications:` comment in the Decision 4 payload spec to frame the call as a hook ("send-notification InternalApi … No-op when no send_routine is wired") with a pointer to a new section; (2) added a new "Notifications dispatch contract" sub-section under "How `submit-action` runs" stating explicitly that `send-notification` is `type: InternalApi` with app-supplied `routine: _module.var: send_routine`, that the `{ event_ids }` payload shape is a workflows-module convention (not a notifications-module enforcement), and that the dispatch is silently no-op when no `send_routine` is wired; (3) mirrored the same updates into `module-surface/spec.md`'s payload comment and added a "Notifications dispatch is a hook, not a contract" paragraph. The silent-no-op behaviour is accepted as v1 — apps that want delivery audit wire it into their `send_routine` themselves.

Decision 4 line 235-239 documents `event.notifications: true` causing `submit-action` to call notifications with `{ event_ids }`, framing it as a payload contract. Verified against [modules/notifications/api/send-notification.yaml](../../../../modules/notifications/api/send-notification.yaml:1-4):

```yaml
id: send-notification
type: InternalApi
routine:
  _module.var: send_routine
```

`send-notification` is `type: InternalApi` (not `Api`) and its routine is **entirely app-supplied** via `_module.var: send_routine`. The notifications module's manifest ([modules/notifications/module.lowdefy.yaml:16-22](../../../../modules/notifications/module.lowdefy.yaml)) declares `send_routine` as a var the app fills in, with the description _"Receives event_ids in the payload."_ — a documented convention, not a contractual API.

This matters two ways:

- The `type: CallApi` step in `submit-action`'s routine (Decision 4 line 357-366) calls `endpointId: send-notification` with `payload: { event_ids: [...] }`. This works at the wire level — `CallApi` doesn't care what the routine does — but the design's framing of "the API accepts only `{ event_ids }`" is wrong. The contract is whatever the app's `send_routine` consumes, by convention `event_ids`.
- A consuming app that hasn't supplied a `send_routine` gets a no-op `send-notification` call. The design doesn't mention that the dispatch is no-op when no routine is wired.

Fix: rewrite the "notifications" framing in Decision 4 to state explicitly that `send-notification` is a hook (`type: InternalApi`, app-supplied routine via `_module.var: send_routine`, convention is to accept `event_ids` in the payload). Note that when no `send_routine` is wired in the consuming app, the dispatch is a no-op.

### 2. JS resolvers from `module.lowdefy.yaml` are a new pattern with no repo precedent

> **Rejected.** Trust the upstream Lowdefy module-system spec — the resolver invocation is documented at `lowdefy-design/designs/module-system/technical-decisions.md`, and resolvers are module-internal (never written by app authors). No design change. If the upstream capability turns out to differ from the spec during implementation, the failure surfaces via a normal `lowdefy build` error and gets resolved then.

Decision 1 line 168 cites _"Lowdefy's walker resolves `_ref: { resolver: ... }` inside `module.lowdefy.yaml`"_ and points at an external `lowdefy-design/designs/module-system/technical-decisions.md` doc. Verified against this codebase:

- Zero modules currently ship JS resolvers (`grep -rn "resolver:" modules/*/module.lowdefy.yaml` returns nothing).
- No `modules/*/resolvers/` directories exist.
- Every existing module ships static pages (companies, contacts, user-account, user-admin) or no pages at all.

This isn't wrong — the upstream Lowdefy capability is real per the cited doc — but the workflows module is the first to use it. The design should call this out as a v1 milestone with its own verification step (similar to the engine sub-design's "Dual-runtime build" treatment). Concretely: build a minimal resolver, run `lowdefy build`, confirm the resolver fires and the generated pages are discoverable in the dist/.

Fix: add a "Resolver pipeline is a new pattern" note in module-surface Decision 1 (or a Risk entry) committing to verify resolver invocation with a build spike before the workflows module's other resolvers ship.

## Important findings

### 3. `vars.workflows_config` accepts an array but the design's type is overstated

> **Resolved — both halves applied.** (1) Tightened the var description in both `module-surface/design.md` and `spec.md`: now references the action-authoring "Workflow YAML" schema and notes that `makeWorkflowsConfig` validates the shape at build time. (2) Added a new "`makeWorkflowsConfig` — runtime config + build-time validation" sub-section to `action-authoring/design.md` Decision 5 with the full per-workflow / per-action invariant list (required fields, uniqueness of action `type` within a workflow, `starting_actions` resolution, `status_map` keys against the canonical enum, `blocked_by` resolution, `access.<app_name>` verb-list validity, reserved-key collisions on static `references:` blocks). Mirrored the rules into `action-authoring/spec.md`'s build-time-validation section. The single source of validation rules now lives with the resolver that enforces them.

Decision 1 line 75-80 declares:

```yaml
vars:
  workflows_config:
    type: array
    required: true
    description: >
      The app's workflow YAML — typically `_ref` to the app's
      `workflow_config/workflows.yaml`.
```

Existing modules' array-typed vars (e.g. layout's `menu` items, events' `change_stamp`) are simple shapes. `workflows_config` is far richer — it's an array of workflow definitions, each containing nested action arrays, nested `starting_actions`, etc. The `type: array` declaration is technically true but uninformative for authors; there's no schema for what the array elements must contain.

Fix: tighten the description to point at action-authoring's "Workflow YAML" section as the schema. Optionally, the resolver pipeline's `makeWorkflowsConfig` should validate the var's element shape at build time and reject with a clear "missing required field X on workflow Y" error rather than failing somewhere deeper. (Build-time validation is already proposed for action kinds; extending it to workflow-level required fields is purely additive.)

### 4. `:set_state:` and `:return:` are valid but the design doesn't explain them

> **Resolved.** Added a one-line note above the `submit-action` routine code block explaining the directive syntax (`:set_state:` assigns per-request state read via `_state:`; `:return:` is the routine return shape) and pointing at `modules/contacts/api/update-contact.yaml` as a worked example. No design change; pure documentation.

Decision 4 line 307-372 uses Lowdefy routine directives `:set_state:` and `:return:`. Verified against the codebase — these are real and widely used (activities, contacts, events, files, companies all use them).

But readers of this design who don't already know Lowdefy would be lost. The design assumes familiarity with the routine-directive syntax (`:foo:` vs `id:` step) without explanation. This is a minor framing issue, not a correctness one — the audience is Lowdefy authors, so the assumption is defensible.

Fix optional: one-line note pointing at the Lowdefy routine docs or an existing module's API YAML (e.g. `modules/contacts/api/update-contact.yaml`) as a reference.

### 5. `composition error semantics` table has a duplicate-events problem the design under-mitigates

> **Rejected.** No design change. Double-click handling is a page-side concern that doesn't need surfacing in the module-surface contract; the existing "document and accept" stance on retry-induced duplicate events covers v1, and the future stable-`event_id` flow is already on the upgrade path.

Decision 4 lines 384-406 honestly acknowledges that `new_event` and `notify` are not retry-safe ("duplicate events on retry are a known cost"). The proposed mitigation is "document and accept for v1," with a future-stable-id flow as the upgrade path.

This is a defensible v1 call — duplicate events are noise, not corruption. But the design under-mitigates one specific case: **a user double-clicking submit while the network is in flight**, not just a network-blip-recovery retry. The browser may send two requests in flight before the first response returns, both successfully advancing the action through the priority rule (the first call writes `done`; the second call sees `done` and rejects), but both `new_event` calls succeed because they have no idempotency key.

In practice, double-click protection lives in the page (disable submit button on click; show spinner). The design currently doesn't mention this — the page-side responsibility is implied but not stated.

Fix: add a one-line note under "Composition error semantics" that the form-action page templates (UI sub-design) are responsible for disabling submit during the in-flight period to avoid this class of double-write. The future stable-`event_id` flow is the engine-side fix.

## Minor findings

### 6. The manifest example omits `menus:` export

> **Resolved.** Added a "No `menus:` export" note to Decision 1's "Notes on the surface" section explaining that workflow pages are accessed via deep-links from `actions-on-entity` on the entity's view page, not via top-level navigation. Apps that want a "workflows inbox" or "my actions" page build it themselves against the actions collection. No `menus:` entry needed in the manifest.

Decision 1's manifest sketch (lines 19-72) doesn't include `menus:` in `exports:`. The contacts and companies modules export menus ([modules/contacts/module.lowdefy.yaml](../../../../modules/contacts/module.lowdefy.yaml), [modules/companies/module.lowdefy.yaml](../../../../modules/companies/module.lowdefy.yaml)). The workflows module probably doesn't need a default menu — its pages are accessed via deep-links from `actions-on-entity`, not menus — but the omission is worth a one-line note: "No `menus:` export; workflow pages are accessed via `actions-on-entity` links, not navigation menus."

### 7. `dependencies:` lists `notifications` but the API call is opt-in

> **Resolved.** Updated the "Dependencies on `events` and `notifications`" paragraph in Decision 1's "Notes on the surface" to state explicitly that both are hard dependencies because `submit-action`'s routine references their endpoint ids by name (so the module loader needs them present to wire the cross-module references at build time), even though the `notifications` dispatch is opt-in at call time. Same convention as `events`: every consuming module declares it whether or not every code path logs events.

Decision 1 lines 152-157 declares `notifications` as a hard dependency. But the `submit-action` routine's `notify` step is gated by `event.notifications: true` in the payload (Decision 4 line 358-360). Apps that never dispatch notifications still pull in the dependency.

This is fine if the convention is "always declare dependencies even when conditionally used" — apps add `notifications` to their `modules.yaml` whether or not they use notifications, which matches how `events` works. Worth a one-line note clarifying that the dependency is "required-by-presence" (the routine references the endpoint by id, so the module must be loaded) even though the call is conditional.

### 8. `change_stamp` var default duplicates the events module's default

> **Resolved.** Dropped the `change_stamp` var from both `module-surface/design.md` and `module-surface/spec.md` manifests. Workflow / action doc writes use `_ref: { module: events, component: change_stamp }` per the cross-module idiom ([docs/idioms.md "Change stamps"](../../../../docs/idioms.md)), automatically picking up whatever the app sets on the events module entry. Eliminates the per-module duplicate that would have defeated cross-module consistency.

Decision 1 lines 98-108 declares a `change_stamp` var on the workflows module with the same default shape as the events module's `change_stamp` var ([modules/events/module.lowdefy.yaml:29-38](../../../../modules/events/module.lowdefy.yaml)). The idiom (per [docs/idioms.md "Change stamps"](../../../../docs/idioms.md)) is that modules reference the **events module's** `change_stamp` component (`_ref: { module: events, component: change_stamp }`), not redeclare their own.

If the workflows module declares its own `change_stamp` var, apps overriding the change_stamp at the events-module level would not affect workflow writes — defeating the cross-module consistency the idiom delivers.

Fix: drop the `change_stamp` var from the workflows module manifest. Workflow / action doc writes use `_ref: { module: events, component: change_stamp }` (per the idiom), automatically picking up whatever the app set on the events module entry.

## Open questions raised by this review

1. **Build-time validation of `workflows_config` shape** — finding #3 raises the question of how deep build-time validation should go. The `makeWorkflowsConfig` resolver could enforce required fields per workflow (`type`, `entity_type`, `display_order`, `starting_actions`, `actions`) and per action (`type`, `kind`, plus kind-specific blocks). Bigger surface than the kind-validation already proposed; worth scoping explicitly.

2. **Notifications-module no-op fallback documentation** — finding #1 raises this. When an app composes the workflows module but not the notifications module (or composes notifications without supplying a `send_routine`), the `notify` step in `submit-action` either fails (no endpoint) or no-ops (empty routine). The design should state which.

## Next steps

Resolve via `/r:design-action-review workflows-module/module-surface`. The notifications mischaracterization (finding #1) and the resolver-pattern-is-new framing (finding #2) are the substantive items; the rest are smaller clarifications.
