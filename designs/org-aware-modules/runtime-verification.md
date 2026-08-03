# Org-Aware Modules — Manual Runtime Verification Checklist

What the automated suites cannot prove, and how a human proves it. Everything
here needs infrastructure the harnesses don't have: a real Atlas cluster
(`$search` doesn't exist on in-memory MongoDB), real BetterAuth sessions (the
e2e mock caller bypasses auth), or SMTP (email verification).

**What is already proven automatically — do not re-test:**

- Per-resolver two-org isolation, incl. authored `$geoNear`/`$graphLookup` and
  every refusal/audit error path — lowdefy `connection-mongodb` suite (real
  MongoDB).
- Two-org isolation through real module pages — `apps/tenant-demo/e2e/org-scoping/`
  (`tenant-isolation.spec.js`: walled `$match` reads; `hierarchy-isolation.spec.js`:
  the authored `$graphLookup` traversal, both directions).
- Config-level correctness of every authored clause — `ldf:b` build artifacts
  carry `tenant: "authored"` + the compiled clauses (verified in PR #113).
- The `$search` audit _accepting_ the authored clauses — visible in any e2e
  run: `contacts_contact_search` fails with MongoDB's "$search stage is only
  allowed on Atlas", meaning it passed the wall's audit and reached the driver.

## Setup

Every section runs against `apps/tenant-demo` — since the wall became
policy-conditional ([policy-conditional-wall](../policy-conditional-wall/design.md)),
the authored clauses only compile under `policy: tenant`, so `pinned` has no
wall behaviour to verify (see the pinned smoke note at the end). Setup:

- `MONGODB_URI` → a real **Atlas** cluster.
- Atlas Search indexes per `docs/shared/org-scoping.md` on `user-contacts`,
  `companies`, `activities`: **`organizationId` statically mapped as `token`**,
  and **included in `storedSource`** for `user-contacts` and `companies`
  (their pipelines use `returnStoredSource`).
- Real auth secrets (`NEXTAUTH_SECRET`, SMTP for magic links / verification).

## 1. `$search` under the authored wall

- [ ] Contacts, companies, and activities **list pages** return rows (not
      blank). Blank lists with data present = missing `token` mapping or
      missing `storedSource` entry — fail-closed, fix the index.
- [ ] Search box filters results; result ordering looks relevance-ranked
      (the authored filter clause must not affect scoring).
- [ ] **Excel exports** on contacts and companies download rows (their
      operator-composed pipelines only meet the wall at runtime).
- [ ] **ContactSelector** (e.g. company edit → contacts field) returns options
      when typing.
- [ ] **Audit negative check** (once, then revert): remove the shared-fragment
      `_ref` from `get_all_contacts.yaml`'s compound filter concat, redeploy,
      load the page — expect the loud audit error ("has no compound.filter
      equals clause…"), NOT a blank list. Restore the ref.
- [ ] **Preflight check** (once): insert one unstamped document into a walled
      collection, restart — expect the server to refuse every request with the
      aggregated "Tenant preflight refused to serve" error naming the
      collection. Remove the document, restart.

## 2. Signup mint (needs real sessions + SMTP)

- [ ] Fresh open signup → verify email → first login. Then in the DB: the new
      `user-contacts` row carries `organizationId` = the caller's org and
      `userId` = the auth user id (no `profile.contactId` on the user — the
      link lives on the contact).
- [ ] Second login: no new contact row, no changed `updated` stamp (the
      every-login hook skips once linked).
- [ ] Invite flow still creates + links its contact unchanged (invite → accept
      → contact linked).

## 3. `tenant` policy smoke

Run `apps/tenant-demo` (it declares `auth.organizations.policy: tenant`) and
create two organizations with one user each. The tester-facing version of this
is [`qa-test-plan.md`](../auth-tenancy-verification/qa-test-plan.md); the checks
below are the developer subset:

- [ ] Each caller's list pages (`$search`) show only their org's rows.
- [ ] Company hierarchy: org A cannot see org B's companies in the parent
      selector or traversals.
- [ ] A signup lands in its own fresh org; its minted contact carries that
      org's id.
- [ ] user-admin: reads work (policy-portable since `_user: organizationId`),
      but treat the module as pinned-shape per Decision 6 — Suspend is a
      suite-wide ban; do not expose it to tenant-facing admins.

## Pinned smoke (apps/demo)

Under `pinned` the wall is inert and there are no organization checks to make —
ordinary page smoke covers it. The two policy-specific facts worth one look each:

- [ ] List pages, exports, and the ContactSelector work against an Atlas Search
      index **without** the `organizationId` `token` mapping or `storedSource`
      entry (the pinned index shape).
- [ ] A fresh signup's minted `user-contacts` row carries `userId` but **no**
      `organizationId`.

Record outcomes (and any surprises) back into this file or
`implementation-notes.md`.
