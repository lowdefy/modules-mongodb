# Investigate

F11 and F19 are root-caused and fixed upstream. They are separate defects, not
one problem with two faces. F12 is still open.

Finding IDs are stable — carried over from the auth-testing run. Don't renumber.

---

## F11 — Login on a direct visit (no `?callbackUrl=`) succeeds but never navigates

Reaching `/user-account/login` directly (bookmark, typed URL, the signup footer)
means no `?callbackUrl=`. A successful sign-in mints a session, resolves no
destination, and silently skips its navigation — the user sits on the same form.

**Fixed upstream** — Lowdefy design `auth-upgrade/features/callback-url-default`
adds the app home page as the default destination. No module change needed.

Distinct from **F1** (`03-upstream/`), which is the error-mapping path; this is
the success path.

---

## F19 — Onboarding completion doesn't navigate — user stranded after a successful save

On submit the profile saves and `profile_created` is written, but the page stays
on onboarding. `refresh_session` (`UpdateSession`) does not refresh the client's
session user, so `_user.profile.profile_created` stays unset and the app router
sends the user straight back to onboarding.

`UpdateSession` can only refresh roles and attributes — no session-user field
(`profile`, `name`, `emailVerified`) can be updated on the client without a full
page load. Not onboarding-specific: anything relying on `UpdateSession` to
surface a profile change is affected, including the profile edit modal.

**Fixed upstream** — Lowdefy design
`auth-upgrade/features/update-session-store-refresh`. No module change needed.

---

## F12 — Dev-server JIT build hangs on the post-login navigation

Twice on 2026-07-24, immediately after a successful login redirect, the
destination page stuck on the "building page" JIT screen and never resolved.
**Opening the same URL in a new tab cleared it every time.**

Presents as a dev-server build/HMR stall on the navigation that follows sign-in,
not a module-config fault — builds are green throughout. Same class as the
transient JIT hang seen earlier while diagnosing the demo router fix.

Left uninvestigated by request at the time.

**Decide after repro:** a tooling/dev-server issue to escalate upstream, or a
symptom of how the auth flow triggers navigation. If the latter, it likely
collapses into F11/F19 rather than being its own finding.
