# Auth tenancy verification — findings

Issues surfaced while working [`qa-test-plan.md`](./qa-test-plan.md) against the QA
environment (Atlas `modules-mongodb-demo-tenant-test` + SendGrid, `auth.organizations.policy: tenant`).
Environment setup is documented in
[`scripts/auth-testing/README.md`](../../scripts/auth-testing/README.md) §8.

**Numbering:** items are `T1`, `T2`, … — stable IDs, never renumbered. Three schemes
are in play and they are deliberately distinct:

| Scheme | Where                              | Scope                                                        |
| ------ | ---------------------------------- | ------------------------------------------------------------ |
| `T…`   | this file                          | The tenancy QA pass — multi-workspace behaviour on Atlas     |
| `F…`   | `scripts/auth-testing/FINDINGS.md` | The earlier auth pass on the local rig (F1–F29)              |
| `K…`   | `qa-test-plan.md` § Known issues   | Known issues a tester is told **not** to report (maps to F…) |

**Legend:** `[ ]` open · `[x]` done · `[~]` deferred/needs discussion

---

## Findings

- [ ] **T1 — The onboarding write stamps `updated.user.name` as an empty string, so
      "updated by" renders blank.** Observed 2026-07-31 from a single email/password
      signup → verify → onboarding run. The onboarding submit
      (`user-account/onboarding`, request `write_contact`) is the write that **creates**
      the user's name, so the session it stamps from doesn't have one yet:
      `user-contacts.updated.user` is `{name: "", id: "f73d106b-…"}`. The same empty name
      lands on the `log-events` row the write emits, and that document holds the
      contradiction in one place — `demo.title` reads "Machiel van der Walt updated their
      profile" (built from the profile being written) while its own `created.user.name` is
      `""`. Any "last updated by" / "changed by" display on the contact or the event
      renders blank.

      Only the first write after onboarding is affected; later profile edits stamp
      correctly (confirmed by the F27 re-test on the local rig). Fix: build the stamp's
      user name from the same source the event title already uses — the profile in the
      payload — rather than the pre-write session.

- [ ] **T2 — The verify-time contact creation stamps no actor at all.** Same run as T1.
      `user-contacts.created.user` is `{name: null, id: null}`, written by the
      `user-account/user-contacts-system` connection via `upsert_contact` during the
      `email.verified` hook. The `userId` of the user being verified is set in the very
      same `$setOnInsert` document (`userId: "f73d106b-…"`), so the identity was available
      at write time — only the stamp lacks it. Every self-signup contact therefore has an
      unattributable creator, and a "created by" column is blank for all of them.

      Milder than T1 in that a system write arguably has no actor, so the decision is
      whether the verifying user counts as one. Distinct from T1: this is the **created**
      stamp on the system write; T1 is the **updated** stamp on the onboarding write.

- [~] **T3 — Open questions from the tenant-policy signup inspection.** Recorded so they
  aren't re-derived next pass. None is a confirmed fault.

  - **`users.image` is absent** after onboarding. `CHECKLIST.md` line 116 names top-level
    `name`/`image` as the re-denorm target; `name` is written, `image` is not. Probably
    correct — the run wrote `profile.avatar_color` (`{from: "#ad1457", to: "#6a1b9a"}`),
    consistent with initials avatars derived at render. Confirm `image` is only populated
    by an upload.
  - **`users.role: "user"`** is set by BetterAuth's admin plugin. Nothing under `modules/`
    reads `_user: role`; page and endpoint gates come from `auth.pages.roles` /
    `auth.api.roles`. Whether it merges into `_user.roles` alongside the per-org
    `user-members.role` is engine-side and unresolved — it matters for the plan's §6.1,
    where suite-wide admin must refuse under `tenant`.
  - **`user-organizations.slug` is `org-<userId>`** (`org-f73d106b-…`). Not URL-facing
    under `tenant`, but check whether renaming the org (`organizations/settings`)
    regenerates it or leaves the userId-derived value in place.
  - **Signup and verify emit no `log-events` row.** A full signup → verify → onboarding
    run produced exactly one event, `update-profile`. Decide whether an account-created /
    email-verified event is wanted.

- [ ] **T4 — §5.1 does not seed every surface §5.2 checks.** The plan's §5.1 creates a
      contact, company, activity and deal, but §5.2 also checks Notifications (5.2.6),
      Files (5.2.7), Workflows/actions (5.2.8) and record timelines (5.2.9). The
      `deals`, `files` and `notifications` collections do not exist in the QA database at
      all, so those lists render empty — and §5's own instruction is to treat an
      unexpectedly empty list as a finding. As written the plan generates four false
      reports on its first pass. Either add seed steps to §5.1 or mark those rows
      "needs data — ask developer".

- [ ] **T5 — §1.6/§1.7 leave Alice behind a TOTP prompt for the rest of the plan.**
      Sections 2–5 all sign in as Alice, and §2.5 and §4 explicitly need a second browser
      where "trust this device" does not apply — so every subsequent sign-in costs a code
      from the authenticator. Move §1.6/§1.7 to the end of the plan, or run them on a
      fifth throwaway account. Related: §1.5 changes Alice's password mid-plan, so the
      account table at the top of the plan needs updating when the tester reaches it.

- [ ] **T6 — "If you only have one day" is not a runnable order.** It leads with §5, but
      §5.1 needs two workspaces with Alice in both — that is §4, which needs §1's signups.
      A tester following it top-down is blocked immediately. Intended as a priority list;
      reads as an execution order. Suggested order: §1.1 for Alice and Bob → §4's
      cross-invite → §5 → §6.1 → §3.

- [ ] **T7 — An invited user who signs up directly is stranded in a login redirect loop
      with no message.** Observed 2026-07-31. `machiel+test5@resonancy.io` was invited
      (role `user-admin`), then signed up with email+password from the signup page instead
      of via the invitation link. Result: `emailVerified: true`, a credential account, two
      `user-sessions` rows — and **no `user-members` row**, the invitation still
      `status: "pending"`, and the contact's `userId` unset. Every protected page bounces
      to `/user-account/login?callbackUrl=%2Fuser-account%2Fonboarding`; signing in again
      mints another session and bounces again. The two session rows are two attempts.

      **Mechanism** — two framework behaviours meet. `createActiveOrgPolicyHook.js:100`
      deliberately mints no org for a user holding a pending invitation ("An invited user
      joins the inviter's tenant on accept - mint nothing"), so the session has no
      `activeOrganizationId`. `resolveAuthentication.js:66` then resolves any session
      without one to `context.user = null` — unauthenticated for every protected page.
      Onboarding is protected, so the loop closes. The `callbackUrl` in that URL is
      correct; it is the engine's ordinary protected-page bounce, not a construction fault.

      **No diagnosis reaches the user.** `MEMBERSHIP_REQUIRED` is thrown only by
      `applyPinnedPolicy` (`:82`); `applyTenantPolicy` has no analogue. The login page
      cannot detect the state either, because `_user` is null — so module config is blind
      and the fix has to sit at the engine tier.

      **Escape hatch (verified):** opening `/user-account/accept?invitationId=…` from the
      invitation email works for an org-less session, and it is worth understanding why —
      it is the same wall that breaks onboarding. The page is public so it renders, and
      the client falls back to the BetterAuth session user when the server resolves no
      caller (`AuthConfigured.jsx:97` returns `{ roles: [], ...session.user }`), so
      `_user.id` / `_user.email` are populated and the `_switch` picks `signedin` rather
      than `nosession`. Accepting then repairs the session itself: BetterAuth's accept
      route calls `setActiveOrganization(session.session.token, …)`
      (`crud-invites.mjs:330`) as well as creating the member row, so the *current* session
      gains an `activeOrganizationId` and the wall stops nulling the caller. No sign-out or
      re-sign-in is needed.

      This bounds the severity: a user who still has the invitation email can recover
      unaided. Stranded for good are the ones who lost it, never noticed it, or whose
      invitation expires — for them there is no route and no message.

      **Decide between:** (a) auto-accept in `applyTenantPolicy` when a *verified* email
      matches the pending invitation — verification proves what the invite link proves, and
      this removes the limbo entirely; (b) redirect an org-less-with-pending-invitation
      session to the accept page instead of treating it as unauthenticated; (c) throw a
      tenant-side code so the login page can render a "you have a pending invitation"
      state. (c) alone only explains the wall — it leaves the user stranded.

      Related: the plan's §3.2 covers signing up *from* the invitation. Signing up
      independently of it is untested — worth adding to §3.3's awkward cases.

---

## Not findings

Recorded because each looks like a fault and will be re-reported otherwise.

- **`user-members.role: "owner"` is absent from the app's `auth.roles` catalog by
  design.** `modules/organizations/components/role_options.yaml:11` excludes it explicitly
  (ownership transfer out of scope for v1; the engine's last-owner guard is
  authoritative), `members_table.yaml` renders raw role ids so it displays as `owner`, and
  `get_my_member.yaml` reads it for the `is_org_admin` gate. It looks exactly like F29's
  orphaned-role case — it isn't one.

  **It does constrain F29(a):** injecting a member's non-catalog roles into the selector
  options, as F29 proposes, would surface `owner` as a selectable and removable tag on
  every owner row in `member_modal.yaml`, undoing that deliberate exclusion. Scope F29's
  fix to the user-admin surface, or exempt `owner` from the injection.

---

## Confirmed correct

From the same 2026-07-31 signup inspection — recorded so these aren't re-verified blind.

- **Contact → user link direction.** `user-contacts.userId` is set and
  `users.profile.contactId` is absent, verifying commit `047fe615`'s breaking change
  against real data.
- **Contact email fields.** Both `email` and `lowercase_email` carry the real address —
  F3/F4 confirmed resolved on the password path in this environment.
- **Verification gating.** `users` + `user-accounts` were created with no session; the
  session appeared 24s later alongside the org, member and contact rows. Confirms no
  session until verify, the org minted at verify under `tenant`, and the contact created
  at verify rather than signup (user-account Decision 7).
- **Live email delivery.** `emailVerified` went true and `user-verifications` is empty —
  SendGrid delivered, the link worked, the token was consumed. This is `CHECKLIST.md`
  Phase 0b's live-send precondition.
- **Tenant wiring.** One `user-organizations` row, one `user-members` row (`role: owner`),
  and `user-sessions.activeOrganizationId` matching that org.
- **Profile denormalization.** `user-contacts.profile` and `users.profile` identical,
  top-level `users.name` set, `profile.name` derived, `profile_created: true`.
- **Workspace naming.** The org was named from the email local part ("Machiel's Org")
  because no profile existed at mint time — matches the plan's §2.1 expectation.
