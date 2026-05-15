# Part 12 — `makeActionPages` resolver

**Source rationale:** [workflows-module-concept/action-authoring/spec.md](../../../workflows-module-concept/action-authoring/spec.md), [workflows-module-concept/ui/spec.md](../../../workflows-module-concept/ui/spec.md). **Layer:** resolvers. **Size:** M. **Repo:** `modules/workflows/resolvers/`.

## Goal

Emit per-action page YAML at build time for form actions only. Each form action gets up to four pages — `-edit`, `-view`, `-review`, `-error` — gated by the action's per-app verb list. Tracker and task actions get nothing here.

This part emits the **page shells**: the right ids, right templates referenced, right scoping. The form body (part 15), button bindings (part 16), and final templates (part 16) come from other parts.

## In scope

### `makeActionPages.js`

For each form action in the normalized config (from [part 4](../04-workflow-config-schema/design.md)):

- Emits up to four pages with ids `{workflow_type}-{action_type}-{verb}` for `verb ∈ [edit, view, review, error]`.
- Verb-gating per concept ui spec:
  - `-edit`: emitted iff `edit` in `access.{vars.app_name}`.
  - `-view`: emitted iff `view` in `access.{vars.app_name}`.
  - `-review`: emitted iff `review` in `access.{vars.app_name}`.
  - `-error`: emitted iff `action.access[vars.app_name].includes('error') && !!action.pages?.error` (opt-in per the verb-and-block rule).
- Tracker actions: emit nothing.
- Task actions: emit nothing (shared `task-*` pages from [part 17](../17-shared-pages/design.md) handle them).
- Each emitted page is a thin shell with `_ref` pointing at the template (part 16) plus vars carrying:
  - `action_config` (the action's normalized config).
  - `workflow_type`, `entity_type`, `entity_collection` (from the workflow).
  - `page_ids` map for sibling-page navigation (`{ edit, view, review, error }`).
  - `maxWidth`, etc. — pass-through chrome knobs from `action.pages.{verb}`.

### Upstream dependency

This resolver emits dynamic pages whose ids depend on the app's `workflows_config`. That requires [part 2 (dynamic-module-pages)](../02-dynamic-module-pages/design.md) — module-system support for resolver-emitted page exports.

### Build-time validation

- For each emitted page, ensure the referenced template file exists (template files land in part 16, but the path check ships here so emission failures surface fast).
- Page id collisions across workflows are prevented by the `{workflow_type}-...` prefix — but assert anyway.

## Out of scope / deferred

- **Page template bodies** → [part 16 (page-templates)](../16-page-templates/design.md). This part emits the shells; part 16 ships the `.yaml.njk` files they reference.
- **Form body composition** → [part 15 (resolver-form-builder)](../15-resolver-form-builder/design.md). The form body is resolved at template render time via the form builder.
- **`update-action-{action_type}` endpoint emission** → [part 13 (resolver-apis)](../13-resolver-apis/design.md).
- **Shared task pages and `workflow-overview`** → [part 17 (shared-pages)](../17-shared-pages/design.md).

## Depends on

[Part 2](../02-dynamic-module-pages/design.md), [part 4](../04-workflow-config-schema/design.md).

## Verification

- Unit tests:
  - Worked-example onboarding workflow: `qualify` (form, `access: { my-team-app: [view, edit] }`, no `pages.error`) emits `-edit` and `-view` only.
  - Adding `error` verb without `pages.error` does not emit `-error`. Adding `pages.error` without the verb does not emit it. Both together do.
  - `send-quote` (form with `review`) emits `-edit`, `-view`, `-review` per its access matrix.
  - `schedule-followup` (task) emits nothing.
  - `track-installation` (tracker) emits nothing.
  - Tracker actions skipped even when carrying `access.{app}: [view]`.
- Integration: build the demo app; assert generated page ids in the Lowdefy build output.

## Open questions

- **Stub form block before [part 15](../15-resolver-form-builder/design.md) lands.** Concept open question: should the resolver emit an `Html` placeholder so pages are visually inspectable in dev? Lean yes; part 15 replaces.
- **`pages.{verb}` per-action template override** — concept v1 says no; revisit if real apps need it.

## Contract to neighbours

- **Part 16** ships the Nunjucks templates this resolver references.
- **Part 15** is invoked via `_ref` from inside the templates this resolver wires up — the recursive-resolver spike from concept's open questions lives there.
