# Part 12 — `makeActionPages` resolver

> **⚠️ Deviation from original design — read before implementing task 3.**
>
> [Part 02](../_completed/02-dynamic-module-pages/design.md) was resolved upstream by **removing the static `exports:` block from `module.lowdefy.yaml` entirely** rather than by adding a resolver-emit channel. The resolver logic in this part (tasks 1–2, already shipped) is unaffected — same inputs, same outputs. **What changes is task 3 (manifest wiring):** instead of a `resolver:` channel entry under `exports.pages`, the manifest's `pages:` array invokes the resolver from `_build.array.map` over `_module.var: workflows_config` (concrete shape pinned in [part 20b](../20b-module-manifest-dynamic/design.md) when task 3 lands). The "Upstream dependency" subsection below and the part-02 entry in "Depends on" are stale; treat them as historical context.

**Source rationale:** [workflows-module-concept/action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md), [workflows-module-concept/ui/spec.md](../../../workflows-module-concept/ui/spec.md). **Layer:** resolvers. **Size:** M. **Repo:** `modules/workflows/resolvers/`.

## Goal

Emit per-action page YAML at build time for form actions only. Each form action gets up to four pages — `-edit`, `-view`, `-review`, `-error` — gated by the action's per-app verb list. Tracker and task actions get nothing here.

This part emits the **page shells**: the right ids, right templates referenced, right scoping. The form body (part 15), button bindings (part 16), and final templates (part 16) come from other parts.

## In scope

### `makeActionPages.js`

Reads the raw `workflows_config` YAML from `vars.workflows`. The framework expands all nested `_ref`s before the resolver runs (same pattern as [part 4](../04-workflow-config-schema/design.md)'s `makeWorkflowsConfig`); the resolver sees a plain JS array of workflow objects.

Both engine-runtime fields (`type`, `kind`, `access`, `status_map`, etc.) and build-time-only fields (`pages`, `form`, `form_review`, `form_error`, `hooks`, `interactions`, `event`) live on the same raw YAML object — the resolver plucks what it needs from one input. Part 4's `makeWorkflowsConfig` narrows the same YAML to an engine-runtime slice for the workflow-api connection to read at runtime; that narrowing is not load-bearing for page emission and part 12 does not consume its output. Part 4's `tasks/tasks.md` documents the contract: "Build-time-only fields are read by parts 12/13/15 from the raw workflow YAML, not from `workflowsConfig`."

For each form action:

- Emits up to four pages with ids `{workflow_type}-{action_type}-{verb}` for `verb ∈ [edit, view, review, error]`.
- Verb-gating: for each verb in `[edit, view, review, error]`, emit `-{verb}` iff that verb is in `access.{vars.app_name}`. The `error` verb has no extra opt-in — it's grouped with the others. Templates handle missing `pages.{verb}` chrome with sensible defaults (the error template ships its own recovery surface, stale-URL guard, and failure-context banner; `pages.error` is purely a chrome-override slot like `pages.edit`).
- Tracker actions: emit nothing.
- Task actions: emit nothing (shared `task-*` pages from [part 17](../17-shared-pages/design.md) handle them).
- Each emitted page is a thin shell with `_ref` pointing at the template (part 16) plus vars carrying:
  - `action_config` — the action's config slice the template needs: engine-runtime fields (`type`, `kind`, `access`, `status_map`, etc.) plus build-time-only fields (`form`, `form_review`, `form_error`, `hooks`, `interactions`, `event`), all picked from the raw action YAML. The per-verb `pages.{verb}` chrome is intentionally **not** included here — it's lifted to the top-level `page_config` var below. Templates see one flat shape.
  - `workflow_type`, `entity_collection` (from the workflow). `entity_collection` is the single entity-identity scalar — see [part 21](../21-entity-type-to-collection/design.md).
  - `page_ids` map for sibling-page navigation. Keys are only present for verbs that were actually emitted for this action — templates must guard sibling references (e.g. `_if page_ids.review is defined`). Avoids pointing at non-existent page ids.
  - `page_config` — the per-verb slice of `action.pages.{verb}` (`title`, `requests`, `events`, `formHeader`, `formFooter`, `modals`, `maxWidth`, and on `error`: `buttons.submit.{title, modal}`). Top-level so templates read `page_config.title`, not `action_config.pages.edit.title`. Defaults to `{}` when the action declares no `pages.{verb}` block.

  The shell carries **context only** — page-level `events.onInit`, `requests:`, and the `get_action` request `_ref` live inside the template (part 16), not the shell. Part 12 doesn't bake request ids into the emitted YAML; templates own the render contract.

  `entity_id` is **not** a build-time var — it arrives at runtime via the page's `?action_id=` URL query, resolved through `get_action.workflow_id → get_workflow.entity_id`. The UI spec wording that bundles `entity_id` with `entity_collection` refers to the template's runtime context, not the resolver's build-time vars.

### Upstream dependency

This resolver emits dynamic pages whose ids depend on the app's `workflows_config`. That requires [part 2 (dynamic-module-pages)](../_completed/02-dynamic-module-pages/design.md) — module-system support for resolver-emitted page exports.

### Placeholder templates

Part 12 lands in Wave 2; the real templates land in part 16 (Wave 6). Ship four placeholder files at `templates/{edit,view,review,error}.yaml.njk` so the `_ref` paths the resolver emits resolve from day one — Lowdefy build fails loudly on missing `_ref` targets. Each placeholder is a thin stub: an `Html` block stating the page kind, plus an `Html` "form goes here" placeholder on `edit.yaml.njk` so authored pages are visually inspectable in dev before [part 15](../15-resolver-form-builder/design.md) wires the real form body. Part 16 replaces each placeholder with the full template.

### Build-time validation

- `vars.app_name` is required and non-empty. Fail with a precise message if missing, `null`, or `""` — silent zero-page emission is the wrong failure mode. Defense in depth with part 20's manifest-level `required: true`.

No template-existence or page-id-collision asserts. The Lowdefy build surfaces missing `_ref` paths on its own; id collisions are prevented structurally by the `{workflow_type}-{action_type}-{verb}` shape (three segments, verb suffix), so a runtime check earns nothing.

## Out of scope / deferred

- **Page template bodies** → [part 16 (page-templates)](../16-page-templates/design.md). This part emits the shells; part 16 ships the `.yaml.njk` files they reference.
- **Form body composition** → [part 15 (resolver-form-builder)](../15-resolver-form-builder/design.md). The form body is resolved at template render time via the form builder.
- **`update-action-{action_type}` endpoint emission** → [part 13 (resolver-apis)](../13-resolver-apis/design.md).
- **Shared task pages and `workflow-overview`** → [part 17 (shared-pages)](../17-shared-pages/design.md).

## Depends on

[Part 2](../_completed/02-dynamic-module-pages/design.md), [part 4](../04-workflow-config-schema/design.md), [part 21](../21-entity-type-to-collection/design.md) (for the `entity_collection`-only entity-identity contract).

## Verification

- Unit tests:
  - Worked-example onboarding workflow: `qualify` (form, `access: { my-team-app: [view, edit] }`) emits `-edit` and `-view` only.
  - Adding `error` to the verb list emits `-error`; removing it does not. No `pages.error` block required.
  - `send-quote` (form with `review`) emits `-edit`, `-view`, `-review` per its access matrix.
  - `schedule-followup` (task) emits nothing.
  - Tracker actions skipped even when carrying `access.{app}: [view]`.
- Integration: build the demo app; assert generated page ids in the Lowdefy build output.
- End-to-end coverage lands in [part 22 — workflows-e2e-suite](../22-workflows-e2e-suite/design.md) (`resolver-pages.spec.js`). This part's verification is unit-tests + build-output assertions only.

## Open questions

- **`pages.{verb}` per-action template override** — concept v1 says no; revisit if real apps need it.

## Contract to neighbours

- **Part 16** replaces the placeholder Nunjucks templates shipped here with the real templates. Paths stay the same (`templates/{verb}.yaml.njk`); only the bodies change.
- **Part 15** is invoked via `_ref` from inside the templates this resolver wires up — the recursive-resolver spike from concept's open questions lives there.
- **Part 21** owns the entity-identity simplification (`entity_collection` only); part 12 passes that single scalar as a template var.
