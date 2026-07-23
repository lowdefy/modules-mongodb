# Task 6: Verify the build and close the verify-email open question

## Context

All implementation is done: the login page has the magic-link branch (task 2),
signup collapses for passwordless (task 3), a passwordless demo consumer exists
(task 4), and docs are updated (task 5). This task is the verification gate — it
build-checks both demos, inspects the generated artifacts to confirm the
config-gated branches resolve correctly, and closes the design's second open
question about `verify-email` orthogonality.

## Task

1. **Build both demos.**
   - `pnpm ldf:b` from `apps/demo` (full matrix) — confirms the **mixed** magic-link
     branch (password + magic-link on one page) still builds after task 2/3.
   - `pnpm --filter <passwordless-app> ldf:b` (task 4) — confirms the **email-only**
     branch builds.
     Both must succeed. Build failures are real config errors — fix them (or route
     back to the owning task).

2. **Inspect generated artifacts** (`.lowdefy/server/build/pages/**`) for each demo:
   - **Full-matrix demo login page**: password form, OAuth button(s), passkey
     button, **and** the magic-link send affordance all present; `link-sent` state
     present.
   - **Passwordless demo login page**: **no** password field, **no** "Forgot?"
     link, **no** password submit; magic-link send + `link-sent` present; the three
     callback params on the send resolve to module-scoped targets (`callbackUrl`,
     `newUserCallbackUrl` → onboarding, `errorCallbackUrl` → login).
   - **Passwordless demo signup route**: the collapsed (redirect/reuse) behaviour,
     not a second email form.

3. **Close the `verify-email` orthogonality open question** (design Open
   questions). Confirm there is **no adverse interaction** between magic-link and
   the `verify-email` flow / the security tile's resend-verification control:
   - A magic-link user is created with `emailVerified: true` (auto-verified), so
     the `verify-email` "check your email" flow never applies to them.
   - The security tile's resend-verification control is already gated on the
     unverified/credential state (parent Decision 5 / `tile_security.yaml` +
     `get_accounts.has_credential`), so it is simply **irrelevant** to a
     passwordless (credential-less, verified) user — no new code needed.
     Verify this by reading `modules/user-account/components/view/tile_security.yaml`
     and its gating request(s); confirm the resend control does not render for a
     verified, credential-less user. If a gap is found (the control would wrongly
     render), flag it — but per the design this is expected to be already handled by
     the existing credential/verified gate. Record the confirmation (a note in the
     design's Open questions section, or the task output) rather than adding a guard
     speculatively.

4. **Docs check**: `pnpm docs:check` passes (front-matter + generated-file drift).

## Acceptance Criteria

- `pnpm ldf:b` succeeds for `apps/demo` **and** the passwordless demo.
- Generated artifacts confirm: full-matrix login shows all methods incl.
  magic-link; passwordless login is email-only with the send + `link-sent` state
  and the three resolved callback targets; passwordless signup is collapsed.
- The `verify-email` orthogonality question is answered: the resend-verification
  control does not render for a verified, credential-less (passwordless) user; no
  speculative guard added.
- `pnpm docs:check` passes.

## Files

- No source changes expected — this is verification. Any change needed to make a
  build pass or a branch resolve is a fix routed back to task 2/3/4/5, not new
  scope here.
- Optionally: a short confirmation note appended to the design's **Open questions**
  in `designs/user-account-better-auth/magic-link/design.md` recording the
  `verify-email` answer (only if the design owner wants the design annotated;
  otherwise report in the task output).

## Notes

- This is a **build check, not a smoke test** (CLAUDE.md). Do not run a dev server
  or e2e — those need real secrets and a reachable MongoDB and are a separate human
  / `/r:dev-test` step.
- The `lowdefy-docs` MCP is not required for a build check; if you use it to
  cross-check the `Login` param resolution, note it needs the dev server running.
- Remember the **upstream dependency** from task 2: if the `magic-link-callbacks`
  params are not yet delivered, the `newUserCallbackUrl` / `errorCallbackUrl`
  targets may pass through raw rather than resolve through the shared resolver.
  Note the state of that dependency in your verification output.
