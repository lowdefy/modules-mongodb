---
"@lowdefy/modules-mongodb-user-account": minor
---

**Breaking: `user-account` is rebuilt on Lowdefy 7's BetterAuth auth engine.** It is now the app's auth-pages module and its signed-in account workspace. This is a rebuild, not an in-place upgrade: expect to redo the module entry. Step-by-step upgrade: `docs/user-account/how-to/migration.md`.

**Pages.** The auth engine ships no UI, so every auth page is this module's, and the build points `auth.authPages.*` at them:

- `login` renders the sign-in methods the app's `auth:` config enables (email and password, magic link, email code, OAuth, passkey), read through `_build.authConfig` rather than module vars. The new `providers` var sets each OAuth button's label, icon and order. Pressing Enter in a field does what the page's main button does. Login also serves the `authPages.error` role.
- `signup`, `forgot-password`, `reset-password` and `verify-email`. Signup captures the email and password only, and `onboarding` captures the profile. Every verification email the module sends carries the inbound `?callbackUrl=` on to login.
- `magic-link`: the emailed sign-in link opens a page that signs in on a button click, so a mail scanner that opens the link cannot use it up. With `auth.emailOTP` on, the same email carries a code that the "check your email" screen accepts, and a login page reached from an expired link asks for that code before offering a new link.
- `two-factor` (the second-factor challenge) and `two-factor-enrol`, a protected page that `auth.twoFactor.required` sends unenrolled callers to.
- `accept` accepts an invitation for `?invitationId=`. It names the inviter and the organization, explains an expired, withdrawn or wrong-address invitation, and prefills and locks the invited address on login and signup. After the accept it enters the app with a full page load to home, so the menus reflect the new roles.
- `onboarding` (replacing `new`) completes a first-login profile, prefilled from what the inviting admin entered, and offers a passkey when passkeys are enabled. Saving sets `profile.profile_created: true`, the marker the app's router reads.
- `view` is one account page with section-scoped tiles: Profile, Security (email and verification, change password, two-factor, passkeys, linked accounts), Sessions (list, sign out others) and, with the new `mcp_tokens` var, Access tokens.
- `logout`.

**Passwordless apps.** With `emailAndPassword.enabled: false` and `magicLink.enabled: true` sign-up collapses into the login page and there is no `/signup` route, so the app must set `auth.authPages.signUp: login`.

**Access tokens.** With `mcp_tokens: true` the account page lists the member's own MCP member tokens in the active organization and creates and switches them off. A new token is shown once, with a copy button. It needs the app's MCP authorization server (`auth.oauthProvider`). Each create and switch-off is logged as `org-mcp-token-created` / `org-mcp-token-revoked`.

**Removed:** the `new` and `edit` pages (`verify-email-request` is now `verify-email`), the `create-profile` endpoint, and the `app_name` var. `event_display` is a flat `{ event-type: template }` map. Its templates receive `user`, `org-member-joined` also receives `inviter` and `organization`, and the token events receive `token`.

**Contacts and sign-in.** A `session.create.after` hook (`ensure-contact-on-signup`) makes sure every person with a verified email has a contact in the session's organization. It links an existing contact for that address or creates one, and it writes its change log to `log-changes-system`. `update-profile` writes the contact and copies the profile onto the auth user in the same routine, so `_user.*` is current with no client-side sync. Email changes are not supported.

**Organizations.** The module builds and runs under both `auth.organizations.policy: pinned` and `tenant`. Under `tenant` an invited person who signs in from the login page holds no organization yet. The engine marks them `_user.awaiting_organization` with `_user.pending_invitation_id`, and the app's router should send them to `accept`. Joining is logged as one `org-member-joined` event in the invitation's organization, through the new `log-member-joined` endpoint and, under `tenant`, the shared `user-events-system` connection.

**Required setup:**

- The app runs Lowdefy 7 with an authored `auth:` config and an `auth.email` connection. Every auth email goes through `auth.email`, and `notifications` is not a dependency.
- The BetterAuth adapter database, the `user-contacts` connection and the module's read connections resolve to one MongoDB database.
- Indexes, in `docs/user-account/reference/indexes.md`: two partial-unique `user-contacts` indexes, `{ organization_id, lowercase_email }` and `{ organization_id, user_id }`, and a unique `user-two-factors { user_id }`. The auth collections store snake_case columns (`user_id`, `email_verified`, `expires_at`).
