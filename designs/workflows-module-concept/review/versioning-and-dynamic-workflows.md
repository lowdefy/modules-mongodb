# Versioning and Dynamic Workflows

Working notes from a critique conversation on the workflows-module-concept design. Captures the versioning approach, the alternatives considered, and the deeper architectural axis (build-time vs runtime / data-driven) that the versioning question surfaces.

This is reference material, not a design commitment. The current project commits to **latest-wins + data migrations**; this doc records why, what the alternatives look like, and what triggers would push toward different models.

## The versioning question

When a workflow YAML changes (add an action, change `blocked_by`, rename a status_map key, edit a hook reference), what happens to in-flight workflow instances?

Three coherent approaches; each is a self-consistent design point with its own costs.

### Approach 1: Latest-wins + data migrations — **chosen**

**Model.** Every in-flight instance evaluates against the current definition at all times. There is no notion of "version" on the instance. When a definition change affects in-flight instances, a data migration ships alongside the YAML change to bring instance docs into line.

**Why chosen.** Right call at project scale. Pinned-version models pay overhead (definition stores, version-aware lookups, migration APIs) that only earns its keep with many concurrent in-flight instances of long-running workflows. The current project has neither.

**What makes it robust.** The mechanism is light; the *discipline* is what does the work:

- **`definition_hash` stamped on each workflow instance at `start-workflow`.** Content hash of the resolved workflow definition. Cheap, write-once, never read by the engine at runtime. Buys drift detection: an admin view lists instances whose hash doesn't match the current definition — your "are migrations needed?" report.
- **`declared_action_types: [...]` stamped on the workflow doc at start.** The minimum schema-level pinning. Lets migrations precisely identify what's missing vs current definition without re-parsing the YAML.
- **Co-locate migrations with the workflow YAML change in the same PR.** Splice migrations pattern. Repo convention enforced by review.
- **Change-type taxonomy as a PR checklist** (display-only / additive / behaviour-changing / structural) — see the taxonomy table below.
- **Idempotent migrations with `migrations_applied: [migration_id, ...]` markers** on touched instance docs.
- **Pre-deploy script** that counts affected instances, hash-diffs the definition, outputs the taxonomy bucket. Optional CI gate.

**Change-type taxonomy** (for the PR checklist):

| Change kind                                                  | Migration?                          | Why                                                                                                                                                |
| ------------------------------------------------------------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status_map` message text / colors / titles                  | No                                  | Display-only; reads from latest at render time.                                                                                                    |
| Adding a new optional `view` verb for an existing app        | No                                  | UI affordance; doesn't affect engine state.                                                                                                        |
| Adding a hook (`pre`, `post`) to an existing interaction     | No                                  | Affects future submits only; no past state to migrate.                                                                                             |
| Adding a new action whose `blocked_by` keeps it blocked for old instances | Sometimes                | If new action applies to in-flight, migration spawns the action doc. If it only applies to new instances, document and skip.                       |
| Adding a new required action gated on existing terminal actions | **Yes**                          | In-flight instances may already be `completed`. Migration decides policy: leave them completed, or re-open.                                        |
| Removing an action                                           | **Yes**                             | Orphaned action docs on in-flight instances. Migration: mark `not_required` (preserves audit) or delete.                                           |
| Renaming an action type / `action_group` id / `blocked_by` ref | **Yes**                          | Action docs reference the old name. Migration: rewrite the field on all matching docs.                                                             |
| Changing `blocked_by` of an existing action                  | Sometimes                           | Loosening (removes blockers): in-flight `blocked` actions may need re-evaluation. Tightening: usually moot for past transitions.                   |
| Changing `kind` (form ↔ task ↔ tracker)                      | **Yes — probably new workflow type** | Engine semantics differ per kind; in-flight instances can't reasonably run as another kind.                                                       |
| Changing the form schema (adding fields, removing fields)    | Usually no                          | `form_data` is sparse; missing fields read undefined. Removed-field data lingers — cleanup optional.                                               |
| Changing `access.roles` or per-app `access` lists            | No                                  | Affects future submits only.                                                                                                                       |
| Changing default interaction → status mapping                | No                                  | Affects future submits; past audit history preserved.                                                                                              |
| Changing the FSM transitions table (when FSM lands)          | No                                  | Affects future transitions only. In-flight actions in legal states stay in legal states.                                                           |

**What this approach gives up.**

- Multiple definition versions can't coexist. Every in-flight instance evaluates against the latest.
- Rollback is "deploy old YAML + run inverse migration" — not a one-button operation.
- Long-running workflows accumulate migration debt over their lifetime.
- A/B testing workflow variants requires two workflow types, not two versions.

### Approach 2: Camunda-style version pinning

**Model.** Each instance pins to a definition version at start. New deployments don't affect running instances. Multiple versions coexist in a definition store. Migration is an explicit operation that maps old structure to new.

**Shape it would take in this codebase.**

- **Definition store.** New MongoDB collection `workflow_definitions`, one doc per `(workflow_type, version)`. Holds the resolved definition — actions, `blocked_by` graph, `action_groups`, `status_map`, hook IDs, access rules, transitions table.
- **Deploy step.** When workflow YAML changes, the deploy pipeline writes a new doc to `workflow_definitions` with an auto-incremented version. Old versions stay; new instances pick up the highest.
- **Instance pinning.** Workflow doc carries `workflow_definition_version: N`. Set at `start-workflow`, never changed except by explicit migration.
- **Runtime resolution.** Every `SubmitWorkflowAction` and `get-entity-workflows` reads the definition by `(workflow_type, workflow_definition_version)` from the store. Cache in memory by version key.
- **Migration API.** Admin operation: `migrate-workflow-instance(workflow_id, target_version, action_mapping)`. Validates mapping (old action_type → new action_type), rewrites the instance's action docs, increments version. Dry-run mode for safety.

**Why it doesn't fit cleanly here.** The module's architecture is built on **build-time resolvers** that compile workflow YAML into generated pages and endpoints. Versioning assumes the engine *interprets* a definition at runtime. The two assumptions conflict:

- **`makeActionPages`** emits one page per `(workflow_type, action_type, verb)`. With N versions in flight, you either emit `(workflow_type, version, action_type, verb)` pages (proliferation) or move form schema, status_map, and button bar to runtime resolution (major shift).
- **`makeWorkflowApis`** bakes `hooks`, `event_overrides`, and `interactions` into per-action endpoints as build-time literals. Old versions may reference hook semantics the current build doesn't ship. Same fork: per-version endpoints or runtime-resolved hook lookup.
- **Hook Api references.** `hooks.submit_edit.pre: qualify-pre-submit` points to a Lowdefy Api built from current YAML. In-flight v1 instance calls a v3 implementation. Camunda doesn't have this problem because BPMN script tasks are inline; here, hooks are external Apis.
- **Form components library.** `components/fields/` substitutions run at build time. Old instances against new component shapes can break.

Going to full Camunda-style pinning would require an architectural shift away from build-time resolvers — a much larger redesign than just adding a version field. Camunda's model works because BPMN engines are runtime interpreters; this module is a build-time compiler.

### Approach 3: Per-instance definition snapshot — pragmatic hybrid

**Model.** At `start-workflow`, snapshot the resolved definition (just the behavioural bits — actions list, `blocked_by`, `action_groups`, `status_map`, interaction → status table, hook IDs) onto the workflow doc under `definition_snapshot: {...}`. Engine reads `definition_snapshot` instead of the live `workflowsConfig` for submit-time decisions on this instance.

**What it solves.** In-flight instances are immune to definition churn. Pages stay generated from the current definition (no proliferation). Page renders read instance state from `definition_snapshot` for stale-tolerant display.

**What it still requires.** Commit to additive-only changes for hook Apis and form components (deployed hook Apis never have breaking changes; new behaviour goes in new Api IDs). Migrations rewrite `definition_snapshot` on selected instances — same migration discipline as latest-wins, just with richer state to migrate.

**When to adopt.** This is the natural next step if pressure mounts off latest-wins. Doesn't require the build-time → runtime architecture shift that full Camunda-style pinning would.

## The deeper axis: build-time vs data-driven

The versioning question surfaces a more fundamental architectural axis. Camunda-style pinning fights the codebase because Camunda is *data-driven* and the module is *build-time-compiled*. Understanding this axis matters because it shapes what's possible long-term.

### What "data-driven" means concretely

Not just dynamic forms — the whole resolver pipeline collapses into runtime interpretation:

| Build-time (today)                                                  | Data-driven equivalent                                                          |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `makeActionPages` emits one page per `(workflow, action, verb)`     | One generic `workflows/action-edit?action_id=X` that resolves schema at render  |
| `makeWorkflowApis` emits one endpoint per action with hooks baked   | One generic `update-action` endpoint; engine resolves hooks at runtime          |
| `makeActionsForm` substitutes components into block tree at build   | Runtime form renderer reading form schema from the pinned definition           |
| Workflow YAML in repo → CI → deploy                                 | Workflow definitions in MongoDB; edited via admin UI or API                     |
| Components library (`components/fields/`) substituted at build       | Component registry resolved at runtime                                          |
| Hook references baked into endpoint as literals                     | Hook references resolved at submit time from pinned definition                 |

The keystone is a `DynamicForm` block plugin that takes a form schema as a runtime prop and renders the right inputs. Lowdefy can support this — `AgGridBalham` already does runtime-driven structure (columns are data); `List` and `ControlledList` do runtime-driven repetition. A custom block that interprets the form-components vocabulary at runtime is plausible, just real engineering.

### What data-driven would buy

- **True version pinning is trivial.** Definitions are docs. Old instances point at v1; new at v2. No page proliferation, no endpoint proliferation. No build-time/run-time conflict. This is exactly how Camunda gets away with multi-version coexistence.
- **No build/deploy on workflow changes.** Edit a definition; save; new instances pick it up. Cycle time drops from "PR + CI + deploy" to "save." For workflows that change frequently (sales team iterating on lead-qualification stages, ops team adjusting onboarding steps), this is transformative.
- **Tenant-specific workflows.** Different customers can have different onboarding flows in the same codebase. Today this requires per-tenant module compositions; with data-driven, it's a row in a collection.
- **A/B testing.** Route new instances to definition variant A or B based on any criterion. Native.
- **Visual workflow editor becomes plausible.** Today: "edit the YAML in your IDE." With data-driven, an admin UI for non-developers to author workflows is a build-on-top, not a rewrite.
- **Migration becomes a data operation.** Bulk update on the `workflow_definitions` collection. No deploy.

### What it would cost

The costs are usually understated. Honest accounting:

1. **Engineering effort.** A `DynamicForm` block, a generic action page, a generic submit endpoint, runtime hook resolution, definition validation on save, a component-rendering registry. Weeks to months of work, much of it touching plugin internals.

2. **Loss of build-time guarantees.** Today, a typo in workflow YAML breaks the build. With data-driven, a typo persists silently until someone hits the broken path at runtime. Recouping this means a definition validator that runs on save — basically reimplementing `makeWorkflowsConfig`'s build-time validation as a runtime gate.

3. **Governance layer.** This is the underappreciated cost. Today, workflow changes go through PR review, CI checks, Git history, audit log, dev/staging/prod environment isolation — *all provided for free by the YAML-in-repo model*. With data-driven, you need to recreate:
   - Audit log of definition changes (who edited what, when).
   - Review/approval workflow for definition changes (especially production).
   - Environment isolation (dev definitions don't leak to prod).
   - Rollback ("undo to last week's version").
   - Diff view ("what's about to change?").

   Camunda solves this by *deployment* — the Modeler tool produces a BPMN file, you check it into a repo, CI deploys to the engine. So they get version pinning AND Git review. The cleanest hybrid is the same shape here: workflows authored in YAML in repo, deployed to a `workflow_definitions` collection via a deploy step, instances reference by version. Keep the authoring DX of build-time; get the runtime benefits of data-driven.

4. **Hook execution model.** Today hooks are Lowdefy Apis (YAML, deployed). With data-driven definitions, two options:
   - Keep hooks as deployed Apis (definitions reference them by ID; commit to additive-only changes — Camunda's pattern: "delegates registered at runtime, referenced by name").
   - Move hook routines into the definition data itself (mini-routine DSL stored alongside the workflow). Bigger lift; fully self-contained definitions but needs an interpreter.

5. **Performance.** Build-time pre-resolution is free at request time. Runtime resolution adds work per submit. Mitigatable with caching, but not zero.

## The progression — intermediate stops

The costs above aren't all-or-nothing. Several coherent stops on the way to fully data-driven, each independently valuable:

1. **Latest-wins + migrations** (today's commitment). Cheapest. Works at current scale.
2. **Per-instance snapshot.** Pin definition data per instance at start. Pages still build-time. Solves "in-flight churn." Cheap to add.
3. **Snapshot + dynamic forms.** Add a `DynamicForm` block; replace `makeActionsForm`'s build-time substitution. Pages still per-action, endpoints still per-action, but form schemas are runtime-resolved from the snapshot. Version-tolerant forms without redoing page/endpoint generation.
4. **Snapshot + dynamic pages.** Replace per-action pages with a generic action page that reads the snapshot. Endpoints still per-action.
5. **Full data-driven.** All resolvers runtime. Generic page, generic endpoint, runtime hook lookup. Camunda territory. Admin editor becomes plausible.

Each step is reachable from the previous without a rewrite. The progression is roughly: snapshot pinning → dynamic forms → dynamic pages → dynamic endpoints → admin editor.

## When to revisit

Stay with latest-wins + migrations until one of these triggers fires:

- **Workflows change more often than the deploy cadence supports.** Sales/ops teams iterating on the workflow itself, not just the underlying entities.
- **Non-developers need to author or tweak workflows.** Product/ops team owning workflow shape as a configurable surface.
- **Multiple tenants need different workflows in one codebase.** Per-tenant onboarding flows, per-tenant approval chains.
- **A visual editor becomes a product feature.** Customer-facing workflow customization.
- **A/B testing workflow variants becomes a real business need.** "Does flow B convert better than flow A?"
- **Multi-month workflows where instances reliably span 3+ definition changes.** Migration debt compounds.
- **Many tens of thousands of concurrent in-flight instances.** Migration windows become operationally expensive.
- **Regulated domain where audit requires "exactly what definition was this instance running under."**

First triggers push toward per-instance snapshot (cheap, build-time stays intact). Sustained pressure across multiple triggers pushes toward full data-driven (architectural shift, larger investment).

## Summary

| Approach                | Versioning      | Architecture                | Authoring        | Effort to add  |
| ----------------------- | --------------- | --------------------------- | ---------------- | -------------- |
| Latest-wins + migrations | None            | Build-time (today)          | YAML in repo     | None (current) |
| Per-instance snapshot   | Per-instance    | Build-time                  | YAML in repo     | Small          |
| Snapshot + dynamic forms| Per-instance    | Hybrid                      | YAML in repo     | Medium         |
| Full data-driven        | Per-definition  | Runtime (Camunda-style)     | Admin UI or YAML | Large          |
| Camunda-style pinning (without dynamic) | Per-definition | Hybrid (fights build-time)  | YAML in repo     | Large + fights architecture |

The bottom row — Camunda-style pinning without going data-driven — is the trap. It promises versioning benefits but pays full architectural cost because it fights the build-time resolver pipeline. If pressure mounts, go to per-instance snapshot first; if more pressure, go fully data-driven. Don't half-step into Camunda's model.
