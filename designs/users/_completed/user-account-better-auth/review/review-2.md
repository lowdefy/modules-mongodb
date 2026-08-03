# Review 2

Scope: `designs/user-account-better-auth/design.md` + `upstream-asks.md`, re-verified against the current `modules/user-account` module, the sibling `user-admin-better-auth` design, and the auth-upgrade dependency designs (`engine`, `user-model`, `hooks`, `config-schema`, `mongodb`, `user-profile`) as they now stand.

Review 1's six findings are all resolved and annotated; none are re-raised here. The design is in good shape — the write-pathway split, `_build.authConfig` enablement, and the shared create-or-link fragment all check out against the upstream designs. The findings below are (1) one real cross-module correctness gap in the freshness argument, (2) one unestablished upstream dependency, and (3) a few accuracy/staleness nits.

## Correctness

### 1. The "module is the only writer of contact profile data" claim is false — user-admin also writes it, and its edits drift the target's `_user`

> **Resolved.** Confirmed valid against user-admin Decision 3 (bare contact write, no `UpdateUserProfile`). Adopted the shared-fragment fix: Decision 6 now states a **cross-module freshness invariant** (single-writer claim dropped) enforced by a new shared **`write-profile` fragment** that pairs the contact write with the `UpdateUserProfile` re-denorm — exported by this module, `_ref`'d by user-admin's profile save, mirroring the `create-or-link-contact` precedent (Decision 7). Also noted that `resolveAuthentication` reads the user row per request, so a re-denormalized bag is fresh on the target's next request. Updated: Decision 5 (Profile tile build), Decision 8 (new shared-fragment bullet), module surface Components row, ask-5 caveat (design + upstream-asks), and Related. **Cross-scope note:** user-admin's design must `_ref` the fragment in its profile-save routine — flagged in Decision 8 and to be carried in user-admin's own review.

Decision 6 (design line 94) and upstream ask 5 (upstream-asks lines 75, 151) rest the freshness of the denormalized `user.profile` bag on single-writer discipline: "the module is the only writer of contact profile data (upstream user-profile Decision 1's accepted trade)." That is not true across the suite. The sibling `user-admin-better-auth` design's **Profile tile** writes the _same_ contact profile fields for an arbitrary target user — Decision 3 (user-admin design line 74): "a profile save is a plain contact request," binding the same `fields.profile` / `state.profile.*` blocks (user-admin Decision 8).

So there are two writers of contact profile data: this module (self-service) and user-admin (operator editing _another_ user). When an admin edits user X's profile via user-admin, X's denormalized `user.profile` bag — and the `user.name` / `user.image` display copies — go stale, because:

- user-admin's profile routine is a plain contact write; nothing in its Decision 3/7 calls `UpdateUserProfile({ userId: X })` to re-denormalize.
- `UpdateSession` only refreshes the **caller's** session (user-profile Decision 4, confirmed), i.e. the admin's, not X's.

X's stale bag then persists until X _themselves_ triggers a module write — which, after an admin just corrected their name, may be never. The layout header/avatar/menus for X keep showing the pre-edit name/image, and the router's `_user.profile.profile_created` read (Decision 5) reflects a stale contact.

This is not a passing-drift-until-next-write case like the accepted trade in user-profile Decision 1 (which assumed one disciplined writer); it's a structurally-stale bag with no natural refresh path. `UpdateUserProfile` is a server-side step that takes an explicit `userId` (user-profile Decision 4, confirmed: `UpdateUserProfile({ userId, profile?, name?, image? })`), so the fix is available:

- **Fix (preferred):** user-admin's profile-save routine must also call `UpdateUserProfile({ userId: <target>, name, image, profile })` in the same routine as its contact write — exactly the mirror of this module's Decision 5 profile-save pathway. Since the write-back semantics are shared, consider folding the contact-write + `UpdateUserProfile` denormalization into a **shared profile-write fragment** (the same "one correct way" reasoning that produced the shared `create-or-link-contact` fragment in Decision 7), so neither module can write the contact without re-denormalizing.
- At minimum, this design's Decision 6 and upstream ask 5 must **stop asserting single-writer**, and state that any module writing contact profile data owes the target's `UpdateUserProfile` re-denormalization — this is a cross-module invariant, not a discipline one module keeps to itself.

### 2. The login page's passkey button has no established sign-in pathway

> **Resolved.** Confirmed valid: `Login`'s dispatch covers email/social/magic-link only (engine line 134); the catalog wraps passkey registration only (lines 149–150, 190). Verified against `@better-auth/passkey@1.6.23` that `signIn.passkey` exists and is a browser WebAuthn assertion ceremony (`startAuthentication` → `navigator.credentials.get`), i.e. a mirror of the `addPasskey` ceremony already wrapped by `PasskeyRegister`. Chose to **keep passkey as a full login method** by raising a new upstream ask, recorded (not folded into the delivered round-1 asks) in a new file **`upstream-asks-2.md` ask 6** (`PasskeySignIn` wrapping `signIn.passkey`), marked **not yet delivered**. Decision 2 now routes the passkey button to `PasskeySignIn` (not `Login`'s dispatch), notes the button is blocked until ask 6 lands, and records the drop-the-button fallback. The "Upstream asks" section intro points at the new file.

Decision 2 (design lines 47, 58) renders a passkey button whenever `_build.authConfig.passkey.enabled`, and states "All methods dispatch through the one `Login` action (engine Decision: dispatch by parameter)." Passkey _sign-in_ is not covered by that dispatch as specified upstream:

- The engine's `Login` wraps `signIn.email` and the social / magic-link sign-in calls (engine design line 132); passkey is called out there as having **no separate signup** because the account is created on first sign-in, but the engine never says `Login` wraps `signIn.passkey`.
- The self-service catalog (engine lines 149–150; upstream-asks ask 1) ships `PasskeyRegister` / `PasskeyDelete` only — no passkey _authentication_ action. Passkey registration is explicitly noted as a WebAuthn browser ceremony that "runs inside the action" (engine line 149); passkey sign-in is the same kind of browser ceremony and would need equivalent wrapping.
- The capabilities table (engine line 190) lists the passkey plugin's UI as a "registration page (`PasskeyRegister` / `PasskeyDelete`)" — again, no sign-in surface.

So Decision 2 depends on a `Login`-covers-`signIn.passkey` behaviour that the auth-upgrade designs don't establish. Either confirm upstream that `Login`'s dispatch-by-parameter includes the passkey WebAuthn sign-in ceremony (and cite it in Decision 2), or add it to the upstream-asks (ask 1 currently omits passkey sign-in). Until one of those, the passkey button in Decision 2 has nothing to call. This is the same "resolve the open question, don't defer it" case CLAUDE.md calls out — pin it in the design rather than leaving it to implementation.

## Accuracy / dependency consistency

### 3. `name` / `image` are written top-level on `user`, not "onto `user.profile`"

> **Resolved (auto).** Reworded design lines 84 and 94 to say the `UpdateUserProfile` step writes the contact's `profile` fragment onto `user.profile` **and** the `name` / `image` display copies onto top-level `user.name` / `user.image` (matching user-profile Decision 4, confirmed against source). Removes the internal inconsistency with the `_user.name` / `_user.image` resolution.

The design repeatedly says the `UpdateUserProfile` step denormalizes "`name` / `image` / `profile` **onto `user.profile`**" (design lines 84, 94; proposed-change bullet 5, line 11). Per user-profile Decision 4 (confirmed against `user-profile/design.md` line 59), `UpdateUserProfile({ userId, profile?, name?, image? })` **shallow-merges `profile` into the bag** but "optionally sets the `name` / `image` **display copies**" as _top-level_ `user.name` / `user.image` — not nested inside the `profile` bag. That is why the caller resolves `_user.name` / `_user.image` (top-level, engine's existing `_user` fields) rather than `_user.profile.name`. The design's own line 94 even resolves them as `_user.name` / `_user.image` while describing the write as "onto `user.profile`," which is internally inconsistent.

Fix: reword to "writes the contact's `profile` fragment onto `user.profile`, and the `name` / `image` display copies onto top-level `user.name` / `user.image`, so `_user.name` / `_user.image` / `_user.profile.*` all resolve." Small, but this is the load-bearing mechanism for Decision 6 and the design is the rationale source of truth.

### 4. `upstream-asks.md` ask 4 still claims "one binding per point deployment-wide" — hooks Decision 6 removed that rule

> **Resolved (auto).** Replaced the stale "(still one binding per point deployment-wide)" clause in ask 4 with the correct hooks Decision 6 statement (any number of hooks may bind a point; the build no longer enforces per-point uniqueness). Verified against hooks design lines 92 & 151.

upstream-asks line 71 (ask 4) says one endpoint may bind multiple points "(still one binding per point deployment-wide)." The hooks design has since revised this: Decision 6 ("Multiple bindings per point, composed in tier order") states "Any number of user hooks may bind one point … This **revises** the earlier one-user-hook-per-point rule; the build no longer enforces binding uniqueness" (hooks design lines 90–92, 151). The parenthetical is stale. It doesn't change this module's behaviour (it binds two _different_ points), but the delivered-status note misstates the upstream contract — drop the "(still one binding per point…)" clause.

## Minor

### 5. Decision 2's error map should specify a default branch for unmapped codes

> **Resolved (auto).** Added to Decision 2 that the error-code table keeps a catch-all `default` branch (as today's `login.yaml` does), so unmapped codes degrade to a generic message; clarified the three named codes are the friendly-message set, not exhaustive.

Decision 2 (design line 60) enumerates three codes — `MEMBERSHIP_REQUIRED`, `EMAIL_NOT_VERIFIED`, `INVALID_EMAIL_OR_PASSWORD` — for the shared error-code → message table. BetterAuth's `BASE_ERROR_CODES` and the OAuth/magic-link redirect paths can surface codes outside that set (link expired/consumed, provider errors, rate limits). Today's `pages/login.yaml` already carries a `default` branch (lines 24–36: "An error occurred while logging in…"). State in Decision 2 that the mapping keeps a catch-all default so an unmapped code degrades to a generic message rather than rendering blank — otherwise the three-code table reads as exhaustive.

## Next Step

Run `/r:design-action-review user-account-better-auth` to resolve, reject, or defer each finding.
