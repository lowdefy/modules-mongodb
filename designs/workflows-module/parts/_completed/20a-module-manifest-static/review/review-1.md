# Review 1 — Scope, freshness, and demo wiring

## Stale scope

### 1. Most of the "static surface" already ships on disk

> **Resolved.** Added a "Starting state" section that names what's already on disk in `modules/workflows/` and what's missing (per the existing manifest header comment). Rewrote "Goal" to commit to closing the static-surface gap rather than authoring from scratch. Rewrote "Proposed change" as six concrete deltas: connection files, manifest additions (three vars + `dependencies:` + `secrets:` + `connections:` keys), README, and three demo-wiring steps.

The design's goal (line 9–11, "Proposed change" step 1, line 15) reads as if the manifest, components, pages, APIs, enums, and shared requests still need to be authored. They don't — they're already in `modules/workflows/`:

- `modules/workflows/module.lowdefy.yaml` exists at version `0.6.0`. It already declares every export claimed by 20a's "static surface": all five shared pages (`task-edit`, `task-view`, `task-review`, `workflow-overview`, `group-overview` at lines 117–121), all six operational APIs (`start-workflow`, `cancel-workflow`, `close-workflow`, `get-entity-workflows`, `get-workflow-overview`, `get-action-group-overview` at lines 109–114), all three components (`actions-on-entity`, `workflow-header`, `action_role_check` at lines 99–104), both enums merged with display overrides (lines 89–98), and the plugin pin at `^0.6.0` (line 132).
- The corresponding files exist: `modules/workflows/{api,components,enums,pages}/` are populated.
- The manifest header comment at [module.lowdefy.yaml:1–13](../../../../modules/workflows/module.lowdefy.yaml) explicitly states what *hasn't* yet shipped: "WorkflowAPI connection, workflows-collection / actions-collection connections, MONGODB_URI secret, menu exports, user_schema + app_name + entities vars, form-fields component library (part 14)". That is 20a's actual scope after the split — author connections, add the missing vars, add secrets, add the README. Everything else is rewording the existing manifest.

**Fix.** Rewrite "Proposed change" to enumerate only the deltas against the on-disk manifest. Concretely:

- Author three `connections/*.yaml` files (none exist — see finding 2).
- Add `vars.user_schema`, `vars.app_name`, `vars.entities` to the manifest (lines 51–86 of the current manifest hold only `workflows_config`, `action_statuses_display`, `workflow_lifecycle_stages_display`).
- Add `dependencies:` block (no `dependencies:` key in the current manifest — see finding 4).
- Add `secrets:` block (no `secrets:` key in the current manifest).
- Add the connection `_ref`s under a new top-level `connections:` key.
- Author `modules/workflows/README.md` (file does not exist).
- Wire `apps/demo/modules.yaml` + demo lead pages + tracker-only workflow YAML.

The current write-up will read to an implementer as "author the whole surface from scratch," which is wrong and risks net-new authoring on top of files that already exist.

### 2. `connections/` directory and three connection files are the only missing exports

> **Resolved.** Step 2 of "Proposed change" now flags that `modules/workflows/connections/` does not yet exist on disk, calling out connections as the only export category that is genuinely new code.

[modules/workflows/](../../../../modules/workflows/) has `api/`, `components/`, `enums/`, `pages/`, `requests/`, `resolvers/`, `templates/` — no `connections/`. The design's step 2 (line 16) is correct that these need to be authored fresh. Worth elevating this in the "Proposed change" summary because it's the only export category that is genuinely new code.

### 3. Plugin version pin claim is wrong (`^0.4.x`)

> **Resolved.** Updated to `^0.6.0` with a note that the existing manifest already carries that pin. Dropped the "bumped from prior" framing.

Line 51 says "bumped to `^0.4.x` to match what's in `plugins/modules-mongodb-plugins/package.json` when this part lands." Two errors:

- [plugins/modules-mongodb-plugins/package.json:3](../../../../plugins/modules-mongodb-plugins/package.json) shows `"version": "0.6.0"`.
- The current [module.lowdefy.yaml:131–133](../../../../modules/workflows/module.lowdefy.yaml) already pins `^0.6.0`.

**Fix.** Update the bullet to "pin matches `plugins/modules-mongodb-plugins/package.json` — currently `^0.6.0`." Drop the "bumped from prior" framing since the pin has been at 0.6 since the manifest was first written.

## Vars and dependencies

### 4. `dependencies` claim is not consistent with what's actually used

> **Resolved (option a, then revised).** Original review-1 #4 resolution dropped both `events` and `notifications`. Consistency review 3 (`review/consistency-3.md` #1) surfaced that the WorkflowAPI plugin's `changeStamp` property — wired via `_ref: { module: events, component: change_stamp }` per the plugin schema — keeps engine writes properly stamped. With the connection file landing in 20a, `events` is a real dependency. Final state: `dependencies: [layout, events]`. `notifications` stays deferred to 20b.

Line 15 and lines 37–41 commit to `dependencies: [layout, events, notifications]`. A grep over the shipped static surface — `modules/workflows/{pages,components,api}/` — finds zero references to `module: events` or `module: notifications`. Only `module: layout` is consumed (e.g. [pages/task-edit.yaml:11](../../../../modules/workflows/pages/task-edit.yaml), [pages/workflow-overview.yaml:12](../../../../modules/workflows/pages/workflow-overview.yaml), [pages/group-overview.yaml:16](../../../../modules/workflows/pages/group-overview.yaml)).

The design even acknowledges this in spirit at lines 105–108: hooks, `event:` overrides, and notifications dispatch all flow through the per-action endpoint, which is part 20b.

[Part 23 (close-workflow)](modules-mongodb/designs/workflows-module/parts/_completed/23-close-workflow-handler/design.md) line 72 explicitly defers "Log event + notifications on close" — confirming that the close handler doesn't reach the `events` or `notifications` modules. Part 19's operational-APIs are pure Lowdefy routines wrapping the engine; no module refs there either.

**Fix.** Either (a) drop `events` and `notifications` from 20a's `dependencies` and add them when 20b's per-action endpoints actually consume them, or (b) keep them but justify with a concrete reference to the consumer (e.g. "`workflow-overview` reads from the events module" — but that's not currently true). Option (a) matches the principle that the manifest should declare only the dependencies the static surface actually uses; otherwise apps that opt into 20a are forced to wire `events` and `notifications` for no behavioural reason.

### 5. `entities` is not "from the concept spec verbatim"

> **Resolved.** Heading reworded to "matching the concept spec plus `entities`" and a paragraph added pointing at part 17's introduction of the var and its explicit hand-off of the manifest declaration to this part.

Line 26 says vars match "the [concept spec](...) verbatim." The concept spec at [module-surface/spec.md:47–73](../../../workflows-module-concept/module-surface/spec.md) lists exactly five vars: `workflows_config`, `app_name`, `user_schema`, `action_statuses_display`, `workflow_lifecycle_stages_display`. **`entities` is not in the concept spec.** It was introduced by [part 17 shared-pages, line 65–98](../_completed/17-shared-pages/design.md).

The design's own line 30 hedges with "Introduced by part 17 shared-pages; extended by part 26" but the framing at line 26 still claims verbatim correspondence to the concept spec. These contradict.

**Fix.** Soften line 26 to "matching the [concept spec](...) plus the `entities` var introduced by [part 17](../_completed/17-shared-pages/design.md)." Or, since 20a is the authoritative manifest-authoring part, treat `entities` as a first-class var from this part's POV and note the concept-spec drift separately. Either is fine — what isn't fine is claiming verbatim alignment that doesn't hold.

## Demo wiring

### 6. Tracker-only demo without per-action endpoints — child workflow viability

> **Resolved.** Open question removed. The child is a one-action `kind: task` workflow ("installation step" — the spec's documented "minimal workflow shim" at action-authoring/spec.md:489). Schema rules out the "leaf tracker that watches nothing" third option from the review (action-authoring/spec.md:99 requires `tracker:` with a real `workflow_type`). Instead of surfacing a dead Save button, 20a does not link the parent into the child's `task-edit` page — a new "Child workflow rendering — skipped in 20a" section explains this and replaces the in-UI Save flow with admin-style `close-workflow` / `cancel-workflow` buttons on `lead-view`. 20b's demo extension wires the link into `task-edit` and removes the admin buttons.

The "tracker-only" demo (lines 82–118) needs a child workflow for the tracker subscription to fan up from (line 96). Both options the design proposes (line 120–127) have real problems:

- **Option 1 (tracker-only child placeholder).** Recursive — a tracker-only child needs *its own* child to fan up from. Either it has no actions (impossible per [part 4](../04-workflow-config-schema/design.md) — every workflow needs `starting_actions`) or it has tracker actions that watch nothing concrete. The demo bottom would either dead-end on an empty workflow or leak an "this watches nothing" tracker.
- **Option 2 (`kind: task` one-action child).** Acknowledged at line 125: "task-edit save won't work until part 20b ships" — the page renders, the Save button is dead. That is exactly the "this button is dead until 20b" UX the design says it wants to avoid for the parent flow.

**A third option worth considering.** Have the child workflow be a tracker action that watches *nothing* (a leaf tracker — no `tracker:` block at all, or `tracker:` pointed at a sibling workflow type that the demo never starts). Status transitions on that child are driven entirely by `cancel-workflow` and `close-workflow` calls, which 20a *can* exercise. This is option 2 minus the dead `task-edit` Save button. The verification walk-through at lines 167–172 already drives the child via `close-workflow` and `cancel-workflow` directly.

**Fix.** Resolve the open question in the design itself rather than deferring to execution time (line 127, "revisit during execution"). The demo's shape determines what files 20a actually adds under `apps/demo/workflow_config/installation/` and `apps/demo/workflow_config/`, which determines what 20a's verification walk-through can claim.

### 7. Demo `connections/` placement doesn't match existing pattern

> **Resolved (option b′).** Use the demo's existing inline pattern, not a reusable module under `modules/`. The `leads` connection is added inline to `apps/demo/lowdefy.yaml`'s `connections:` block (alongside the existing `demo-contacts` entry at line 99). Lead pages live under `apps/demo/pages/leads/` and are `_ref`'d from `apps/demo/lowdefy.yaml`'s `pages:` block. Dropped the misleading "mirrors the contacts-module pattern" framing — the contacts module is a publishable reusable package under `modules/contacts/`; 20a's leads are demo-only fixtures with no module wrapper.

Line 117 says "Add `apps/demo/connections/leads-collection.yaml`." [apps/demo/](../../../../apps/demo) does not have a `connections/` directory — connections live under `apps/demo/modules/{module-name}/` (e.g. `apps/demo/modules/contacts/`). The contacts and companies modules are pulled in as module entries at [modules.yaml:7–18](../../../../apps/demo/modules.yaml), and their MongoDB collections come from the modules themselves, not from a top-level `connections/` directory.

The same applies to `apps/demo/pages/leads/` (line 116). Currently `apps/demo/pages/` holds only top-level pages (`404.yaml`, `avatar.yaml`, `home.yaml`, `router.yaml`); domain pages live inside `apps/demo/modules/{module}/pages/`.

**Fix.** Pick one of:

- (a) Add a `modules/leads/` Lowdefy module under `apps/demo/modules/leads/` mirroring `apps/demo/modules/contacts/` exactly, with its own connection + pages + module manifest, then wire it as a module entry in `apps/demo/modules.yaml`.
- (b) Stop calling the lead pages and leads connection a "mirror of the contacts module pattern" (line 18) and use ad-hoc demo structure — but then state that explicitly.

The current text claims to mirror the contacts pattern at line 18 while proposing structure that doesn't actually match it.

### 8. `workflow_config/` directory location

> **Resolved.** Added a one-line callout to the `workflow_config/onboarding/onboarding.yaml` bullet explaining that the directory is new in `apps/demo/` and how the workflows module reads it (the `vars.workflows_config` `_ref` consumed by part 4's validator).

Lines 113–115 place workflows under `apps/demo/workflow_config/onboarding/` at the app root. That's consistent with how `vars.workflows_config` reads in apps generally, and is fine — but the design should call out that this is the first `workflow_config/` directory in `apps/demo/` and that the directory is read by the resolver expectation set in [part 4](../04-workflow-config-schema/design.md). One sentence on the wiring would prevent confusion when the file lands.

## Documentation

### 9. README does not exist; design says "ship `modules/workflows/README.md`" but doesn't say what's inside

> **Resolved.** Step 3 of "Proposed change" now commits to a worked-example block for `vars.entities` in the README's "How to Use" section, with all three subfields (`page_id`, `id_query_key`, `title`) — since `entities` isn't in the concept spec, the README is the canonical place apps look for the shape.

Step 6 (line 20) lists the README sections. Good. But the README format the repo enforces is fixed by [CLAUDE.md "Documentation"](../../../../CLAUDE.md) — Description, Dependencies, How to Use, Exports (Pages / Components / API Endpoints / Connections / Menus), Vars, Secrets, Plugins, Notes. The design lists the same sections (line 131) — fine — but `modules/workflows/README.md` is currently absent and 20a is the first part to ship it.

One concrete request: the "How to Use" section should include the `vars.entities` shape with at least one worked example, since `entities` is undocumented in the concept spec (see finding 5) and apps need a worked example to wire it.

### 10. "Exports" section restates manifest entries — drop or shorten

> **Resolved (middle path).** Compressed the four `exports.*` subsections (`pages` / `api` / `components` / `global`) into a single "Existing static exports (unchanged)" paragraph that points at the on-disk manifest and its header-comment cross-refs. Kept the `vars` / `dependencies` / `connections` / `plugins` / `secrets` subsections — those describe the genuinely new entries this part adds.

Lines 53–80 enumerate every export the manifest already carries. Since the manifest is the source of truth ([CLAUDE.md "Documentation"](../../../../CLAUDE.md): "Manifest is the source of truth for var schema"), this section duplicates the manifest with no added clarity. The split rationale (line 7) is the only piece of this section that adds information.

**Fix.** Compress lines 53–80 to a single paragraph: "All static exports currently in `modules/workflows/module.lowdefy.yaml` (pages, APIs, components, enums) stay as-is. This part adds the three connection refs, the three missing vars (`app_name`, `user_schema`, `entities`), `dependencies:`, `secrets:`, and `plugins:` keys." Then add a one-line pointer to the manifest file for the full list. The current section reads like a fresh-authoring spec and obscures the actual delta.

## Verification

### 11. Verification step 1 "no missing `_ref` errors" — manifest already builds

> **Resolved.** Build-smoke bullet rewritten to name the actual changes (new connections, new vars, `dependencies:`, `secrets:`) and to make wiring the workflows module into `apps/demo/modules.yaml` the trigger for the check.

Line 165 lists a build-smoke check. The current manifest already builds (the existing pages and APIs are loaded by `apps/demo` via... actually they aren't — workflows isn't in `apps/demo/modules.yaml`). The check is fine but the framing assumes greenfield. Worth tightening to "after wiring the workflows module into `apps/demo/modules.yaml`, the build resolves all `_ref`s and the new `vars.entities` validator passes." That tells the implementer what changed.

### 12. E2E spec scope (line 174)

> **Resolved.** Committed to a single spec at `apps/demo/e2e/workflows/tracker-only-onboarding.spec.js` that automates the existing six-step tracker-only walk-through (initial render → start → workflow/group overviews → close child → blocked_by re-evaluation → cancel). Dropped the "or equivalent" hedge and the speculative second filename.

The verification claims a Playwright spec slice "lands as part of this half's verification path" (line 139 and line 174). [Part 22 (workflows-e2e-suite)](../22-workflows-e2e-suite/design.md) owns the suite. 20a should either:

- Explicitly list the spec filename(s) it will add (e.g. `apps/demo/e2e/workflows/tracker-subscription.spec.js`) — line 174 mentions two filenames but as "or equivalent," which is too soft, OR
- Drop the spec contribution and leave it to part 22.

Given that 20a's worked example is tracker-only and exercises a specific slice, the spec contribution is valuable — just commit to the exact filenames and the assertions they cover so part 22 doesn't have to re-derive them.

## Lower-priority items

### 13. Open question on "skeleton resolver" (line 179)

> **Resolved.** Open question removed from the "Open questions" list and recorded as a closed decision in the same section: skip the skeleton resolver because pre-registering it would re-introduce the part 02 dependency that this split was created to avoid.

The design opens the question of whether 20a should pre-register no-op `makeActionPages` / `makeWorkflowApis` resolvers so 20b is a pure code change. The design concludes "probably skip — leave manifest entries to 20b." Concur. Suggest closing this open question in 20a's text rather than carrying it forward.

### 14. Open question on Part 27 fate (line 178)

> **Resolved.** Committed to retiring Part 27. The "Open questions" section now records the decision and lists three concrete clean-up steps for 20a's task list: remove the part 27 rows from `implementation-plan.md` (line 95 + the table at line 104), drop the "Part 27 spun out" sentence from the "Shipped so far" paragraph (line 5), and delete `designs/workflows-module/parts/27-demo-workflows-wiring/`. Rejected the "thin verification-record pointer" alternative — it would create three overlapping verification homes.

The design notes Part 27 is "redundant" after the 20a/20b split. [Part 27](../27-demo-workflows-wiring/design.md) still exists. This is the right place to commit to retiring or repurposing it — the question is meaningfully resolved by the split's existence. Suggest 20a's design commits to a direction (retire) and 20a's task list includes the archive step, so the redundancy doesn't linger.
