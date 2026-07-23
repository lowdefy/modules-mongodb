# Implementation Tasks — Magic-Link Sign-In for user-account

## Overview

These tasks implement the [magic-link sub-design](../design.md): wiring magic-link
as a first-class, config-driven sign-in/sign-up method on the already-built
`user-account` module. The parent module (login, signup, onboarding, the
merge-on-signup hook, `_build.authConfig`-driven method gating) is already
implemented — this work adds the magic-link **send affordance**, the no-session
**"check your email" (`link-sent`) state**, the **email-only passwordless shape**,
the **verify-callback routing**, and the **passwordless signup collapse**, plus a
demo consumer, docs, and verification.

## Tasks

| #   | File                                  | Summary                                                                                             | Depends On |
| --- | ------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-widen-merge-on-signup-binding.md` | Confirm/clarify the merge-on-signup binding is provider-agnostic verified-email (covers magic-link) | —          |
| 2   | `02-login-magic-link.md`              | Add the magic-link send affordance, `link-sent` state, email-only shape, `INVALID_TOKEN`, callbacks | —          |
| 3   | `03-signup-collapse.md`               | Collapse signup into the login email→link flow for passwordless; confirm `authPages.signUp` wiring  | 2          |
| 4   | `04-passwordless-demo-consumer.md`    | Add a passwordless (`emailAndPassword` off, `magicLink` on) demo consumer exercising the flow       | 2, 3       |
| 5   | `05-docs.md`                          | Document the passwordless shape and `magicLink.enabled` behaviour; regenerate `llms.txt`            | 2, 3       |
| 6   | `06-verify.md`                        | Build-check both demos, verify gated branches build, confirm `verify-email` orthogonality           | 2, 3, 4, 5 |

## Ordering Rationale

The work has two independent foundations that can run in parallel:

- **Task 1** (write-side) is a small spec clarification to the shared
  `create-or-link-contact` binding condition — the guard already keys on
  `user.emailVerified == true` (provider-agnostic), so a magic-link user created
  at verify time already links/creates a contact. This task confirms that and
  fixes the now-stale "verified-provider OAuth" comment so the intent is explicit.
  It touches no UI and has no dependencies.
- **Task 2** (the bulk of the UX) rebuilds the login page's method matrix to add
  the magic-link branch. It builds independently of task 1 (the page compiles
  without the contact link resolving), but the two together are what make
  send → verify → onboarding work end-to-end.

**Task 3** depends on task 2 because the passwordless signup collapse reuses the
login page's magic-link send path (sign-in and sign-up are one email→link action).

**Tasks 4 and 5** (demo consumer, docs) depend on the UX being in place (2, 3).
They can run in parallel with each other.

**Task 6** is the final verification gate: it build-checks both the full-matrix
demo and the new passwordless demo, inspects the generated artifacts to confirm
the config-gated branches resolve, and closes the design's `verify-email`
orthogonality open question. It depends on everything.

## Scope

**Source:** `designs/user-account-better-auth/magic-link/design.md`
**Context files considered:** `designs/user-account-better-auth/design.md` (parent
— Decisions 2, 3, 5, 7), `designs/user-account-better-auth/upstream-asks-2.md`.
The design's other referenced files live outside this repo
(`../../../../lowdefy-design/...`: `magic-link-callbacks`, `auth-emails`) and are
treated as upstream contracts, not editable here.
**Review files skipped:** `designs/user-account-better-auth/magic-link/review/review-1.md`
