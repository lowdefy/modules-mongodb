# Org-Aware Modules — Manual Runtime Verification Checklist

What the automated suites cannot prove, and how a human proves it. Everything
here needs infrastructure the harnesses don't have: a real Atlas cluster
(`$search` doesn't exist on in-memory MongoDB), real BetterAuth sessions (the
e2e mock caller bypasses auth), or SMTP (email verification).

**What is already proven automatically — do not re-test:**

- Per-resolver two-org isolation, incl. authored `$geoNear`/`$graphLookup` and
  every refusal/audit error path — lowdefy `connection-mongodb` suite (real
  MongoDB).
- Two-org isolation through real module pages — `apps/demo/e2e/org-scoping/`
  (`tenant-isolation.spec.js`: walled `$match` reads; `hierarchy-isolation.spec.js`:
  the authored `$graphLookup` traversal, both directions).
- Config-level correctness of every authored clause — `ldf:b` build artifacts
  carry `tenant: "authored"` + the compiled clauses (verified in PR #113).
- The `$search` audit *accepting* the authored clauses — visible in any e2e
  run: `contacts_contact_search` fails with MongoDB's "$search stage is only
  allowed on Atlas", meaning it passed the wall's audit and reached the driver.

## Setup

A deployment of `apps/demo` with:

- `MONGODB_URI` → a real **Atlas** cluster.
- Atlas Search indexes per `docs/shared/org-scoping.md` on `user-contacts`,
  `companies`, `activities`: **`organizationId` statically mapped as `token`**,
  and **included in `storedSource`** for `user-contacts` and `companies`
  (their pipelines use `returnStoredSource`).
- Real auth secrets (`NEXTAUTH_SECRET`, SMTP for magic links / verification).

## 1. `$search` under the authored wall (pinned is enough)

- [ ] Contacts, companies, and activities **list pages** return rows (not
      blank). Blank lists with data present = missing `token` mapping or
      missing `storedSource` entry — fail-closed, fix the index.
- [ ] Search box filters results; result ordering looks relevance-ranked
      (the authored filter clause must not affect scoring).
- [ ] **Excel exports** on contacts and companies download rows (their
      operator-composed pipelines only meet the wall at runtime).
- [ ] **ContactSelector** (e.g. company edit → contacts field) returns options
      when typing.
- [ ] **Audit negative check** (once, then revert): remove the `equals` clause
      from `get_all_contacts.yaml`'s compound filter, redeploy, load the page —
      expect the loud audit error ("has no compound.filter equals clause…"),
      NOT a blank list. Restore the clause.

## 2. Signup mint (needs real sessions + SMTP; pinned is enough)

- [ ] Fresh open signup → verify email → first login. Then in the DB: the new
      `user-contacts` row carries `organizationId` = the deployment's org, and
      the `users` row has `profile.contactId` pointing at it.
- [ ] Second login: no new contact row, no changed `updated` stamp (the
      every-login hook skips once linked).
- [ ] Invite flow still creates + links its contact unchanged (invite → accept
      → contact linked).

## 3. `tenant` policy smoke (the shape nothing has ever run)

Switch the deployment to `auth.organizations.policy: tenant`, create two
organizations with one user each:

- [ ] Each caller's list pages (`$search`) show only their org's rows.
- [ ] Company hierarchy: org A cannot see org B's companies in the parent
      selector or traversals.
- [ ] A signup lands in its own fresh org; its minted contact carries that
      org's id.
- [ ] user-admin: reads work (policy-portable since `_user: organizationId`),
      but treat the module as pinned-shape per Decision 6 — Suspend is a
      suite-wide ban; do not expose it to tenant-facing admins.

Record outcomes (and any surprises) back into this file or
`implementation-notes.md`.
