# Task 7: Verify build + end-to-end behaviour

## Context

The migration changes the source of the slug everywhere it's read. Two regression classes to catch:

1. **Missed site** — a `_module.var: app_name` left behind on a module that no longer declares the var resolves to `null`, scoping MongoDB filters to `created.app_name: null` and stamping `null` on writes. (Lowdefy's required-when-referenced guard catches a missing `slug:`, but not a missed *site* that still reads the dropped module var.)
2. **Wrong operator at a build site** — using `_app` where `_build.app` is required (the `_build.object.fromEntries` keys and the workflows resolver) either fails the build or, for the resolver, silently emits zero per-action pages.

## Task

1. **Static sweep** (repo root):
   ```bash
   grep -rn "_module.var: app_name" modules/ apps/      # expect zero
   grep -rn "app_name" modules/*/module.lowdefy.yaml    # expect no var declarations
   ```
   Then confirm the build-time sites use the build form:
   ```bash
   grep -rn "_app: slug" modules/*/api/*.yaml | grep -i fromEntries -B2   # spot-check
   grep -rn "app_name:" modules/workflows/module.lowdefy.yaml             # resolver var → _build.app: slug
   ```
   Any `_build.object.fromEntries` event-display key still on `_app: slug` (rather than `_build.app: slug`) is a bug.

   Then confirm the `app_name` → `slug` rename (Task 4) left no code identifiers behind:
   ```bash
   grep -rn "app_name\|appName" modules/workflows/ plugins/modules-mongodb-plugins/src/
   ```
   Every remaining hit must be a stored-data reference (a `created.app_name` test fixture, or a comment about the stored field) — **not** a variable, property, parameter, or YAML key. Eyeball each one.

2. **Build.** `pnpm ldf:b` must succeed with no unresolved-operator or missing-var warnings.

3. **Lint + unit tests.** Run the standard suite (`pnpm lint`, `pnpm test` if defined) **and the plugin package tests** (`pnpm --filter @lowdefy/modules-mongodb-plugins test`) — Task 4 renamed `app_name`→`slug` across the resolvers (`makeActionPages.test.js`, `makeWorkflowsConfig`) and the plugin engine + its `*.test.js` fixtures, so all must pass with the renamed identifier. Confirm the plugin `dist/` was rebuilt after the src rename.

4. **End-to-end smoke** (`pnpm ldf:dev`, a human/`/r:dev-test` step — needs real `MONGODB_URI`):
   - **Home** title and **layout footer** read "Modules Demo" (from `_app: name`).
   - **Contacts** — create/update; events render in the timeline.
   - **Companies** — create/update; events render.
   - **User-admin** — list title "Modules Demo User Admin" (proves `app_title: { _build.app: name }` baked at build); invite/resend/edit a user; per-app fields written under `apps.demo.*`. Verify breadcrumbs and the Excel download filename carry the prefix.
   - **User-account** — update profile; event renders.
   - **Notifications** — bell unread count; inbox scoped to `demo`; mark read.
   - **Workflows** — group-overview renders; **per-action pages exist** (proves the resolver received `"demo"`, not an object, at build).
   - Setting `app_title: ''` explicitly still produces unprefixed user-admin labels.

5. **Stored-doc spot-check.** Sample a new event document; confirm `created.app_name === "demo"` (no schema change).

## Acceptance Criteria

- Static sweep returns zero `_module.var: app_name` in `modules/`+`apps/`; no manifest declares `app_name`.
- Every `_build.object.fromEntries` event-display key and the workflows resolver var use `_build.app`.
- Build, lint, and unit tests pass.
- All listed e2e flows work; per-action pages are emitted.
- New event/notification documents still stamp `created.app_name: "demo"`.

## Files

No code changes. A regression goes back into the owning earlier task; then re-run this one.

## Notes

- Empty results in a flow (e.g. notifications inbox blank) is the telltale of a missed site resolving to `null` → `created.app_name: null`.
- Missing per-action workflow pages is the telltale of `_app` used where `_build.app` was required in the resolver vars (Task 4).
- This is the merge gate — do not merge until it passes.
