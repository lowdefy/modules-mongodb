# Part 02 — Dynamic module page exports

**Status: ✅ Resolved upstream** — but via a different mechanism than this design proposed. Rather than adding a resolver-emit channel for `exports.pages`, the upstream PR ([changeset `feat-modules-remove-exports`](../../../../../lowdefy/.changeset/feat-modules-remove-exports.md)) **removed the static `exports:` block from `module.lowdefy.yaml` entirely**. Modules can now generate page / connection / API endpoint ids dynamically via `_build.array.map` over `_module.var`, or via resolver functions, without declaring them upfront. Cross-module id validation moved to post-resolve checks (`validateLinkReferences`, `buildRequests`, `buildMenu`, new `validateCallApiRefs`). Existing `exports:` blocks are silently ignored.

**Downstream impact for the workflows module:** Parts 12 (resolver-pages) and 13 (resolver-apis) no longer need a resolver-emit channel — per-action pages and `update-action-{action_type}` endpoints can be emitted directly from the manifest's `pages:` / `api:` arrays using `_build.array.map` over `_module.var: workflows_config`. Part 20b's "resolver-channel manifest entries" framing should be re-scoped to plain `_build.*` usage.

---

**Source rationale:** (new — not in concept design; surfaced during decomposition). **Layer:** foundational. **Size:** S. **Repo:** upstream `@lowdefy/build` (or wherever module loading lives).

## Goal

Let a module export pages that are emitted at build time by a resolver rather than declared statically in `module.lowdefy.yaml`'s `exports.pages` list. Without this, the workflows module's `makeActionPages` resolver (part 12) cannot produce per-action pages whose ids are derived from app-supplied workflow YAML.

## Problem

Today, `exports.pages: [{ id }, ...]` is a static array. The build wires those page YAML files into the app's page tree. For the workflows module, the set of pages depends on the consuming app's `workflows_config` var:

- `lead-onboarding-qualify-edit`
- `lead-onboarding-qualify-view`
- `lead-onboarding-send-quote-edit`
- ...one per (workflow_type, action_type, verb) combination

These ids are unknowable at module-publish time. They emerge per app, per build, from the user's YAML config.

## In scope

- A resolver-emit channel for `exports.pages`. Concrete shape TBD during implementation; candidates:
  - `exports.pages` accepts an entry of the form `{ resolver: <path>, vars: { ... } }` whose return is `[{ id, definition }, ...]`.
  - A parallel `exports.resolvers.pages: [{ resolver, vars }, ...]` list that runs at build and gets merged into the page tree.
- Resolver receives the module's resolved vars (so it can read `app_name`, `workflows_config`) and must return one or more concrete page definitions.
- Emitted pages auto-scope under the module entry id (same as static page exports).
- Build fails loudly if a resolver returns malformed page definitions.

## Out of scope / deferred

- **Dynamic Api exports.** The workflows module's `update-action-{action_type}` endpoints have the same shape problem. Confirm during implementation whether the same channel handles `exports.api`, or whether part 13 (resolver-apis) needs its own equivalent extension. If both reuse one mechanism, fold into this part; otherwise call the API side out as a separate upstream change.
- **Dynamic exports for components, connections, menus, enums.** Not currently needed by the workflows module.
- **Hot reload of dynamic exports** during dev. Treat as a follow-up; v1 regenerates on rebuild.

## Depends on

Nothing in the workflows module. Pure upstream extension.

## Verification

- Unit tests in the build package:
  - Static `exports.pages` continues to work unchanged.
  - A module declaring a `resolver`-style entry runs the resolver at build, returns a list of page definitions, and those pages appear in the app's page tree with the correct entry-id scope.
  - Malformed resolver returns fail the build with a clear message.
- Integration smoke: a fixture module that resolver-emits two pages per app `var`-driven config gets both pages in the built app.

## Open questions

- **Exact shape of the extension** — `exports.pages: [{ resolver, vars }]` inline vs. `exports.resolvers.pages`. Pick during implementation; whichever picks fewer breaking changes to existing module manifests.
- **Whether `exports.api` rides on the same channel.** Likely yes (the workflows module needs both). Confirm before merging.
- **Resolver execution order** when a module mixes static + dynamic page exports. Lean: static first (deterministic), dynamic second.

## Contract to neighbours

- **Part 12 (resolver-pages)** consumes this primitive to emit per-action pages.
- **Part 13 (resolver-apis)** consumes either this primitive or a parallel `exports.api` resolver channel to emit `update-action-{action_type}` endpoints. Confirm during implementation.
- **Part 20 (module-manifest)** declares the resolver-channel entries in `module.lowdefy.yaml`.
