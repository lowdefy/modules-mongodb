# Review 1 — Spec mismatches and broken-API assumptions

## Spec violations

### 1. Hook routines live inline on the action YAML, not as separate API files

> **Resolved.** Hook routine *content* still lives in sibling YAML files (under `onboarding/hooks/`, not `onboarding/api/`), but each is pulled into the action's `hooks:` block via `_ref` so the resolver sees one inline routine array at build time. Rewrote proposed-change item 2, the "Hook routines" section (renamed from "Hook API files"), and the file-list entry to show the `_ref` pattern. Added a note that `on_complete` follows the same shape on `action_groups[]`.

[Proposed change item 2](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md#proposed-change) ("Author three pre/post hook YAML files under `apps/demo/modules/workflows/workflow_config/onboarding/api/`: `qualify-pre-submit.yaml`, …, wire each into its action's `hooks:` block") contradicts the canonical spec and the implemented resolver.

[`action-authoring/spec.md` line 16](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md): *"Hook routines live **inline** on the action YAML's `hooks:` block (and group `on_complete:` routines live inline on the workflow YAML's `action_groups[]`). The resolver emits the corresponding Lowdefy Apis at build time — authors do not write separate hook Api files."*

The shipped resolver enforces this contract — [makeWorkflowApis.js:11–18](makeWorkflowApis.js) reads `hooks.{interaction}.{phase}.routine` off the action and emits `update-action-{type}-{interaction}-{phase}` as a generated Api with auto-derived id and auth. Test fixtures in [makeWorkflowApis.test.js:9–13](makeWorkflowApis.test.js) carry the inline-routine shape literally.

There is no on-disk hook-API file in the existing implementation. There can't be — the resolver doesn't read them.

The `submit-pipeline/spec.md` line 154 reference the design points at ("Values are Lowdefy Api endpoint ids; engine invokes them via the call-api primitive") describes the **runtime** lookup. The engine resolves whatever id is in the baked-in `hooks:` map at runtime; that id happens to be one the resolver generated from the same inline routine at build time.

**Fix.** Drop proposed-change item 2 entirely. Move the three hook routines inline into `qualify.yaml` and `send-quote.yaml` under their `hooks:` blocks. Delete the `onboarding/api/` directory from the file list. The "Hook API files" section under "Worked-example demo extension" needs the same rewrite — show the inline `hooks.submit_edit.pre.routine: [ ... ]` shape on the action YAML.

Same fix applies to the `g1 → g2` `on_complete` callback referenced in [Verification step 5](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md#verification): it goes inline on `onboarding.yaml`'s `action_groups[].on_complete.routine`, not as a separate file.

### 2. Per-action `link` is a structured `{ pageId, urlQuery }` object, not a flat string

> **Resolved.** Rewrote the "Onboarding actions" preamble to specify `link: { pageId, urlQuery }` and added a concrete worked example on `qualify.yaml`'s `status_map`. The example uses `pageId: { _module.pageId: { id: <resolver-emitted-page-id>, module: workflows } }` so the link resolves to the right page id at build time. Documented the rule for which statuses get a link (active statuses point at the verb-appropriate page; terminal statuses drop `link:`). Lead-view bullet rewritten to match.

[Files touched / added](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md#files-touched--added) ends with "the new actions surface automatically once their `status_map` entries set `link` **strings**". The canonical spec example at [action-authoring/spec.md:385–388](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md) sets `link:` as:

```yaml
link:
  pageId:
    _module.pageId: { id: onboarding-qualify-edit, module: workflows }
  urlQuery: { action_id: true }
```

And the consuming block expects the same — [ActionSteps README line 75–84](modules-mongodb/plugins/modules-mongodb-plugins/src/blocks/ActionSteps/README.md) documents `action.link` as `{ pageId, urlQuery, input?, newTab?, disabled? }`.

**Fix.** Rewrite the lead-view edit description and the per-action `status_map` description to specify `link: { pageId, urlQuery }`. Worth showing one concrete `status_map` block on `qualify.yaml` so authors copy the right shape.

## Codebase claim that doesn't hold

### 3. The denormalization the design depends on is broken

> **Resolved.** Folded the fix into 20b as proposed-change item 4 + a "Per-status projection fix" section. Engine-side work (sibling branch) writes `{app_name}: { message, link }` onto the action root at every status transition by traversing `status_map`. The API-side fix in 20b is a three-operand `_string.concat: [$, _module.var: app_name, .link]` that builds the Mongo projection string `"$demo.link"` at build time. Same swap in all three operational APIs. Engine-side write listed as a Runtime-only dep; added a "Per-status projection" verification step.

[Proposed change item 3](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md#proposed-change) and [Files touched / added](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md#files-touched--added) both rely on the WIP claim that `get-entity-workflows` denormalizes per-status `message` / `link` at the lookup layer, so "the new actions surface automatically".

The on-disk shape doesn't denormalize anything — it sets the action's `link` (and `message`) to a literal string built by string concatenation:

```yaml
# modules/workflows/api/get-entity-workflows.yaml:62–73
message:
  _string.concat:
    - $apps
    - .
    - _module.var: app_name
    - .message
link:
  _string.concat:
    - $apps
    - .
    - _module.var: app_name
    - .link
```

This concatenates four operands. `$apps` is treated as a literal string (Lowdefy `_string.concat` doesn't interpret `$apps` as a Mongo projection); even if it did, there is no `apps` field on the action doc — the relevant field path is `status_map.{status}.{app_name}.{message|link}`, and the `{status}` segment is dynamic. The current YAML produces a constant string like `"apps.demo.link"` on every action, regardless of status.

The WIP commit message ([`5352646`](../../../../../../tree/5352646)) describes the intent ("Push action shaping … into the $lookup pipelines: the host page no longer needs status_map / nunjucks gymnastics, just `_state: actions_list.$.message / .link`") but the implementation doesn't match it. The same broken shape exists in `get-workflow-overview.yaml` and `get-action-group-overview.yaml` per the commit body.

**Fix.** This is bigger than 20b's scope. Either:
- **(a)** Add an explicit "Fix the denormalization in `get-entity-workflows` / `get-workflow-overview` / `get-action-group-overview`" item to 20b's proposed changes, scoped to one new sub-stage that does `$arrayElemAt: [{ $objectToArray: { $getField: { field: { $concat: ['status_map.', '$status'] }, … } } }, 0]` or whatever the actual MongoDB shape is. Worth a spike to confirm the right operator path.
- **(b)** Spin out the API fix into its own small follow-up part (likely sub-part of 18 or 25 — they own these APIs) that 20b lists as a runtime dep. 20b's verification then explicitly waits for that part to land before walk-through step 1 passes.

Either way, the design must stop claiming the new actions "surface automatically" — they currently don't.

## Minor

### 4. `key: device` mis-states the spec

> **Resolved (auto).** Table row for `proof-of-installation` rewritten: `key: $device_serial` as a symbolic placeholder, concrete values supplied at spawn time via the `start-workflow` `actions:` payload. Cross-link points to the action-authoring spec's "Instanced actions" section.

[Onboarding actions table row 4](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md#onboarding-actions-replaces-the-three-trackers) says `proof-of-installation` has "`key:` set to `device`". The spec ([action-authoring/spec.md:327](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md)) uses `key: $device_id` as a *symbolic placeholder* — the concrete value is supplied at spawn time via the `start-workflow` `actions:` payload.

The design's later modal description ("one `{ type: proof-of-installation, key: <serial>, ... }` per row") is correct. The table entry should match — either drop the literal `device` (since `key:` is a placeholder marker, not a fixed value) or say `key: $device_serial`.

### 5. Lead-view modal description omits the existing button removal

> **Resolved (expanded scope).** Beyond the original ask: rather than the lead-view modal inlining the same refetch pair, 20b now exports a new `entity-workflows-refetch` component under `modules/workflows/components/` (added as proposed-change item 5; registered under the manifest's `components:` block; documented in the module README). The lead-view modal `_ref`s it after `start-workflow` returns, replacing the 20a inline pair. Lead-view bullet also calls out that the new button preserves the existing `visible: { _eq: [{ _state: entity_workflows.length }, 0] }` guard so a second onboarding workflow can't be started on the same lead. `actions-on-entity.onMount` still inlines the same pair for now — refactoring it to consume the new component is an obvious follow-up but not load-bearing for 20b.

[Proposed change item 3](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md#proposed-change) says "Replace the existing 'Start onboarding' button … with a modal." The button on disk ([apps/demo/pages/leads/lead-view.yaml:157–199](lead-view.yaml)) has a `visible:` guard that hides it once `entity_workflows.length > 0`, plus a `refetch_entity_workflows` follow-up sequence. The modal replacement needs to:

- Preserve the `visible:` guard (or relocate it to the new button).
- Preserve the post-start refetch sequence (otherwise `actions-on-entity` won't re-render).

Worth a one-line callout in the lead-view bullet so the implementer doesn't drop either.

### 6. `Implemented` section overstates Part 02's status

> **Resolved (auto).** Softened both references to part 02. "Implemented" section now says the framework fix solves the primary problem; whether remaining scope is worth pursuing is for the 20b closeout audit. "Out of scope" entry renamed "Part 02 audit" with the same posture.

[Implemented — manifest dynamic surface](modules-mongodb/designs/workflows-module/parts/_completed/20b-module-manifest-dynamic/design.md#implemented--manifest-dynamic-surface) closes with "Part 02 itself is now effectively redundant for this module; implementation-plan.md wave 0 should retire it during the 20b closeout."

The framework fix in [`574960a`](../../../../../../tree/574960a) made `_ref: { resolver }` paths resolve against the module root. That solves the *path resolution* problem, but [part 02's design](modules-mongodb/designs/workflows-module/parts/02-dynamic-module-pages/design.md) covers a broader scope — including whether `exports.pages` should ride a dedicated channel and how the build represents dynamic module pages in `exports`. Retiring part 02 wholesale should be confirmed against its actual scope, not assumed because the manifest now compiles.

**Fix.** Soften the retirement claim to "part 02's primary problem is solved by 574960a; remaining scope (if any) should be audited during 20b closeout" and let the closeout decide rather than the design.

### 7. `track-installation`'s status_map needs a child-workflow-id link

> **Resolved.** `track-installation.status_map.{status}.demo.link` points at the child `installation` workflow's `workflow-overview` page. Since `installation` ships with a single `install-step` action, the workflow-overview becomes the de-facto install-step view; users click through to `task-edit` from the action card and save status changes through standard module chrome (no demo-only driver page needed). The link's `urlQuery.workflow_id: $child_workflow_id` references an engine-written action field, so lighting up at runtime depends on the same engine-side projection that powers the per-status `{app_name}.link` write — broadened the runtime-deps callout to cover both `{app_name}.{message|link}` and runtime-field `urlQuery` projection. Walk-through step 8 rewritten to show the new click-through path.

The walk-through step 8 ("transition its `install-step`, observe the parent tracker action fan-up") relies on the tracker subscription propagating a status to `track-installation`. For the demo UI to make this clickable, `track-installation.status_map.{status}.demo.link` needs to point at the child workflow's `workflow-overview` page using `child_workflow_id` — which the engine only writes after `start-workflow` runs.

The design doesn't say how this link is constructed. Either:

- Hard-code the child workflow's `workflow-overview` URL with `urlQuery.workflow_id` projected from `tracker.child_workflow_id` (whatever projection idiom the API layer exposes), or
- Drop the link from `track-installation` (the tracker action becomes display-only in the demo, walk-through step 8 stays as a no-click observation).

Worth resolving before the action YAML gets authored.
