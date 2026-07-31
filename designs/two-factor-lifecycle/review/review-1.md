# Review 1

### 1. Satisfaction is a property of the user, not of the session — so `required` is still bypassable, and the "awkward case" has no mechanism

The decision to define satisfaction as `twoFactorEnabled || passkeyCount > 0` (Decision 6) measures
whether the person _holds_ a second factor, never whether the session in front of you _presented_
one. The enforcement gate (Decision 5) reads that value. Put those together and a passkey-holding
user who also has a password signs in with the password alone and is admitted:

- BetterAuth's sign-in hook bails before doing anything when the user has no TOTP row —
  `if (!data?.user.twoFactorEnabled) return;`
  (`better-auth/dist/plugins/two-factor/index.mjs:193`, inside the `/sign-in/email` matcher at
  `:190-192`). No challenge, full session, cookie set.
- The gate then computes `twoFactorSatisfied = true`, because `passkeyCount > 0`.
- Nothing anywhere compares "factor presented this sign-in" against "factors held".

Decision 6 claims this case is resolved — "they are **routed to enrolment** … _if the sign-in path
cannot present a factor this user holds, send them to enrol_" — but that italicised branch is not
the branch Decision 5 specifies, and no piece in the Surface table computes its input. As written,
the design ships the exact failure it rejects a naive `required` flag for: a flag advertising a
guarantee the sign-in surface does not deliver. It is worse than the naive version in one respect,
because Decision 6 documents the hole as closed.

The same gap widens once Decision 7's hooks exist: they replicate the plugin's interception, and the
plugin's first act is that `twoFactorEnabled` early-return, so a passkey-only user's magic-link
sign-in also passes straight through.

(A minor factual slip in the same paragraph: it reasons that "`twoFactorMethods` would come back
empty". The hook never reaches the point of computing methods — it returns at `:193`. The conclusion
holds; the mechanism stated does not.)

Three ways out, and the design should pick one rather than leave the italics standing:

- **Make satisfaction session-scoped** — record on the session whether a second factor was presented
  (passkey assertion, or a passed TOTP challenge) and gate on that. Most correct, largest ask.
- **Restrict the sign-in paths available to a passkey-only user under `required`** — if the only
  factor held is a passkey, only the passkey path may mint a session. Smaller, but it is a new
  cross-path rule the engine must own.
- **Drop passkey satisfaction under `required`** — TOTP or nothing. Contradicts Decision 6's
  Entra/Okta argument, but it is at least honest and needs no new machinery.

---

### 2. A user with no password cannot complete forced enrolment, so `required` locks out every OAuth-only and magic-link-only member

`/two-factor/enable` is password-gated unconditionally under the engine's current config:

- The endpoint calls `shouldRequirePassword(ctx, user.id, allowPasswordless)` and throws
  `INVALID_PASSWORD` without a valid password
  (`better-auth/dist/plugins/two-factor/index.mjs:82-89`).
- `shouldRequirePassword` returns `true` immediately when `allowPasswordless` is falsy
  (`better-auth/dist/utils/password.mjs:26-30`).
- The engine passes only `issuer` and `schema` to the plugin — `allowPasswordless` is never set
  (`packages/api/src/routes/auth/getBetterAuthConfig.js:328-334` in the engine tree).

So the enrolment page in Decision 5's flow — which the Surface says lands "in the `onboarding.yaml`
mould", and whose existing self-service sibling opens on a password phase
(`designs/users-fixes/2fa-enrolment-modal/design.md`, the `password → scan/confirm → backup codes`
phase chain over `modules/user-account/components/view/modal_enroltotp.yaml`) — cannot be completed
by anyone who signed up through OAuth or magic link. Combined with the gate, that is an infinite
bounce: every request redirects to enrolment, enrolment cannot be finished, and there is no admin
control that helps (Decision 2 correctly refuses to ship an exemption).

This is not hypothetical for the demo consumer the Surface commits to: `apps/demo/lowdefy.yaml:53-54`
enables `magicLink`, and the file's own comment describes the config as a "full method matrix". Set
`required: true` there and a magic-link-only demo account is bricked.

The fix is small and belongs in the upstream asks as a fourth item: have the engine pass
`allowPasswordless: true`. Note that this does _not_ weaken anything — `shouldRequirePassword` still
demands the password from any user who actually holds a `credential` account
(`password.mjs:28-29`), so password users keep the re-authentication step and passwordless users stop
being asked for a credential they do not have. The enrolment page then needs a signal for whether to
render the password field at all, which is a design question worth settling here rather than at code
time.

---

### 3. The enforcement gate needs an exemption set, and without one Decision 10's "enrolment comes last" is the wrong way round

The open question "Where the enrolment redirect is enforced" is framed as an implementation detail
("affects whether an unsatisfied caller gets a redirect or a 403"), but the design decision hiding
underneath it is _which requests the gate does not apply to_, and that has consequences the design
currently states incorrectly:

- **The enrolment page itself.** An unsatisfied caller loading `two-factor-enrol` is an unsatisfied
  caller. Without an explicit exemption the gate redirects them to the page they are already on.
- **Logout.** `modules/user-account/module.lowdefy.yaml:179-181` puts `logout` in `auth.public`
  precisely so it renders when signed out, but an unsatisfied _signed-in_ user needs to reach it too.
  If the gate fires on every authenticated request, the only escape from a stuck enrolment is
  clearing cookies.
- **Ordering.** Decision 10 says the invite path is "accept page, then onboarding
  (`profile_created`), then enrolment", and calls enrolment-last "deliberate — a person who abandons
  at enrolment has at least a complete contact record". That ordering cannot hold. Onboarding is an
  _app-level router branch_ (`apps/demo/pages/router.yaml:19-26`, the `_ne: [_user:
profile.profile_created, true]` branch) which only runs once the router page has been served; an
  engine gate that intercepts requests necessarily fires first. Under this design enrolment comes
  **first**, and the stated benefit is inverted — an abandoning invitee leaves no contact record at
  all. Either the gate exempts the onboarding page (which means the engine knows about a module's
  page role, which it does not), or Decision 10's claim should be corrected to say enrolment comes
  first and the invitee abandons before onboarding.

Per the repo's "resolve the open question; don't defer it" rule this one is answerable now: enumerate
the exempt set (the `authPages` roles, `twoFactorEnrol`, logout) and say plainly where enrolment sits
relative to onboarding.

---

### 4. Deleting the trust-device records is not a query you can write from a `userId` — and the query that does work also sweeps in-flight challenges

Decision 1's third write is "Delete the user's `trust-device-*` verification records", and
upstream-asks.md ask 1 repeats it verbatim. That phrasing implies you can find them by identifier
prefix, keyed to the user. You cannot: the identifier is pure entropy and carries no user reference —
`const trustIdentifier = \`trust-device-${generateRandomString(32)}\``, with the user id stored in
the record's `value` instead
(`better-auth/dist/plugins/two-factor/verify-two-factor.mjs:49-55`; the rotation path at
`dist/plugins/two-factor/index.mjs:207-213`builds it the same way). BetterAuth's own`/two-factor/disable` sidesteps this by reading the identifier out of the requester's cookie
(`index.mjs:179-184`) — which is exactly the affordance an admin-side step does not have, and the
design already knows the cookie is out of reach.

So the only workable clause is `where: [{ field: 'value', value: userId }]` on the `verification`
model, and that matches more than trust records: the challenge records the sign-in hook creates are
`{ identifier: '2fa-…', value: user.id }` (`index.mjs:238-241`, and Decision 7 step 3 specifies the
same shape). A `value`-only delete therefore also invalidates any 2FA challenge in flight for that
user. That is arguably the _right_ behaviour for a reset, but it should be a stated consequence, not
a discovered one — and if it is not wanted, the clause needs a second `starts_with` condition on
`identifier`.

Worth writing the exact `where` into the ask. The design is otherwise precise about adapter calls,
and this is the one write an implementer will have to guess at. (The model name is fine as the
logical `verification` — the engine remaps the collection to `user-verifications` via
`packages/api/src/routes/auth/modelNames.js:24` and the adapter resolves it, the same way existing
steps pass logical `user` / `member`.)

---

### 5. The audit event needs an `event_types` entry, not just an `event_display` default

The Surface lists `defaults/event_display.yaml` for the `two-factor-reset` title template and stops
there. The Activity tile's timeline reads a second, separate registry for colour, title, and icon:
`modules/user-admin/enums/event_types.yaml` (every one of the module's eleven existing event types
has an entry, e.g. `sessions-revoked` at `:23-26`), which reaches the timeline through
`modules/shared/enums/event_types.yaml:2` (`_build.object.assign` over each module's enum file) and
`modules/events/components/events-timeline.yaml:102-103` — the component `modules/user-admin/components/view/tile_activity.yaml:15-16` mounts.

Without an entry the reset event renders in the timeline with no icon or type label. Add
`two-factor-reset:` to `enums/event_types.yaml` and list it in the Surface. (Decision 4's "no new
manifest vars" is correct and unaffected — `event_display` is declared as a bare
`type: object` at `modules/user-admin/module.lowdefy.yaml:67-73` with no per-type sub-properties, so
a new key needs no manifest change and no `docs:gen` run.)

---

### 6. The redirect to the challenge page drops the caller's destination

Decision 7 step 6 and ask 3 step 6 both specify `throw ctx.redirect(authPages.twoFactor)`, bare. The
challenge page finishes sign-in by navigating to the callback URL it was given on the query string —
`_if_none: [_url_query: callbackUrl, "/"]`
(`modules/user-account/pages/two-factor.yaml:104-111`), which the password path supplies explicitly
when it routes there (`modules/user-account/pages/login.yaml:289-292`). A bare redirect means every
magic-link and OAuth user who passes the challenge lands on `/` instead of wherever the link or the
`callbackURL` was pointing — silently, and only on the paths where a deep link is most likely
(emailed links).

Both hooked endpoints have the destination in hand at that moment. The hook should carry it —
`?callbackUrl=<original callbackURL>` — and the ask should say so, otherwise the design's claim that
the challenge page is merely "taught to handle arrival by redirect (cookie already set)" is true of
the page but leaves the flow lossy.

While in that area: `two-factor` is currently listed under `auth.public` in
`modules/user-account/module.lowdefy.yaml:179-181`. Once it also serves an `authPages` role it is
auto-public by role (the manifest's own comment at `:176-178` says role pages are auto-public). The
Surface should say whether the `public` entry goes away or stays as belt-and-braces — a page that is
public two ways is the kind of thing the next reader treats as an unsettled question.

---

### 7. Ask 1 ships alone or it doesn't — the two files disagree, and it matters for sequencing

`design.md:18-19` says "All three asks are outstanding — nothing here ships without them."
`upstream-asks.md:8-9` says "Ask 1 is independent and ships the recovery capability on its own; asks
2 and 3 are the enforcement half and only make sense together."

The second reading is the right one and the design should adopt it, because the two halves are not
in the same state of readiness. Admin reset is one small step plus a routine, fully specified, with
no unresolved question in it. Required enrolment carries findings 1, 2, and 3 above, has no grace
period (Non-goals), cannot be turned on retroactively without lockout risk (Decision 10), and by its
own cost list should not be enabled alongside an enterprise IdP. Gating the recovery capability —
which fixes a permanent-lockout bug that exists **today** — behind the enforcement half's remaining
design work is the expensive choice.

Decision 9's composition argument survives a split intact: reset produces an unenrolled user, and
whenever `required` lands it picks that user up. Nothing about shipping reset first has to be undone.
Recommend restating the front matter as "ask 1 ships independently; asks 2 and 3 land together", and
splitting the module work to match.

---

### 8. Decide the reset notification now

The first open question — does the target get an email when their 2FA is reset — reads as a
cost/benefit question ("a fifth template and a fourth upstream ask") deferred "pending a decision on
whether the audit event plus the forced re-enrolment is sufficient notice". It isn't sufficient, and
the design has already assembled the argument against it:

- The audit event lands in the user-admin Activity tile, which the target cannot see.
- Decision 3 revokes their sessions, so from the target's side the observable event is being signed
  out with no explanation.
- Decision 4's whole premise is that help-desk reset is the dominant social-engineering vector. The
  out-of-band attestation checkbox is explicitly "a speed bump and a paper trail, not a guard".
  Notifying the account holder is the control that actually catches the attack the checkbox only
  documents — it is how the victim finds out.

Since finding 7 argues asks 2 and 3 move to a later phase anyway, a template ask alongside ask 1 is
no longer the schedule risk it looks like here. Worth deciding in this design rather than leaving it
for whoever writes the ask.

---

### 9. `_user.twoFactorSatisfied` is undefined in exactly the deployments most likely to read it

Decision 6 makes the field a shared contract — "both the engine's own enforcement and any module UI
read one value that cannot disagree with itself" — then computes it only when `required === true`
("gated on `required === true` so deployments without it pay nothing"). With `required` off the field
is absent, so any module UI reading it sees a fully-enrolled user as unsatisfied.

The cost being avoided is only the passkey read, and the expression short-circuits: an enrolled user
never needs it, since `twoFactorEnabled` is already on `session.user` and rides through
`resolveAuthentication`'s spread (`packages/api/src/context/resolveAuthentication.js:92-101` in the
engine tree). So the field can be computed always, with the passkey read gated on `required === true
&& twoFactorEnabled !== true` — no per-request cost for deployments that don't use the flag, and no
value that means two different things depending on config. Either specify that, or say plainly that
the field is only meaningful under `required` and no module may read it otherwise.
