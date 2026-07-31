# Review 1

Scope: `designs/user-account-better-auth/design.md` + `upstream-asks.md`, verified against the current `modules/user-account` module and the auth-upgrade dependency designs (`engine`, `user-model`, `hooks`, `config-schema`, `mongodb`).

Overall the design is coherent and the write-pathway split, the "one module owns both page families" call, and the section-scoped workspace are well-argued and consistent with the user-admin counterpart. The findings below are gaps and a few claims that don't survive checking against the dependency designs — not structural objections.

## Correctness

### 1. "Errors are inline" is only true for password sign-in — OAuth and magic-link errors still arrive by redirect

> **Resolved.** Reworded Decision 2 to split by method: password returns errors inline on `Login`; OAuth/magic-link membership and verification failures arrive via the `authPages.error` redirect to the login page, which reads the query code (today's `_url_query: error` path) and maps it through the same message table. Dropped the "`?error=` handling dies" claim — it's retained for the redirect methods. Kept the "no dedicated error page" decision (login page serves the `authPages.error` role, per the `login-no-access` mockup) — the finding doesn't touch it.

Decision 2 (design lines 62–65) states "NextAuth's `?error=` redirect handling dies. BetterAuth returns errors inline on the sign-in call" and "no dedicated error page." That is only correct for `signIn.email`. The engine design (engine/design.md line 217) is explicit that the hard-wall error surfaces differently per method: `MEMBERSHIP_REQUIRED` "surfaces inline in the client `signIn.email` response; **for magic link it surfaces when the emailed link is consumed** … **OAuth surfaces it via the error-callback redirect**" — i.e. a redirect to `authPages.error` (which this design points at the login page). `EMAIL_NOT_VERIFIED` (engine line 216) has the same shape for the link/redirect paths.

So the login page cannot drop query-param error handling as the decision implies — for OAuth and magic-link it must still read an error code off the redirect landing (the same login page) and map it, exactly the `?error=`-style path the current `pages/login.yaml` uses (`_url_query: error`, lines 20–41). Fix: reword Decision 2 to "password sign-in returns errors inline; OAuth and magic-link membership/verification errors arrive via the `authPages.error` redirect to the login page, which parses the code" and keep a query-param branch in the login page's error mapping.

### 2. Change-password / 2FA gating is deployment-wide, but password-credential presence is per-user

> **Resolved (reworked).** Split gating into two honest layers and, in the process, retired the mirror vars the finding's `methods.password` symptom pointed at. **Deployment layer** now reads the app's auth config directly via the delivered `_build.authConfig` operator (config-schema) — `emailAndPassword.enabled` / `twoFactor.enabled` / `passkey.enabled` — so the `methods` / `two_factor` / `passkeys` mirror vars are gone (config-schema built `_build.authConfig` precisely to kill them). **Per-user layer**: change-password and password-gated 2FA enrol/disable additionally gate on a native read of `user-accounts` for the caller's `provider: "credential"` row (reusing the linked-accounts tile's read), so a credential-less OAuth/magic-link user sees the controls hidden rather than a 400. Reworked Decision 5 (security bullet), Decision 2 (enablement from `_build.authConfig`; `methods` var slimmed to a `providers` display-metadata var since the projection's `providers` gives only `{id,type}`), Decision 8 (var list), and proposed-change bullet 3.

Decision 5 (design line 87) shows **change password** "only when `methods.password`" and 2FA behind the `two_factor` var. But `methods` is the _login-page_ var — the set of sign-in methods the deployment offers (Decision 2). Whether a given caller can change a password depends on whether that user actually holds a password credential, which is per-user, not per-deployment: an OAuth-only or magic-link-only user has no credential row. `changePassword` requires a `currentPassword` (upstream-asks line 18) and `twoFactor.enable`/`disable` are password-gated (upstream-asks lines 22, 24) — all three break for a credential-less user even when `methods.password` is true suite-wide.

Fix: gate the change-password action (and password-gated 2FA) on a native read of `user-accounts` for a credential (`provider: "credential"`) account for the caller, not solely on the `methods.password` var. (A "set password" flow for credential-less users is correctly out of scope, but then the tile must simply hide, not show a control that will 400.)

### 3. `create-if-missing` reintroduces the one-contact-per-email invariant without a guard

> **Resolved.** Reshaped Decision 7: create-if-missing → create-or-**link**, an upsert keyed on `lowercase_email` that reconciles to the existing row on duplicate-key (never mints a second contact). Corrected the claim that `users.contactId` guards this — it enforces one `user` per `contact`, not one `contact` per email. Recorded the real guard as a schema requirement: a unique index on the contact's `lowercase_email` (field/index continue today's `user-contacts` convention; exact partial-unique shape deferred to the schema pass). Both racing callers — this hook and user-admin's invite — now run one **shared `create-or-link-contact` fragment**, owned/exported by user-account and `_ref`'d by user-admin. Updated user-admin's Decision 7 (line 104) to repoint at the shared fragment and to cite the `lowercase_email` unique index instead of `users.contactId`.

Decision 7 (design lines 100–106) extends the merge hook with create-if-missing so "every user has a contact by first session." This resurrects exactly the invariant the retired `check` page + `create-profile` API used to hold (one contact per email). The merge hook matches by verified email then inserts if absent — a check-then-insert with a race window. Two paths collide:

- Concurrent first sessions for the same email (rare but possible with magic-link + retry).
- An open/invited signup racing the admin **invite** flow, which _also_ creates-or-links a contact by email (user-admin Decision 7).

Without a DB-level guard both can mint a second contact, and the platform's partial-unique index is on `users.contactId` (mongodb design line 47), which does **not** prevent duplicate _contacts_. Fix: make create-if-missing an upsert keyed on a unique index over the contact's email (or funnel both this hook and the user-admin invite through one create-or-link primitive). This is schema-adjacent — worth confirming the `user-contacts` email uniqueness index exists (see `/r:design-schema`).

## Dependency consistency

### 4. The merge hook is described as the hooks design's flagship, but that hook is link-only

> **Resolved.** Decision 7 now states the upstream flagship hook is **link-only** (`:return`s `contactId` against an existing contact) and that the **create** half is this module's extension, so no reader hunts create-if-missing upstream. Added a paragraph noting the two binding points write `contactId` back by different mechanics — `user.create.before` sets it inline via `:return` (pre-write); `email.verified` is a synthetic post-write point that writes it with an explicit update — so the create-or-link fragment's write-back branches on which point fired.

Design line 101 calls this "the hooks design's flagship endpoint hook." Per the hooks design the flagship hook is **link-only** — it "matches by verified email and `:return`s the record with `contactId` set" against an _existing_ contact (hooks/design.md line 128); there is no create-if-missing there. Create-if-missing is a genuine module-side extension, not something inherited — say so, so a reader doesn't go looking for it upstream.

Also the two binding points have different write mechanics that the create-if-missing logic must handle distinctly: `user.create.before` is a pre-write hook that sets `contactId` via `:return` (hooks line 96), whereas `email.verified` is a **synthetic post-write** point ("fires _after_ the user write, so a hook here sets fields … with an explicit update", hooks line 103). The mint-or-link write is a `:return` payload mutation in one case and a separate `contact` insert + explicit `user` update in the other. Note this in Decision 7 so the endpoint isn't specced as one uniform path.

## Gaps

### 5. No profile-completeness signal defined for onboarding routing

> **Resolved.** Root-caused a bigger omission: the split model drops the whole `profile` subtree from `_user` (not just the flag), breaking both the router's completeness read and the layout's name/image. Added **upstream ask 5** — a hook that projects the caller's contact `profile` onto `_user` (with a denormalize-to-`users` perf fallback); ask 3 (`contactId`) folds under it on the read side, stays for writes. This also **retires the Decision 6 `UpdateUser` name/image sync** — `_user.name`/`image`/`profile.*` now resolve from the contact live, no drift. Completeness stays an **explicit `profile.profile_created` flag** on the contact, set by the onboarding save: kept (not derived) because the required-field set is deployment-configurable — a contact can arrive named (invite prefill/CRM/OAuth) yet still owe deployment-specific onboarding fields (e.g. birthday), so no fixed field means "done." create-or-link mints a **bare** contact (flag unset) so first login routes to onboarding; the router reads `_user.profile.profile_created`. Updated Decisions 5, 6, 7, proposed-change bullet 5, and both upstream-asks files. **Consistency-pass flags** (not chased here): the `UpdateUser` entry in ask 1's catalog and any module-surface references to the sync may need pruning now the sync is gone.

Decision 5 (line 92) makes `onboarding` "the page only updates" an already-existing contact, and Decision 7 guarantees the contact exists by first session. But today the completeness signal is `profile.profile_created: true`, set by `create-profile` (current `api/create-profile.yaml` line 46), and that API is being retired (line 135). The design says routing to onboarding "is app/router territory, as today" — but "as today" depended on the now-retired marker. With create-if-missing minting a **bare** contact, nothing in the design sets or defines a completeness flag, so the app has no signal to distinguish "needs onboarding" from "done."

Fix: state where completeness is marked in the new model — either the merge hook stamps an incomplete contact that `onboarding`'s save flips to complete (retain `profile_created` or equivalent), or the workspace/onboarding derive completeness from required contact fields being present. Either way it needs to be in the design, since the old marker's owner is gone.

## Minor

### 6. Two unverified specifics to pin down before implementation

> **Resolved.** Both pinned. **(a) `_user.contactId`** — now delivered upstream (the resolved caller carries `contactId`; upstream ask 3 status), so reads/writes target it directly and the aggregate-from-`users` fallback is dropped. **(b) `invalid credentials` code** — verified against BetterAuth source (`@better-auth/core/error`, `BASE_ERROR_CODES`): the bad-credential code is `INVALID_EMAIL_OR_PASSWORD` ("Invalid email or password"), `EMAIL_NOT_VERIFIED` confirmed alongside it. Decision 2's error map now names `INVALID_EMAIL_OR_PASSWORD` explicitly instead of the vague "invalid credentials."

- **`_user.contactId` (upstream ask 3).** The engine design lists `contactId` as an internal additionalField on the _`user` record_ (engine line 147) but never enumerates the `_user` _operator_ shape, and the engine explicitly delegates that to user-model/migration. The ask + "aggregate from `users`" fallback (upstream-asks lines 47–55) is therefore sound, but treat the fallback as the assumed baseline until the `_user` shape is confirmed upstream — don't design reads that assume `_user.contactId` is present.
- **`invalid credentials` error code.** Decision 2 maps three codes; only `MEMBERSHIP_REQUIRED` and `EMAIL_NOT_VERIFIED` are attested in the engine design (lines 216–217). Confirm the exact BetterAuth code string for bad-password before hardcoding it into the login page's error map.
