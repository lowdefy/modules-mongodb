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

  - ~~**`users.image` is absent** after onboarding.~~ **Resolved 2026-08-03: it is
    written.** A fresh onboarding on `apps/tenant-demo` wrote `users.image` as a generated
    initials-avatar SVG data URI (`MB` on the `#2e7d32`→`#558b2f` gradient matching
    `profile.avatar_color`), alongside `profile.picture` holding the same value. So the
    avatar is generated at write time, not derived at render, and `image` is not
    upload-only. The 31 Jul run's missing `image` was the older build via `apps/demo`.
  - **`users.role: "user"`** is set by BetterAuth's admin plugin. Nothing under `modules/`
    reads `_user: role`; page and endpoint gates come from `auth.pages.roles` /
    `auth.api.roles`. **Resolved 2026-08-03: it does not merge into `_user.roles`.** Server
    logs resolve the caller's roles from the per-org `user-members.role` alone — the owner
    logged as `roles: ["owner"]` and the `user-admin,manager` member as
    `roles: ["user-admin","manager"]`, with no `"user"` in either. So the BetterAuth
    top-level role is inert for authorization here, and §6.1's refusals come from the
    engine's `auth.userAdminRole` floor rather than from role resolution.
  - **`user-organizations.slug` is `org-<userId>`** (`org-f73d106b-…`). Not URL-facing
    under `tenant`. **Resolved 2026-08-03: renaming does not regenerate it.** Renaming
    "Machiel's Org" → "Alice Test Co" via `organizations/settings` left
    `slug: org-f73d106b-…` untouched, and a fresh signup minted
    `slug: org-3d8dac19-…` — the engine sets it from `session.userId` at mint
    (`createActiveOrgPolicyHook.js:143`) and never revisits it.
  - **Signup and verify emit no `log-events` row.** **Re-confirmed 2026-08-03** on
    `apps/tenant-demo`: a full signup → verify → first sign-in → onboarding run produced
    exactly one event, `update-profile` (keyed under `tenant-demo`, so the app-slug keying
    is correct on new rows). Still a product decision — whether an account-created /
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

- [x] **T8 — The org-switcher's reads are declared on every page but never fetched, so the
      workspace name never renders and the switcher dropdown can never appear.** Observed
      2026-08-03 on `apps/tenant-demo` (production build, `ldf:s`), signed in as the
      Workspace A owner. The header shows the `AiOutlineBank` icon with **no name beside
      it** on every page.

      **Mechanism.** `modules/layout/components/page.yaml:109` concatenates
      `header_extra.requests` — the pair from `org-switcher-requests.yaml` — into the
      page's `requests`, so both compile into every page (confirmed in the build
      artifacts: `pages/organizations/members/requests/get_switcher_{organization,memberships}.json`
      both exist). But the layout's `onMountAsync` (`:126–150`) issues a `Request` action
      for `notifications_unread_count` only. Nothing anywhere fires the switcher's two —
      a repo-wide grep finds them read by `_request:` operators in
      `components/org-switcher.yaml` and declared in
      `components/org-switcher-requests.yaml`, and called by nothing. The server log for a
      members-page load confirms it: `notifications_unread_count`, `get_my_member`,
      `get_members` and `get_invitations` all fire; neither switcher request does.

      **Why it presents as a blank rather than an error.** With no call,
      `_request: get_switcher_organization.name` is null, so the `_nunjucks` span renders
      empty — the icon beside it is the only thing left. And
      `_array.length: { _if_none: [ _request: get_switcher_memberships, [] ] }` is `0`, so
      `org_switcher_single`'s `visible` (`not (0 > 1)`) is **true** while
      `org_switcher_menu`'s (`0 > 1`) is **false**. The single-membership branch therefore
      renders for *every* caller regardless of how many organizations they belong to, and
      the dropdown branch is unreachable.

      **Proof the data is fine:** `/organizations/settings` renders "Machiel's Org" in its
      Name field on the same page load, from its own `get_active_organization` request —
      same row, same connection, fetched by an explicit action.

      **Blast radius — this blocks most of the plan.** §2.1 and §2.3 (workspace name in the
      top bar) fail outright. §4 is entirely unreachable: the dropdown is the only route to
      `SetActiveOrganization`, so a caller in two workspaces cannot switch, which in turn
      blocks §5's "switch to Workspace B" premise and §5.5's cross-boundary checks. Fix is
      in the layout, not the organizations module: `page.yaml`'s `onMountAsync` needs
      fetches for the header's requests the same way it has one for the notification count.

      **Fixed 2026-08-03** in `modules/layout/components/page.yaml`. `onMountAsync` now
      derives a `Request` action from each entry in `header_extra.requests` via
      `_build.array.map`, rather than naming the organizations module's request ids — the
      seam stays one wiring step (requests + blocks), with no third hand-maintained list of
      fetch actions to keep in step. Each derived action carries the same
      `skip: _eq: [_user: id, null]` as the notification count, for the same reason.
      Verified: the compiled `organizations/members.json` gains
      `__fetch_get_switcher_organization` and `__fetch_get_switcher_memberships` with the
      runtime `skip` intact (not evaluated away at build time); the server log shows both
      requests firing on a members-page load; and the header renders "Machiel's Org".
      `apps/demo` (pinned, wires no `header_extra`) builds clean and compiles no extra
      actions — `_array.map`'s `prep` maps an absent var to `[]`.

- [ ] **T9 — Every page whose title is an operator renders `[object Object]` as its browser
      tab title.** Observed 2026-08-03 on `/user-account/view`: the page body's title block
      reads "Machiel van der Walt" correctly while the browser tab reads `[object Object]`.

      **Mechanism.** A page passes its title to the layout as a runtime operator —
      `title: { _request: get_account.0.name }` (`modules/user-account/pages/view.yaml:41`) —
      and `modules/layout/components/page.yaml:26` forwards it into `properties.title`. The
      compiled artifact shows the difference plainly: `pages/user-account/view.json` has
      `properties.title = {"_request":"get_account.0.name"}` where
      `pages/organizations/members.json` has `properties.title = "Members"`.

      The document title is not *never* evaluated — it is evaluated too late and then lags.
      On load, before the page's `_request` has resolved, the raw operator object is
      stringified into `document.title`; it is only rewritten on a later update cycle. Saving
      a profile edit made this visible in one step: the tab went from `[object Object]` to
      "Machiel van der Walt" — the name as it was *before* the save — while the page body had
      already rendered the new "Alice Anderson". So the tab shows garbage on arrival and
      stale data thereafter, one change behind.

      **Blast radius — 17 pages** in `apps/tenant-demo`'s build carry a non-string
      `properties.title`. Twelve are operator objects and will show `[object Object]`:
      `activities/edit`, `activities/view`, `companies/edit`, `companies/view`,
      `contacts/edit`, `contacts/view`, `user-account/view`, `user-admin/view`,
      `workflows/company-setup-action`, `workflows/onboarding-action`,
      `workflows/sales-pipeline-action`, `workflows/workflow-group-overview`,
      `workflows/workflow-overview`. Four resolve to `null` —
      `activities/new`, `companies/new`, `contacts/new`, `deals/new` — a separate symptom
      worth checking on its own. Only `/user-account/view` was confirmed in a browser; the
      rest share the identical compiled shape. User-visible in tab labels, bookmark names
      and browser history.

- [ ] **T10 — A self-signup's workspace is named with the caller's raw email address.**
      Observed 2026-08-03: a fresh signup produced `user-organizations.name:
"machiel+bob@resonancy.io"`, which is what the header, the switcher and every
      workspace-name surface then display.

      **Mechanism.** The engine mints the organization with
      `name: user?.name || user?.email || session.userId`
      (`@lowdefy/api/dist/routes/auth/organizations/createActiveOrgPolicyHook.js:160`) at
      **first sign-in** — which is *before* onboarding collects a name, so `users.name` is
      still the empty string signup wrote. The `user?.name` branch is therefore unreachable
      on the email/password path and the name always falls through to the email. It is
      reachable via OAuth, where the provider supplies a name at account creation, so the
      same app yields tidy names for Google signups and raw addresses for password signups.

      The plan's §2.1 ("named after Alice") and §4 ("named after him") are satisfied only in
      the loosest sense. Renaming works (§2.3) so this is cosmetic and self-correcting, but
      it is the first thing every new workspace owner sees. Options: derive a name from the
      email local part at mint, or re-derive the organization name from the profile at
      onboarding when the owner has not renamed it.

- [x] **T11 — The `deals` collection is not tenant-walled, so deals are neither org-stamped
      on write nor org-filtered on read. Every workspace sees every deal.** Found
      2026-08-03. This is the failure §5's preamble says to report immediately.
      **Fixed 2026-08-03** — see the *Fix* subsection at the end of this entry.

      **Evidence, three independent strands:**

      1. `modules/deals/connections/deals-collection.yaml` has **no `tenant: true`**. Every
         other business-data connection in the repo has it — `companies`, `activities`,
         `actions`, `user-contacts`, `files`, `notifications`, `workflows`, and the events
         module's `log-events`. `deals` is the only domain collection without the wall.
      2. A deal created through the UI carries **no `organizationId` field at all**
         (`deals._id: "D-00001"`). Its `created` change stamp is correct
         (`user.name: "Alice Anderson"`, `app_name: "tenant-demo"`) — only the org stamp is
         absent, which is exactly what an unwalled connection produces.
      3. **No request in the entire deals module mentions `organizationId`** — not
         `get_active_deals`, `get_deals_list`, `get_deals_list_options`, `get_selected_deal`,
         `get_last_contact`, `get_mentionable_users` or `get_task_assignee_options`. So there
         is no authored clause compensating for the missing wall, and nothing for the runtime
         audit to check.

      Writes unstamped plus reads unfiltered means the leak is total, not partial: §5.2.4's
      Deals list will show both workspaces' deals, and §5.5's "paste a deal URL from the
      other workspace" will render the record — the case the plan flags as a serious bug.

      **Confirmed in the browser 2026-08-03**, with a caller in both workspaces:

      - **§5.2.4, Deals list.** Viewed from Workspace B, the list shows Workspace A's deal —
        `D-00001 AAA Test Deal`, company short name "AAA Test", creator "Alice Anderson". A's
        company name and A's user name are both rendered into B.
      - **§5.5, cross-boundary URL.** Pasting A's deal URL (`/deals/view?_id=D-00001`) while
        in B renders the **full record**: title, company, created-by, status, Details, People
        and Files sections. This is the case the plan flags "report it immediately".
      - **The leak is symmetric.** With a deal in each workspace, *both* lists show *both*
        deals. From Workspace A: `D-00002 BBB Test Deal`, company "BBB Test", salesperson
        "Alice in B". From Workspace B: `D-00001 AAA Test Deal`, company "AAA Test",
        salesperson "Alice Anderson". Each workspace sees the other's deal, its company short
        name, and its record of the person — in the list, in the deal card, and in the
        "ACTIVE DEALS" sidebar on the detail page.
      - **The contrast proves it is specifically the deals wall**, not a general failure. In
        the same workspace on the same session: Contacts showed only B's two rows (AAA Test
        Contact absent), Companies showed "No rows", Activities showed "No rows", and A's
        contact URL pasted into B **redirected to `/contacts/all`** without rendering. The
        leaked deal page even reads "No workflows found" and "No open actions", because
        `workflows` and `actions` *are* walled — only the deal shell crosses.

      **Why §7.2's preflight did not catch the unstamped row:** the preflight guards *walled*
      collections, and `deals` is not one. So the app kept serving. Fixing the connection
      without backfilling `organizationId` onto existing deal rows would then trip the
      preflight at the next restart — the fix needs a migration alongside it.

      **Fix (2026-08-03).** `tenant: true` added to `deals-collection` (and to the module's
      `events-collection` for [T12](#findings)), taking the repo's declaration count 14 → 16.
      The root cause was a three-layer omission, not a code slip: the
      [design's collection inventory](../org-aware-modules/design.md#collection-inventory), the
      backfill list in `docs/shared/org-scoping.md`, and the connection files all omitted the
      deals module. All three are now corrected, and the remaining work is scoped in
      [tasks/deals-org-awareness.md](../org-aware-modules/tasks/deals-org-awareness.md).

      Verified after the fix: Workspace A's deal list shows only its own deal, the other
      workspace's is gone, and `apps/demo` (pinned) builds unchanged — the declaration is inert
      under `pinned`, so no pinned deployment needs a backfill or index change.

      **§7.2 was verified for free in the process.** With `deals` walled and still holding the
      two unstamped rows, the restart refused to serve, naming the collection and connection in
      one aggregated error: *"Tenant preflight refused to serve the app: collection "deals"
      (connections "deals/deals-collection") holds documents without the tenant field
      "organizationId" … Backfill the field on the listed collections, then restart."* So the
      flip guard works, and it was exercised without deliberately inserting a bad row. The two
      rows were then backfilled from each deal's already-stamped `company_id` company —
      provenance derived from data, per `org-scoping.md`'s rule for explicit organization values.

      **One part is deliberately unfinished:** deal *search* now refuses under `tenant`, because
      `get_deals_list` conditionally swaps its first stage between `$match` and `$search` and so
      cannot take a single static `tenant:` declaration. The refusal is fail-closed and states
      the remedy, and the search box was already broken for want of an index
      ([T19](#findings)) — so this is a safe intermediate state, not a regression. Options are
      laid out in the task rather than guessed at here.

- [x] **T12 — The deals module declares its own unwalled connection to the walled
      `log-events` collection, and reads through it unfiltered.**
      **Fixed 2026-08-03** alongside [T11](#findings): `tenant: true` added to
      `modules/deals/connections/events-collection.yaml`, so `get_last_contact` is now scoped to
      the caller's organization rather than matching on `deal_ids` alone. That also removes the
      accidental dependency on [T17](#findings)'s global id counter described below — the
      counter is no longer load-bearing for isolation here, so T17 can be fixed on its own
      merits.
      `modules/deals/connections/events-collection.yaml` targets `log-events` with no
      `tenant: true`, while the events module's own connection to the same collection has it.
      The unwalled one is used by exactly one request — `get_last_contact.yaml`, a read —
      which therefore scans `log-events` across all organizations. It feeds the "LAST
      CONTACT" field on the deal page, so a deal's last-contact date can be computed from
      another workspace's events.

      Narrower than [T11](#findings) — one read, one derived date, no record contents
      rendered — but the same root cause and it survives T11's fix, since it is a separate
      connection file. Deal-emitted events themselves are stamped correctly
      (`create-deal` and `workflow-started` rows both carry `organizationId`), because those
      writes go through the events module's walled connection rather than this one.

      **Confirmed in the browser 2026-08-03.** A's leaked deal page viewed from Workspace B
      renders **LAST CONTACT: 03 Aug** — the date of A's own `create-deal` / `workflow-started`
      events. The pipeline matches on `deal_ids` and the event type only, with no organization
      clause and no wall on the connection, so it reads A's `log-events` rows from inside B.

      **What limits the blast radius is accidental, not designed.** The pipeline's only scope
      is the deal id, so identical deal ids in two organizations would cross-match. They cannot
      collide today because the consecutive-id counter is global rather than per-organization
      (see [T17](#findings)) — so every deal id is unique suite-wide. That means T17 is
      currently load-bearing for T12: making the id counter per-organization, which is the
      obvious fix for T17's disclosure, would turn this into a live cross-tenant read. Fix the
      connection (add `tenant: true`) before or alongside any change to the counter.

- [ ] **T13 — The user-admin invite flow dead-ends on a blank outcome panel, so its write
      can never be reached.** Observed 2026-08-03 as `user-admin` on `/user-admin/invite`.
      Entering an address and pressing **Check** replaces the form with a panel containing
      only an envelope icon and a "← Use a different email" button — no email address, no
      outcome text, no invite form, no error. The page's own hint promises "We resolve access
      status to one of four outcomes before opening the form"; none of the four renders.

      **Not a refusal.** `check-invite-email` returns **200** and is not gated by the
      `auth.userAdminRole` floor — the log shows no auth-step refusal for it, unlike the six
      write endpoints. So the endpoint ran and the UI failed to render its result. The
      practical effect for the plan's §6.1: "inviting" cannot be exercised at all, because
      the flow never reaches the invite write to be refused. No `user-invitations` row was
      created, so nothing leaked.

      Distinct from the §6.1 refusals, which are all explicit and readable — this one is the
      "blank popup" case §6.1 says to report even when no write succeeds.

- [ ] **T14 — The members page offers a non-admin live role controls and a remove button
      that always error, while correctly hiding its sibling controls.** Observed 2026-08-03
      as a member holding `user-admin,manager` but not `owner`/`admin` — the plan's §6.2
      "ordinary member" case.

      The module gates most of the surface correctly: the **Invite member** button is absent
      from `/organizations/members`, and `/organizations/settings` renders with its Name field
      disabled and **no Save button** at all. But clicking any member row still opens the full
      member modal with selectable role tags, a **Save roles** button, and a red **Remove from
      organization** — including on the **owner's** row. Nothing signals they are unusable.

      **The backend holds.** Forcing it — selecting `Admin` on the caller's own row and
      saving, a self-escalation attempt — is refused with a clear *"You are not allowed to
      update this member"*, and `user-members.role` stayed `"user-admin,manager"`. So §6.2's
      requirement is met ("either the controls aren't offered, or the action is refused if
      forced") and there is no privilege escalation.

      This is therefore UX, not a security hole: the inconsistency is that the same page hides
      the invite control and the settings save for this caller, then hands them a
      functional-looking modal whose every button errors. Gate the row click (or disable the
      modal's controls) on the same `is_org_admin` condition the invite button already uses.

- [ ] **T15 — The unusable-invitation page offers no way out.** Observed 2026-08-03 by
      opening a valid invitation addressed to another user while signed in as someone else —
      the plan's §3.3 wrong-recipient case. The page renders a properly designed card:
      _"This invitation can't be used — It may have expired, already been used, or been sent
      to a different email address. Ask the person who invited you to send a fresh
      invitation, then open the new link."_ Clear, friendly, no raw error, no blank screen.

      But the card carries **no button or link of any kind** — no "go to the app", no "sign in
      as a different user", no sign-out. §3.3's expectation is a message *with a way out*, and
      a signed-in wrong recipient is left having to edit the URL by hand.

      The generic wording is defensible: naming the invited address would leak it to whoever
      holds the link, so collapsing the three causes into one message is a reasonable privacy
      trade-off. The missing exit is the part worth fixing — the same card shape is used for
      genuinely expired links, where a stranded user has no next step either.

- [ ] **T16 — Accepting an invitation silently moves the caller into the inviter's
      workspace.** Observed 2026-08-03 — the exact case the plan's §4 calls out: _"Expect:
      Alice is still looking at Workspace A right after accepting. Accepting must not silently
      move her into Bob's workspace."_

      A caller who owned Workspace A, was working in it (header read "Alice Test Co"), and
      accepted an invitation to Workspace B landed on `/home` with the header reading Workspace
      B. Her session row confirms it: `user-sessions.activeOrganizationId` for the live session
      is Workspace B's id, while her older session still points at A. Both memberships exist
      correctly (`owner` in A, `user-admin,admin` in B) — only the *active* organization moved.

      **Mechanism.** BetterAuth's accept route sets the active organization unconditionally
      after creating the member row:

      ```js
      const createdMember = await adapter.createMember({ … });
      await adapter.setActiveOrganization(session.session.token, acceptedI.organizationId, ctx);
      ```

      (`better-auth/dist/plugins/organization/routes/crud-invites.mjs:330`.) There is no check
      for whether the session already had an active organization.

      **This is the same line [T7](#findings) depends on**, which is what makes it awkward: for
      an org-less session — the invited-user-signs-up-directly case — that unconditional call
      is precisely the repair that rescues them, and T7's escape hatch works *because* of it.
      The fix therefore cannot be "stop setting it"; it has to be conditional — set the active
      organization only when the session has none, and otherwise leave the caller where they
      were, surfacing a "you've joined X — switch to it?" affordance instead.

      Consequence beyond the surprise: a user who does not notice the header change continues
      working, and every record they create lands in the *inviter's* workspace. Misfiled data
      rather than leaked data, but silent either way.

- [ ] **T17 — Consecutive record ids are allocated globally, not per organization, so a
      workspace's ids disclose other workspaces' record counts.** Observed 2026-08-03: the
      first company created in a brand-new workspace was assigned **`C-0002`**, not `C-0001`,
      because another organization already held `C-0001`. The documents themselves are stamped
      correctly (`C-0001` → Workspace A, `C-0002` → Workspace B).

      **Mechanism** — `MongoDBInsertConsecutiveId`
      (`@lowdefy/connection-mongodb/dist/connections/MongoDBCollection/MongoDBInsertConsecutiveId/`).
      The handler stamps the tenant on the document being inserted:

      ```js
      if (tenant) { doc = stampTenantOnDoc({ doc, tenant }); }
      …
      const index = await getConsecutiveIdIndex({ collection, prefix, session });
      ```

      but `getConsecutiveIdIndex` receives no tenant or filter argument, so the max-id scan
      runs over the whole collection regardless of the wall. The write is org-scoped; the id
      allocation is not.

      **Impact is disclosure, not leakage** — no record content crosses a boundary. But every
      new record's id tells its owner how many of that record type exist suite-wide, and the
      gaps between a workspace's own ids track other tenants' activity volume over time. That
      is a standard multi-tenant side channel, and it is visible in the UI: id columns, deal
      cards, breadcrumbs and URLs all show it.

      ~~**Do not fix this in isolation** — the global counter is currently what stops
      [T12](#findings) from being a live cross-tenant read. Wall the deals module's
      `log-events` connection first.~~ **Constraint lifted 2026-08-03**: T12's connection is now
      walled, so the counter no longer carries any isolation weight. T17 can be fixed on its own
      merits — the only consideration left is that per-organization numbering changes the id
      format consumers already see in URLs and exports.

- [ ] **T19 — The `deals` collection has no Atlas Search index, so the deal search box has
      never worked.** Found 2026-08-03 and **independent of tenancy** — it fails identically
      under `pinned`. `get_deals_list` issues `$search` against `index: default` on `deals`, and
      `listSearchIndexes()` on the QA cluster returns nothing for the collection. A `$search`
      against a missing index errors rather than returning empty, so typing in "Search by deal
      name or code" fails outright.

      The same check found no search index on `workflows`, `actions`, `files`, `notifications` or
      `log-events` either; those matter only if a `$search` pipeline is ever pointed at them.
      `docs/shared/atlas-search-indexes.md` documents `user-contacts`, `companies` and
      `activities` only, which is consistent — `deals` was missed in the same sweep that missed
      its wall declaration ([T11](#findings)).

      It becomes a blocker for the preferred shape of T11's remaining work: restructuring
      `get_deals_list` to the repo's standard unconditional-`$search` pattern would make *every*
      deal list load issue a `$search`, so the index has to exist first. See
      [tasks/deals-org-awareness.md](../org-aware-modules/tasks/deals-org-awareness.md).

- [ ] **T18 — A profile edit in one workspace overwrites the global identity, so the other
      workspace's avatar and its change stamps show the wrong workspace's name.** Observed
      2026-08-03. The plan's §4 checks that a name edited in one workspace does not appear *in
      the other workspace's profile page and members list* — that part passes. What it does not
      check, and what breaks, is everything else that reads the caller's identity.

      **The per-workspace records are correct.** After editing the same person's name to "Alice
      in B" in Workspace B, the two contact rows hold exactly what they should:

      | Row | `profile.name` | `avatar_color` |
      | --- | --- | --- |
      | `user-contacts` in Workspace A | `Alice Anderson` | purple |
      | `user-contacts` in Workspace B | `Alice in B` | slate |

      **The global row is single, and the last edit wins.** `users.name` and `users.profile`
      became `Alice in B` / slate. Two consequences follow, both visible while *viewing
      Workspace A*:

      1. **The layout's profile avatar shows the other workspace's identity.** The sidebar
         avatar renders `AI` on slate on every page, while the account page beside it renders
         `AA` on purple from the workspace-scoped contact. Two different avatars for the same
         person on one screen.
      2. **Change stamps are attributed to the wrong workspace's name.** `change_stamp` resolves
         its user name as `_if_none: [_user: name, _user: profile.name, default]`, and `_user`
         reads the global row — so a write made *in Workspace A* is stamped `Alice in B`. Editing
         the Workspace A contact produced "Last modified by **Alice in B**" on the record and
         "**Alice in B** updated contact AAA Test Contact" on its History timeline, directly
         above the earlier "Alice Anderson created contact" entries. Workspace A's audit trail
         now names an identity belonging to another tenant, and the timeline reads as two
         different people.

      3. **"Invited by" on the pending-invitations list shows it too.** An invitation sent
         *from Workspace A* renders "Invited by: Alice in B". The mechanism is explicit in
         `modules/shared/org/invitations_base.yaml`, which derives the column as
         `inviter_name: "$inviter.name"` from a `$lookup` on `users` — the global row again,
         not the inviter's contact in the organization the invitation belongs to.

      Not a data leak — the name is the caller's own in both cases — but it is a correctness
      problem in the audit trail, and it grows with every workspace a person belongs to. The
      stamp should resolve the name from the active workspace's contact rather than the global
      `users` row; the layout avatar and the "Invited by" lookup have the same choice to make.
      Related to [T1](#findings)/[T2](#findings), which are also change-stamp attribution
      faults.

---

## Not findings

Recorded because each looks like a fault and will be re-reported otherwise.

- **`user-members.role: "owner"` is absent from the app's `auth.roles` catalog by
  design.** `modules/organizations/components/role_options.yaml:11` excludes it explicitly
  (ownership transfer out of scope for v1; the engine's last-owner guard is
  authoritative), `members_table.yaml` renders raw role ids so it displays as `owner`, and
  `get_my_member.yaml` reads it for the `is_org_admin` gate. It looks exactly like F29's
  orphaned-role case — it isn't one.

- **Driving this plan through browser automation produces false "silent failure" readings.**
  Not a product fault, recorded because it wasted real time and would mislead the next pass.
  Three distinct artifacts, all of which look exactly like app bugs:

  - **A click frequently focuses a control without activating it.** The first click lands, the
    second fires. A save or a confirm button therefore appears to do nothing, the modal closes
    on a stray click, and the value is unchanged — indistinguishable from a broken write. The
    fix is to confirm the action reached the server (the request log) before recording anything.
  - **Programmatic value-setting does not reach the app's state.** Setting an input's value
    directly leaves the framework's state holding the old value, so the save submits nothing.
    Real keystrokes are required, and a click-then-type in a search input appends rather than
    replaces unless the field is explicitly cleared.
  - **Toasts auto-fade.** The refusal banners in §6.1 disappear within a couple of seconds, so a
    screenshot taken slightly late shows an open modal with no message. Twice this looked like a
    "blank popup" finding and twice the server log showed a perfectly explicit refusal.

  Every write in this pass was therefore confirmed against the request log or the database rather
  than the screenshot alone. Two candidate findings were withdrawn on that basis — an "empty
  ContactSelector" that was a typo in the query, and a "silent Suspend failure" that was a faded
  toast.

- **The preflight cannot probe two of the walled connections, and that is by design.** Starting
  the server under `tenant` logs two warnings — *"Tenant preflight can not probe connection
  `workflows/workflow-api` … connection type `WorkflowAPI` implements the tenant contract but no
  `tenantPreflight` capability"*, and the same for `events/events-timeline` (`EventsTimeline`).
  This reads like a hole in the flip guard. It is the intended behaviour: the probe is a
  connection-type capability implemented on `MongoDBCollection`, so non-Mongo connection types
  that carry the tenant contract cannot be probed, and the warning is the designed signal rather
  than a defect (lowdefy `c58f99e85`, "Gate the tenant wall on the organizations policy").

  These two also explain an apparent count mismatch: the design's "all 14 `tenant: true`
  declarations" looked wrong against a repo audit finding 12, because an audit filtered to
  `type: MongoDBCollection` misses `EventsTimeline` and `WorkflowAPI`. 12 + 2 = 14, and the
  deals fix takes it to 16.

- **`log-changes` is stamped inconsistently, and it does not matter.** An org-stamping sweep
  shows 7 of 35 `log-changes` rows carrying `organizationId` and 28 without, which reads like
  a wall gap. It follows directly from the `changeLog` config: every connection routes its
  change log to the same `log-changes` collection, so walled connections' entries get stamped
  and unwalled ones' don't. **Nothing reads `log-changes`** — a repo-wide search finds no
  request or page referencing it outside the `changeLog:` declarations themselves — so there
  is no surface through which the unstamped rows could leak. The same sweep also flags
  `users`, `user-sessions`, `user-accounts`, `user-organizations`, `user-invitations`,
  `user-members` and `user-passkeys` as unstamped; those are BetterAuth-owned and scoped by
  explicit `userId` / `organizationId` query clauses rather than the wall, which is by design.

- **The pre-existing QA rows are keyed to app slug `demo`, so their event titles render
  blank under `tenant-demo`.** The two `log-events` rows in the QA database store their
  display object under a top-level `demo` key (`{demo: {title: "… updated their profile"}}`)
  and carry `created.app_name: "demo"`; `user-contacts` and `log-changes` rows from the same
  run carry `app_name: "demo"` too. The events module reads titles back under the serving
  app's slug, so on `apps/tenant-demo` (slug `tenant-demo`) those two rows show **no title**
  on a record timeline — exactly the shape §5.2.9 is looking for.

  It is leftover data, not a fault. Those rows were written 2026-07-31 09:34–09:50, and
  `6e1bd693` ("Split the demo app by organization policy") — which created
  `apps/tenant-demo` — is dated 2026-07-31 12:34. The 31 Jul pass therefore ran against
  `apps/demo` with the policy flipped, and `_build.app: slug` correctly stamped `demo`.
  The current build compiles `app_name: "tenant-demo"` in all 162 places. Any row written
  from here on is keyed correctly; only these pre-split rows are affected.

  **It does constrain F29(a):** injecting a member's non-catalog roles into the selector
  options, as F29 proposes, would surface `owner` as a selectable and removable tag on
  every owner row in `member_modal.yaml`, undoing that deliberate exclusion. Scope F29's
  fix to the user-admin surface, or exempt `owner` from the injection.

---

## Confirmed correct

From the same 2026-07-31 signup inspection — recorded so these aren't re-verified blind.

- **Search, pickers and exports are org-scoped (plan §5.3, §7.4).** Verified 2026-08-03 with
  recognisable data in both workspaces. Searching the other workspace's term returns **No rows**
  in both directions — "BBB" from Workspace A on both contacts and companies, while "AAA" from
  A still finds its own row. The ContactSelector offered only the active workspace's three
  contacts, and the company picker on the deal form offered only the active workspace's company
  (`AAA Test Company (C-0001)` in one, `BBB Test Company (C-0002)` in the other).

  **Atlas Search latency is a trap here.** A freshly created record can take a few seconds to
  become findable, and a picker that looks broken is usually just waiting — one probe returned
  nothing, then the same query returned the row seconds later. Confirm against the database
  before recording a search finding.

  **The Excel exports are scoped by construction and audited at runtime.** Both
  `get_contact_excel_data` and `get_company_excel_data` declare `tenant: authored`, and the
  compiled artifacts carry the authored clause as the **first** entry of `compound.filter`:
  `{equals: {path: organizationId, value: {_user: organizationId}}}`. Being a `filter` rather
  than a `should`, it cannot affect relevance scoring — which is what §7.4 asks. The files
  themselves were not downloaded; the construction plus the runtime audit is the substantive
  check, so opening a spreadsheet is optional belt-and-braces.

- **Invitation cancel / re-invite behaves (plan §3.4), and the sole-owner guard holds (§3.5).**
  Verified 2026-08-03. Cancelling a pending invitation gives "Invitation cancelled.", the row
  leaves the pending list, and the stored row becomes `status: "canceled"` rather than being
  deleted. Re-inviting the same address therefore **cannot** produce two visible rows:
  `modules/shared/org/invitations_base.yaml` matches `status: pending`, so canceled, accepted
  and rejected rows are excluded from the list by construction. The cancel dialog's wording is
  accurate about the emailed link ceasing to work, though that link was not clicked to confirm.

  The pending row also satisfies §3.1's expiry expectation — status derives as `Invited` while
  `expiresAt` is in the future and `Expired` once past, since BetterAuth has no expired status
  (Decision 2). That is also how to manufacture §3.3's expired invitation: back-date
  `expiresAt` on a pending row.

  §3.5's last-owner guard refuses explicitly: attempting "Leave this organization" as the only
  owner returns **"You cannot leave the organization as the only owner"** and the membership is
  untouched. Role changes persist correctly (`user-members.role` stores a comma-joined string,
  e.g. `"user-admin,manager"`), and no surface anywhere on the members page offers `owner` as an
  assignable role.

- **Every walled surface isolates correctly across two organizations (plan §5.2, §5.5).**
  Verified 2026-08-03 with one caller holding memberships in both workspaces, switching between
  them with the header switcher. From Workspace B, with Workspace A holding an "AAA Test"
  contact, company, activity and deal:

  | Surface           | Result                                                                             |
  | ----------------- | ---------------------------------------------------------------------------------- |
  | §5.2.1 Contacts   | Only B's two rows; AAA Test Contact absent                                         |
  | §5.2.2 Companies  | "No rows" — correct, B genuinely had none                                          |
  | §5.2.3 Activities | "No rows" — correct, B genuinely had none                                          |
  | §5.2.4 Deals      | **Leaks A's deal — see [T11](#findings)**                                          |
  | §5.2.5 Members    | Only the active workspace's people (also verified via the user-admin console)      |
  | §5.5 contact URL  | A's contact URL pasted in B **redirected to `/contacts/all`**, record not rendered |
  | §5.5 deal URL     | **Renders A's full record — see [T11](#findings)**                                 |

  Two notes for whoever runs this next. **The empty lists above are correct, not findings** —
  §5 tells the tester to treat an unexpectedly empty list as a fault, and here Companies and
  Activities are legitimately empty because that workspace has no such records. Distinguishing
  the two needs a database read, which is exactly the gap [T4](#findings) describes. And
  **role resolution is per-workspace**: the same caller resolved `["owner"]` in one workspace
  and `["user-admin","admin"]` in the other, with the Admin menu group appearing and
  disappearing accordingly.

- **Every user-admin write refuses under `tenant`, and each refusal is explicit
  (plan §6.1).** Verified 2026-08-03 as a `user-admin` member on `apps/tenant-demo`. Six
  write endpoints were exercised from the console and all six refused at the engine's auth
  step, with **zero** successes: `suspend` → step `ban`, `delete-user` → `delete`,
  `remove-member` → `remove`, `revoke-sessions` → `revoke`, `update-access` → `set_roles`,
  `update-user-attributes` → `set_user_attributes`. The user stayed `Active`
  (`users.banned: false`) and no attribute or role write landed.

  The refusal is a red banner reading _Auth step "&lt;step&gt;" refused - "auth.userAdminRole"
  is not configured. The app must declare which member role administers users; caller-less
  system routines (system: true) are unaffected._ The modal stays open and the value is
  unchanged — not a blank popup. **Beware the toast timing when re-testing:** it auto-fades,
  so a screenshot a couple of seconds late shows an open modal with no message and reads
  like a silent failure. It isn't; check the server log for the `ConfigError`.

  The console's **reads** are correctly org-scoped: the list showed only the active
  workspace's two people, with the other workspace's owner absent. `K6`'s "roles show as
  blank tags" did **not** reproduce — `owner`, `User Admin` and `Manager` all rendered as
  proper labels on both the list and the edit modal.

- **Contact → user link direction.** `user-contacts.userId` is set and
  `users.profile.contactId` is absent, verifying commit `047fe615`'s breaking change
  against real data.
- **Contact email fields.** Both `email` and `lowercase_email` carry the real address —
  F3/F4 confirmed resolved on the password path in this environment.
- **Verification gating.** `users` + `user-accounts` were created with no session; the
  session appeared 24s later alongside the org, member and contact rows. Confirms no
  session until verify.

  **Corrected 2026-08-03 — the org, member and contact are minted at _first sign-in_, not
  at verify.** The 31 Jul run could not separate the two, because verify and first sign-in
  were only 24s apart. A signup caught between the two steps settles it: with
  `emailVerified: true` and no sign-in yet, there was **no** `user-organizations`,
  `user-members` or `user-contacts` row at all. Signing in created all three within 200ms
  of each other (10:41:08.253 org, .299 member, .453 contact). The org-mint hook is
  therefore what creates the contact, and user-account Decision 7's "at verify rather than
  signup" should read "at first sign-in".

- **Live email delivery.** `emailVerified` went true and `user-verifications` is empty —
  SendGrid delivered, the link worked, the token was consumed. This is `CHECKLIST.md`
  Phase 0b's live-send precondition.
- **Tenant wiring.** One `user-organizations` row, one `user-members` row (`role: owner`),
  and `user-sessions.activeOrganizationId` matching that org.
- **Profile denormalization.** `user-contacts.profile` and `users.profile` identical,
  top-level `users.name` set, `profile.name` derived, `profile_created: true`.
- ~~**Workspace naming.** The org was named from the email local part ("Machiel's Org")
  because no profile existed at mint time — matches the plan's §2.1 expectation.~~
  **Withdrawn 2026-08-03 — see [T10](#findings).** There is no local-part or possessive
  logic anywhere in the engine or this repo; the mint expression is
  `user?.name || user?.email || session.userId`, byte-identical between the 31 Jul and
  current engine builds. A fresh signup on the same code produced the raw address
  `machiel+bob@resonancy.io` as its workspace name. How the 31 Jul org came to read
  "Machiel's Org" is unexplained by any code path — most likely renamed by hand during that
  session — so it should not have been recorded as the mint's behaviour.
