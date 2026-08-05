# Findings — auth-testing campaign

A staging area for **design-worthy follow-ups** surfaced while running the campaign — issues
whose fix depends on a decision no one has made yet. **Bugs do not belong here:** a bug is
fixed directly and recorded as inline evidence on its checklist item. See the design's
[Finding lifecycle](../design.md#finding-lifecycle).

Each finding is one `F##-slug.md` file. IDs are **stable — never renumber** (they are cited
across other designs). New findings continue from **F31**. When a design takes a finding on,
move its file into a `_promoted/` subfolder and record the owning design in the table.

**Statuses:** `needs-design` · `investigate` (not yet root-caused) · `enhancement` ·
`promoted` · `closed`.

| F#                                       | Title                                                                              | Status         | Area                   | Promoted / closed to |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | -------------- | ---------------------- | -------------------- |
| [F2](./F2-login-resend-verification.md)  | No resend-verification affordance for a locked-out unverified user                 | `needs-design` | user-account / login   | —                    |
| [F10](./F10-mixed-login-ux.md)           | Mixed-deployment login UX: password form + magic-link button together is confusing | `enhancement`  | user-account / login   | —                    |
| [F12](./F12-dev-server-jit-hang.md)      | Dev-server JIT build hangs on the post-login navigation                            | `investigate`  | dev-server / tooling   | —                    |
| [F30](./F30-change-stamp-mql-literal.md) | Change stamp injected into MQL expression context unwrapped                        | `needs-design` | shared / change-stamps | —                    |
