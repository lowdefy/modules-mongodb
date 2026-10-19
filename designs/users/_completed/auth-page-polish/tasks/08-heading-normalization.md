# Task 8: Normalize heading treatment across the auth pages

## Context

Auth-page headings are inconsistent. Only `login` routes its resting title through the shell
(`title: Sign in` in its `auth-page` vars); every other page passes `title: ""` and hand-rolls
its own `Title` block. Pages with in-block `Title` blocks today: `onboarding` (`onboarding_title`),
`signup`, `two-factor` (`tf_title`, `tf_backup_title`), `accept`, `forgot-password`,
`reset-password`, `two-factor-enrol` (`enrol_title`). Several pages legitimately swap headings
per state ("Check your email", "This link has expired") — the single shell `title` var can't
express those, so **titles stay in-block for state-aware pages**.

The consistency win is uniform typography and spacing, not centralizing titles. The shell's
`auth-title` block (rendered when a non-empty `title` var is passed) is already `Title` level 3
(`modules/shared/layout/auth-page.yaml`).

## Interfaces

- **Consumes:** final shape of `two-factor-enrol.yaml` (Task 4), `onboarding.yaml` (Task 5), and
  `two-factor.yaml` (Task 7) — this pass re-touches those files' headings, so it runs after
  them to avoid edit conflicts.

## Task

Across `modules/user-account/pages/*.yaml`:

1. **Standardize every heading on `Title` level 3 with the same top margin.** For each in-block
   heading `Title`, set `properties.level: 3` and apply the same top margin as the shell's
   `auth-title` (match the shell's spacing so a page whose title comes from the shell and a page
   whose title is in-block look identical). Determine the shell's current `auth-title`
   margin/spacing and use that exact value as the standard.

2. **Move `login`'s resting title in-block.** `login` is the lone page routing its resting title
   (`Sign in`) through the shell `title` var. Convert it to an in-block `Title` (level 3, the
   standard margin) like the other pages, and pass `title: ""` to the shell — so the norm
   ("titles are in-block") holds uniformly. `login` already swaps notices/errors per state; the
   resting "Sign in" heading becomes a normal in-block block.

3. **Keep the shell `title` var.** It's exported surface — do not remove it. State-aware pages
   keep their per-state in-block titles.

Verify each page's heading with `lowdefy_get_page_config` + `lowdefy_screenshot_page`; check
that headings sit at the same level and spacing across `login`, `signup`, `forgot-password`,
`reset-password`, `verify-email`, `accept`, `two-factor`, `two-factor-enrol`, `onboarding`, and
`logout`.

## Acceptance Criteria

- Every auth-page heading renders as `Title` level 3 with the same top margin, whether it comes
  from the shell or an in-block block.
- `login` no longer passes a non-empty `title` to the shell; its "Sign in" heading is an in-block
  `Title` matching the others.
- The shell `title` var still exists and still works for any page that uses it.
- State-aware pages still swap their headings per state.
- `pnpm ldf:b` from `apps/demo` succeeds; `lowdefy_build_status` clean.

## Files

- `modules/user-account/pages/login.yaml` — modify — move resting title in-block; `title: ""` to
  shell.
- `modules/user-account/pages/signup.yaml`, `accept.yaml`, `forgot-password.yaml`,
  `reset-password.yaml`, `verify-email.yaml`, `logout.yaml`, `two-factor.yaml`,
  `two-factor-enrol.yaml`, `onboarding.yaml` — modify — level 3 + uniform top margin on each
  in-block heading.

## Notes

- Runs after Tasks 4, 5, 7 to avoid conflicting edits on `two-factor-enrol.yaml`,
  `onboarding.yaml`, and `two-factor.yaml`.
- This is a mechanical typography pass — do not change any page's copy, state logic, or flow.
