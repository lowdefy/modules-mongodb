# Execution checklists — auth-testing campaign

These are **execution checklists**, not implementation tasks. Each phase file is a live
checklist run manually against the local rig; tick items and record the evidence inline as
you go. See [`../design.md`](../design.md) for scope, methodology, and the finding lifecycle.

**Run top-to-bottom** — the phases are dependency-ordered (Phase 0 stands the rig up; later
phases need enrolment / invites / a second instance from earlier ones).

**Legend:** `[ ]` to do · `[x]` done · `[~]` pending build / partial · `[-]` skipped or N/A
this run. **"Verify in Compass"** = check the document state in the rig database.

## Phases

| #   | File                                                                 | Covers                                                                          | Depends on |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| 0   | [`00-environment-bootstrap.md`](./00-environment-bootstrap.md)       | Rig up, indexes, first admin bootstrapped                                       | —          |
| 1   | [`01-public-auth-pages.md`](./01-public-auth-pages.md)               | Signup, verify, login, reset, magic-link, passkey, OAuth, accept-invite, logout | 0          |
| 2   | [`02-account-workspace.md`](./02-account-workspace.md)               | Profile / security / sessions tiles; 2FA enrol / replace / disable              | 0, 1       |
| 3   | [`03-user-admin-console.md`](./03-user-admin-console.md)             | Page gate, `all` list, invite flow, `view` detail tiles                         | 0, 1       |
| 4   | [`04-cross-cutting-invariants.md`](./04-cross-cutting-invariants.md) | Freshness, uniqueness, co-location, gates, change stamps, `Validate` scoping    | 1, 2, 3    |
| 5   | [`05-per-org-authority.md`](./05-per-org-authority.md)               | Two instances, role storage shape, cross-org authority, impersonation retired   | 0, 3       |

## Standing constraints for every run

- **Never change data** on any environment without an explicit instruction — not `reset-db`,
  not a seed. Reads (Compass, `lowdefy_run_request`, ad-hoc read scripts) are free.
- **An unevidenced `[x]` is worthless.** Record the document state, error copy, or session
  row you actually observed. The note is the record.
- **Re-run superseded items.** Where a later change (org-authority, the 2FA rework) has
  superseded an earlier `[x]`, the inline note says so — re-verify against the current build
  rather than trusting the old tick.
- **A design-worthy failure becomes a finding**, not a fix-in-place; a plain bug is fixed and
  evidenced inline. See [`../findings/index.md`](../findings/index.md).
- **Setup, secrets, and helper scripts** live in
  [`../../../../scripts/auth-testing/README.md`](../../../../scripts/auth-testing/README.md).
