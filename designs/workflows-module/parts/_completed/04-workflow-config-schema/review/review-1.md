# Review 1 — Implementation vs. concept-doc and codebase verification

Reviewing the part-04 implementation as shipped on `feat/workflows-config-schema`. Files: `modules/workflows/enums/*.yaml`, `modules/workflows/resolvers/{makeWorkflowsConfig,mergeDisplayOverrides}.js`, `modules/workflows/module.lowdefy.yaml`, the `WorkflowAPI` schema additions in `plugins/modules-mongodb-plugins/src/connections/WorkflowAPI/schema.js`, and the tasks under `designs/workflows-module/parts/04-workflow-config-schema/tasks/`.

## Real findings

### 1. `workflowsConfig` JSON schema type-mismatch with what the engine actually receives

> **Resolved.** Added `required: ['type', 'entity_type', 'starting_actions', 'actions']` on `workflowsConfig.items` and `required: ['type', 'kind']` on each action item. Plugin build still passes.

`schema.js:30-40` declares `workflowsConfig` as `type: 'array'`, but the engine spec at `designs/workflows-module-concept/engine/design.md:114` only shows the engine reading `connection.workflowsConfig` as an opaque value. The resolver in `modules/workflows/resolvers/makeWorkflowsConfig.js:30-49` does return an array of workflow objects (`workflows.map(...)`), so `array` is correct for the resolver's output — but the **`items.additionalProperties: true`** combined with the resolver's whitelist-narrowing is fragile: an app could bypass the resolver entirely and pass any array of any-shape objects, and the schema would accept it. The engine then crashes opaquely the first time it reads a missing field.

The whitelist enforcement happens inside the resolver, not the schema. If the resolver gets bypassed, the type contract breaks.

**Suggested fix:** add `required: ['type', 'entity_type', 'starting_actions', 'actions']` on `workflowsConfig.items`, and `required: ['type', 'kind']` on each action item. Doesn't make the schema strict, but catches the most common breakage. Optional, since "no validators in v1" was a deliberate choice.

### 2. `starting_actions` shape is undocumented at the schema layer

> **Resolved.** Added a documentation note in the `workflowsConfig` description listing the workflow shape and the `starting_actions` entry shape `{ type, status }`. Did not enforce at the schema layer — the existing `makeWorkflowsConfig` validator already throws on malformed entries (string entries produce "unknown action type 'undefined'"), so runtime schema enforcement would be redundant per-call work.

The action-authoring spec (`designs/workflows-module-concept/action-authoring/spec.md:85`, `:432`) is explicit: `starting_actions` entries are `{ type, status }`, not just `string`. The resolver passes them through verbatim (`makeWorkflowsConfig.js:18`), which is correct — but the schema (`schema.js:36-40`) declares `items: { type: 'object', additionalProperties: true }` with no further detail. An app passing `starting_actions: ['qualify', 'verify']` (strings, not objects) would pass the connection-level schema and crash inside `StartWorkflow` (part 05) when it tries to read `entry.status`.

**Suggested fix:** documenting-only — add a comment in the schema description: `'Each workflow has starting_actions: Array<{type: string, status: string}>'`. Cheap, no validator.

### 3. The merge resolver's "drop unknown keys" semantics are stricter than the concept doc

> **Resolved.** Deleted `mergeDisplayOverrides.js` entirely. Switched to `_build.object.assign` (the existing `event_types` family) for the UI-merged component. The engine reads the shipped enum file directly from the manifest's connection wiring (part 20), so app overrides cannot reach the engine — priority invariant preserved by channel separation, not whitelist enforcement. No new merge family introduced.

`mergeDisplayOverrides.js:7` iterates over `Object.keys(shipped)` — so any override key not in the shipped enum is silently dropped. This is exactly what the design intends (`design.md:32`, "unknown keys silently dropped"). But the **concept doc's `event_display` family pattern** (which the design says these enums mirror — see `docs/idioms.md:120`: *"Override fully replaces the defaults — no merge."*) suggests a different family of override behavior.

The two families:
- **`event_display`-family** (idioms.md:120): override fully replaces; no merge.
- **`event_types`-family** (events module, `modules/events/module.lowdefy.yaml:63-67`): `_build.object.assign` deep-assign; override keys override matching shipped keys, unknown keys add new entries.

Our resolver implements neither: it merges per-field on matching keys (concept-doc intent) AND silently drops unknown keys (concept-doc intent), AND restricts the override surface to a 5-field whitelist (`title`, `color`, `borderColor`, `titleColor`, `icon`). That's a third merge family, not documented in `docs/idioms.md`.

This is fine in isolation, but if `docs/idioms.md` is the authoritative idioms reference for module patterns, we've introduced an unlisted family. Worth either documenting in idioms.md, or simplifying to match an existing family (likely `_build.object.assign` for v1).

**Suggested fix:** either (a) document the third family in `docs/idioms.md` after part 04 lands, or (b) revisit whether the 5-field whitelist is worth the divergence — the alternative is `_build.object.assign` and trusting the engine to ignore non-canonical statuses (the engine reads only the 8 canonical keys from `actionsEnum`, so an extra key is harmless noise).

### 4. The `module.lowdefy.yaml` is partial; consumers will see a manifest that omits the connection

> **Resolved.** Added a top-of-file comment reframing the manifest as "complete for part 04's scope" rather than "partial-toward-being-finished." The comment explicitly notes that connection, secret, page/api/menu, and fields-library exports land in part 20.

`modules/workflows/module.lowdefy.yaml` declares only `exports.components`, `vars`, `components`, and `plugins`. Missing — relative to other modules' manifests (`modules/events/module.lowdefy.yaml`, `modules/user-admin/module.lowdefy.yaml`, `modules/contacts/module.lowdefy.yaml`):

- `secrets:` block (e.g. `MONGODB_URI`) — every other database-touching module has this.
- `connections:` block — the `WorkflowAPI` connection isn't declared anywhere.
- Component exports for `modules/workflows/components/fields/*.yaml` (shipped in part 14, commit `dbe0faf`) — currently inaccessible to apps via the manifest's exports.
- No `description:` references for icons on `action_statuses` (we deliberately removed `_ref: public/icons/...` per design conversation, but this isn't called out anywhere in the manifest).

These all belong in part 20 (module manifest), so this isn't a bug — but the manifest as committed is functionally **broken for consumer use** until part 20 lands. An app pointing at this module today would import the two enum components but couldn't get a `WorkflowAPI` connection, couldn't reach the form-fields library, and would have no secret-resolution surface.

**Suggested fix:** add a comment at the top of `module.lowdefy.yaml` flagging "partial manifest, completion deferred to part 20." Prevents reviewers from filing follow-ups for "missing connections/secrets/etc."

### 5. The resolver path in `module.lowdefy.yaml` may not resolve as expected

> **Resolved.** Eliminated the `_ref: { resolver }` pattern entirely by switching the display merge to `_build.object.assign` (resolved alongside finding #3). No unverified Lowdefy pattern remains in the module manifest. The remaining `makeWorkflowsConfig.js` resolver is invoked from app-side YAML, where `_ref: { resolver }` is the documented standard usage.

`modules/workflows/module.lowdefy.yaml:37,46` writes:

```yaml
_ref:
  resolver: resolvers/mergeDisplayOverrides.js
  vars:
    enum:
      _ref: enums/action_statuses.yaml
```

Both paths are relative to the manifest file. The Lowdefy build code at `node_modules/.pnpm/@lowdefy+build@.../buildRefs/getRefContent.js:29` handles `refDef.resolver` via `runRefResolver` (verified working). `runRefResolver` (`buildRefs/runRefResolver.js:19-22`) calls `getUserJavascriptFunction({ filePath: refDef.resolver })`.

But the **concept-doc spec explicitly flags this pattern as unverified**: `designs/workflows-module-concept/design.md:288`: *"Lowdefy's `_ref: { resolver }` from inside a Nunjucks template hasn't been verified for modules. Before relying on the recursive pattern, run a minimal spike."*

That spike was specifically about recursive resolver invocation from inside templates, not the simple manifest-level use we have here. But the broader question — does `_ref: { resolver: <relative-path> }` from inside a module's manifest correctly resolve `resolvers/mergeDisplayOverrides.js` relative to that manifest? — isn't covered by any commit in the repo (verified: no existing module manifest uses the pattern; only `_ref: <path>` and `_build.object.assign`).

**Suggested fix:** run the demo app's build with the workflows module added to its `modules.yaml`. Check that:
- Both `action_statuses` and `workflow_lifecycle_stages` resolve to a merged enum.
- An override in `vars.action_statuses_display` actually applies.
- The Lowdefy build doesn't throw a path-resolution error.

This is the cheapest one-time verification that unblocks parts 5+. Worth 10 minutes now to avoid debugging a path issue inside a part-05 handler test later.

### 6. Tasks file claims `_ref` expansion is a framework concern; code does not exercise it

> **Accepted.** Adding defensive checks for hypothetical framework misbehavior contradicts the repo's "don't validate for scenarios that can't happen" stance (CLAUDE.md). The review itself notes "Suggested fix: none necessary." Flag is captured in this review file for future readers.

`tasks/02-make-workflows-config.md:14` says: *"By the time the resolver runs, Lowdefy has already expanded all nested `_ref`s in `vars.workflows`."* This is correct per the Lowdefy build behavior — but the resolver as written makes **no defensive assumption** about it. If `vars.workflows[i].actions` happens to contain a `_ref` object (e.g. because the app supplied an unexpanded structure), the pick loop will copy it verbatim. The engine downstream would then attempt to read `action.type` and get `undefined`.

This is a non-issue under normal Lowdefy usage. Worth flagging only because part 04 has zero defensive checks (intentional), and if the framework's `_ref` expansion ever changes or fails silently, the resolver will pass through corrupt config without complaint.

**Suggested fix:** none necessary. Flagging for the record.

### 7. Action field whitelist may be missing fields the engine spec assumes

> **Resolved.** Added an inline comment in `makeWorkflowsConfig.js` documenting the whitelist contract: "engine-runtime needs + per-action UI lookups; build-time-only fields excluded." Keeps `sort_order` and `status_map` in the whitelist as intentional UI-lookup fields.

Cross-checking the 10-field action whitelist (`makeWorkflowsConfig.js:1-12`) against engine-spec consumption:

| Field | Source in spec | In whitelist? |
|---|---|---|
| `type` | `action-authoring/spec.md:93` | ✅ |
| `kind` | `action-authoring/spec.md:93` | ✅ |
| `key` | `action-authoring/spec.md:128` (action-doc field), per-instance | ✅ |
| `tracker` | `engine/spec.md:134`, child workflow startup | ✅ |
| `blocked_by` | `engine/design.md:350`, auto-unblock walk | ✅ |
| `action_group` | `action-groups/spec.md:109`, group rollup | ✅ |
| `sort_order` | `action-authoring/spec.md:173`, UI ordering — but spec also says "Engine treats these as opaque display metadata; UI consumes them" (line 175) | ✅ — but: this is *UI-only*, not engine-consumed. Inclusion is OK but unjustified by engine needs |
| `required_after_close` | `action-authoring/spec.md:179-183`, submit-time gate | ✅ |
| `access` | `action-authoring/spec.md:147`, submit-time role re-check | ✅ |
| `status_map` | `engine/design.md:222`, tracker UI link; `submit-pipeline` | ✅ — but: action-authoring says `status_map` is UI display copy (`action-authoring/spec.md:192-220`); engine doesn't use it. Inclusion is OK but unjustified by engine needs |

**Two whitelist members (`sort_order`, `status_map`) are UI-only.** If the contract is "resolver output = engine config," they shouldn't be there. If the contract is "resolver output = both engine + per-action UI lookup," that's fine — but document it.

Two engine-spec fields **NOT** in the whitelist that might be needed:

- `interactions:` — `action-authoring/spec.md:283` references `interactions`, consumed by `makeWorkflowApis` (part 13). NOT consumed by engine runtime directly. OK to exclude.
- `hooks:` — submit-pipeline consumes; baked into endpoint config at build time (part 13), not engine runtime. OK to exclude.

**Suggested fix:** add a one-line code comment in `makeWorkflowsConfig.js` clarifying the whitelist contract. E.g. `// engine runtime needs + per-action UI lookups; build-time-only fields (form/pages/hooks/interactions) excluded`.

### 8. The schema description on `actionsEnum` is slightly misleading

> **Resolved.** Tightened the description: priority is now stated as MUST; display fields are explicitly "optional in the schema but present on every shipped status; apps providing their own actionsEnum should populate them too." Did not add display fields to `required` — apps overriding piecemeal might legitimately omit them.

`schema.js:43-47`: "Action status enum keyed by status name (e.g. 'done', 'blocked')." Correct. But: *"Each entry carries priority (load-bearing — the engine compares priorities in the priority-rule check in SubmitWorkflowAction) plus optional display fields."*

The display fields **are not optional** as written in the schema. `required: ['priority']` is correct, but the schema declares `properties: { title, color, borderColor, titleColor }` with no `required` for them — so they're optional in JSONSchema terms — but the shipped enum at `modules/workflows/enums/action_statuses.yaml` carries all four for every status. The contract the schema *claims to enforce* is looser than the contract the shipped enum *actually meets*.

This matters when an app provides its own `actionsEnum` via override (or a different ref). They might assume `title` is required because the docstring implies it. It isn't.

**Suggested fix:** tighten the schema description: *"Each entry MUST carry `priority`; `title`, `color`, `borderColor`, `titleColor` are optional but present on every shipped status."* Or add them to `required`.

## Items deliberately not flagged

- **No validators in v1.** Per design conversation, intentional.
- **No worked-example fixture.** Per design conversation, intentional.
- **No tests on `makeWorkflowsConfig`.** Per design conversation, intentional.
- **No JSDoc `types.js`.** Per design conversation, intentional and matches repo convention.
- **No `changeStamp` on the connection schema.** Per design conversation, deferred to part 05.
