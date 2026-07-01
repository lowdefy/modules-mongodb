# Task 5: ~~Add `validate_email.yaml` helper to the contacts module~~ — **Obsoleted by review-2**

> **Status: no work required.** The contacts module already ships `modules/contacts/validate/email.yaml` (identical to the copies in `user-admin`, `user-account`, `companies`). The default form (Task 6) references that file directly via `_ref: { path: ../validate/email.yaml, vars: { field_name: ... } }`. No new validator file is created.

## Rationale

The original task was premised on "this module doesn't ship that file today." That premise was wrong — a `_regex`-based email validator with a `field_name` var (defaulting to `email`) and a null/empty-case fall-through already exists at `modules/contacts/validate/email.yaml`. It is also already referenced from `modules/contacts/components/form_email.yaml:8`.

Cross-module consolidation into a shared `modules/shared/validate/email.yaml` was also considered and rejected: Lowdefy modules are advertised as distributable via GitHub subpath (`source: "github:.../modules/contacts@v1"`). A `../shared/...` reference would resolve inside this monorepo but break once a module is pulled by subpath, since `../shared/` sits outside the pulled subtree. The four per-module duplicate copies stand.

See `review/review-2.md` for the full finding.

## Follow-ups

- Task 6 references the existing file directly (`../validate/email.yaml`). No dependency on this task.
- Task 7 does not register the validator in the manifest (it's pulled in via `_ref` from the form, which is the same mechanism `form_email.yaml` already uses).
- Tasks.md dropped Task 5 from the ordering graph; Task 6's Depends-On becomes `—`.

## Files

- **none** — no file is created or modified as part of this task.
