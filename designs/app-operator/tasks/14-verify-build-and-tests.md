# Task 14: Verify build + end-to-end behaviour

## Context

The migration touches 32 files mechanically and changes the source of the slug everywhere it's read. The risk is silent regression: a missed site that still reads `_module.var: app_name` resolves to `null` at runtime (a missing var on a module that no longer declares one), causing MongoDB filters to scope to `created.app_name: null` and writes to stamp `null`. The upstream Lowdefy guard from `lowdefy-requirements.md` §Requirement 2 catches missing `slug:`; this task catches missed sites and verifies behaviour stays correct end-to-end.

## Task

1. **Static sweep.** Run from the repo root:

    ```bash
    grep -rn "_module.var: app_name" modules/ apps/
    grep -rn "app_name" modules/*/module.lowdefy.yaml
    ```

    Expect zero hits from the first command; the second should show only the events module's `change_stamp` description (if any) referencing the *concept* — no manifest var declarations.

2. **Build.** Run `pnpm ldf:b` (or the project's standard build command) on the demo. The build must succeed without warnings about unresolved operators or missing vars.

3. **Lint and unit tests.** Run the standard verification suite (e.g. `pnpm lint`, `pnpm test` if defined). All must pass.

4. **End-to-end smoke.** Start the demo (`pnpm ldf:dev`) and exercise:

    - **Home page** — title reads "Modules Demo" (from `_app: name`).
    - **Layout footer** — reads "Modules Demo" (from `_app: name`).
    - **Contacts** — list page loads; create a contact; update a contact. Verify events render in the timeline.
    - **Companies** — create and update a company. Verify events.
    - **User-admin** — list page renders with title "Modules Demo User Admin". Invite a user; resend the invite; edit a user. Verify per-app fields are written under `apps.demo.*`.
    - **User-account** — open the profile page; update the profile; verify the event renders.
    - **Notifications** — bell icon shows unread count; inbox lists notifications scoped to `demo`; mark one read.
    - **Workflows** — group-overview page renders; per-action pages exist (proves the resolver received the slug at build time).

5. **Spot-check stored documents.** In MongoDB, sample a new event document and confirm `created.app_name === "demo"` (same value as before the migration — no schema change).

## Acceptance Criteria

- Static sweep returns zero `_module.var: app_name` references in `modules/` and `apps/`.
- Build succeeds.
- Lint and unit tests pass.
- All listed end-to-end flows work as described.
- New event/notification documents continue to stamp `created.app_name: "demo"`.

## Files

This task does not modify code. If a regression is found, file the fix under whichever earlier task it belongs to (e.g. a missed contacts site goes into a follow-up to task 3) and re-run this task.

## Notes

- If a flow renders empty results (e.g. notifications inbox shows nothing), the most likely cause is a missed `_module.var: app_name` site that now resolves to `null` and filters to `created.app_name: null`. The static sweep should catch these, but the empty-results case is a telltale.
- This task is the merge gate. Until it passes, do not merge the migration PR.
