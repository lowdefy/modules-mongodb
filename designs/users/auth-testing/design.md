# Auth-testing campaign

A systematic manual pass over the `user-account` (auth pages + account workspace) and
`user-admin` (operator console) modules, run against a local throwaway rig. Until now the
campaign lived as two flat files under `scripts/auth-testing/` — a 370-line checklist and a
42KB findings log that had become an unscannable mix of bugs and design decisions — with no
source-of-truth design and no clean path for a discovered issue to become real design work.
This promotes the campaign to a proper design: the checklist becomes per-phase execution
task files that record run progress, and the findings log becomes a small staging area for
design-worthy follow-ups only.

## Proposed change

- **`design.md`** (this file) is the campaign's source of truth: scope, the manual
  methodology, the phase dependency structure, how progress is recorded, and the lifecycle
  a finding travels through.
- **`tasks/`** holds one execution checklist per phase (`00`–`05`), migrated from
  `CHECKLIST.md`, preserving the `[ ]`/`[x]`/`[~]`/`[-]` legend, inline evidence notes, and
  accumulated run state. `tasks/tasks.md` indexes them and doubles as a progress dashboard.
- **`findings/`** is a staging area for **design-worthy follow-ups only** — one
  `F##-slug.md` per finding plus an `index.md` status table. Bugs never get a findings file.
- The rig stays in `scripts/auth-testing/` (compose file, helper scripts, `README.md`); the
  old `CHECKLIST.md` and `FINDINGS.md` are removed (git preserves their history).

## Scope

What the campaign exercises, end-to-end against a running server:

- **`user-account`** — the public auth pages (signup, email verification, login, password
  reset, magic-link, passkey, OAuth, accept-invite, logout) and the signed-in account
  workspace (profile, security, sessions tiles).
- **`user-admin`** — the operator console (`all` list, `invite` flow, `view` detail with its
  profile / attributes / security / activity / apps tiles) and the per-organization
  authority feature (two admin instances welded to different `org_slug` values).
- **Cross-cutting invariants** — freshness across modules, contact uniqueness, the
  co-location `$lookup` failure mode, endpoint/page gates, change stamps, and the
  `Validate`-scoping fix that spans eight forms.

Out of scope: unit/build correctness (that is `pnpm ldf:b`, a separate gate), and any flow
that does not touch the two auth modules.

## Methodology — manual, against the local rig

These flows are **not provable by build alone**. A reset that repopulates an invisible
input, a `Validate` that reports success while checking nothing, a routine that bakes a
build-time `null` into a runtime path — all compile perfectly. Only a real run against a
running server, a real authenticator app, a real mailbox, and Compass on the database
distinguishes a pass from a failure. So the campaign is a **manual** pass, and its output is
a run record, not code.

The rig is local and throwaway — an isolated MongoDB and a Mailpit email sink, both in
containers, plus the `bootstrap-admin` / `reset-db` / `mail-link` helper scripts. Nothing
here touches production. **Setup, environment, secrets, and the helper scripts are
documented in [`../../../scripts/auth-testing/README.md`](../../../scripts/auth-testing/README.md)** — this design does not
duplicate them.

> **Reads are free; never change data.** Diagnosing against the rig's database (Compass, an
> ad-hoc read script, `lowdefy_run_request`) is unrestricted. Never run a mutation — not
> `reset-db`, not a seed — without an explicit instruction, on any environment. A
> `MONGODB_URI` can point anywhere.

## Phase structure

The phases are **dependency-ordered** — work top-to-bottom. Phase 0 stands the rig up;
later phases depend on it and on each other (the 2FA-challenge test needs enrolment from
Phase 2; the accept-invite test needs an invite from Phase 3; Phase 5 needs a second admin
instance booted).

| Phase | File                                                                             | Covers                                                                          | Depends on |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- |
| 0     | [`tasks/00-environment-bootstrap.md`](./tasks/00-environment-bootstrap.md)       | Rig up, indexes, first admin bootstrapped                                       | —          |
| 1     | [`tasks/01-public-auth-pages.md`](./tasks/01-public-auth-pages.md)               | Signup, verify, login, reset, magic-link, passkey, OAuth, accept-invite, logout | 0          |
| 2     | [`tasks/02-account-workspace.md`](./tasks/02-account-workspace.md)               | Profile / security / sessions tiles; 2FA enrol/replace/disable                  | 0, 1       |
| 3     | [`tasks/03-user-admin-console.md`](./tasks/03-user-admin-console.md)             | Page gate, `all` list, invite flow, `view` detail tiles                         | 0, 1       |
| 4     | [`tasks/04-cross-cutting-invariants.md`](./tasks/04-cross-cutting-invariants.md) | Freshness, uniqueness, co-location, gates, change stamps, `Validate` scoping    | 1, 2, 3    |
| 5     | [`tasks/05-per-org-authority.md`](./tasks/05-per-org-authority.md)               | Two instances, role storage shape, cross-org authority, impersonation retired   | 0, 3       |

## Recording progress

Each phase file is a live checklist — tick items as they run. Add an inline note wherever
it's useful (the state you saw in Compass, the exact error copy, a finding link), but this is
a manual checklist: note what helps a later reader and skip what doesn't.

**Legend:** `[ ]` to do · `[x]` done · `[~]` pending build / partial · `[-]` skipped or
N/A this run. **"Verify in Compass"** means check the document state in the rig database.

Much has changed since the campaign's earlier partial runs — org-authority landed, 2FA
enrolment was reworked. Where a later change **supersedes** an earlier `[x]`, the item is
marked for re-run against the current build rather than trusted; those supersede notes are
kept inline in the phase files.

Historical `F##` markers appear inline in the phase files. They are the original run's
finding IDs. The consolidated live set is in [`findings/`](./findings/index.md) — everything
else was either closed, promoted into a design, or is tracked as a bug on its own checklist
item (see below).

## Finding lifecycle

The `findings/` folder is a **staging area for issues that carry an open design decision** —
a contract, schema, or intended-behaviour question that needs a call before it can be built.

- **A bug** — wrong output, a crash, a render error, a stale read — is fixed directly and
  recorded as inline evidence on its checklist item. It never gets a findings file. Bugs are
  not design decisions, and a log of them is noise.
- **A design-worthy finding** — one where the fix depends on a decision no one has made yet
  — gets one `F##-slug.md` file. Each is self-contained: symptom, root cause, the options,
  and the open decision. IDs are **stable and never renumbered** (they are cited across other
  designs); new findings continue from **F31**.

A finding is moved to `_completed` folder once it has been addressed.

Statuses used in the index: `needs-design`, `investigate` (not yet root-caused),
`enhancement`, `promoted`, `closed`.

## What moved, and why the old log was dropped

The earlier flat `FINDINGS.md` had grown to ~24 open items mixing genuine design questions
with plain bugs. Its live design-worthy content had already been triaged into the
`designs/users/` phase folders (`04-planning`, `06-investigate`) and into shipped designs.
Rather than cart the whole log across, only the still-open, design-worthy items are carried
into `findings/` with their stable IDs:

- **Migrated (open):** F2, F10, F12, F30.
- **Excluded — already resolved:** F11 and F19 (fixed upstream — `callback-url-default`,
  `update-session-store-refresh`); F21 and F22 (shipped in
  [`../_completed/2fa-enrolment-modal`](../_completed/2fa-enrolment-modal/design.md)).
- **Excluded — already promoted:** F29 (owned by the active
  [`../role-editing`](../_completed/role-editing/design.md) design — orphaned `appRoles` are first-class
  there).
- **Dropped:** everything else was a bug now fixed, or a duplicate of the above.

The `04-planning` and `06-investigate` folders are **retained as historical triage snapshots**
(several completed designs cite them for provenance — F14/F21/F22/F26 origins) but are
superseded going forward: each carries a banner pointing here, and new findings are filed in
`findings/`, never back into those folders.

## Non-goals

- **Not a smoke test on every commit.** This is a deliberate campaign run when the auth
  surface changes materially, not a per-PR gate. The per-PR gate is `pnpm ldf:b` plus CI.
- **Not automated.** Automating these flows (Playwright against the rig) is a possible future
  design; it is out of scope here.
