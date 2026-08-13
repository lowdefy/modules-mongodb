# Implementation Tasks — snake_case Data Fields

## Overview

Aligns the `user-admin`, `user-account` and `shared` modules — the native readers of
the auth collections — with the upstream snake_case data-plane rename: every native
MongoDB pipeline reference, pass-through projection output key, client read of those
keys, and the one app-facing `_user` field move to snake_case, then the docs and demo
that ride along are regenerated. Derived from `designs/users/snake-case-data-fields/design.md`.

## Global Constraints

- **Plane-aware edit, not a global find-replace.** Flip the **data plane** (native
  `$match`/`$lookup` `localField`/`foreignField`/`$project`/`$addFields` source refs,
  pass-through projection output keys, `$unset` lists, client reads of those keys, the one
  `_user` field). Leave the **API/config plane** camelCase: better-auth **action params**
  (`memberId`, `organizationId`, `appRoles`, `userId`, sign-in `providerId`, …),
  **hook payloads** (`_payload: user.emailVerified`), **action responses**
  (`.response.totpURI`, `.response.backupCodes`), **JSON bag inner keys**
  (`user.profile.contactId`, `user.attributes.*`, `member.attributes.*`,
  `contact.profile.*`), `$lookup` `as:` aliases, and repo change-stamp fields
  (`created.timestamp`, `updated.timestamp`).
- **`user.profile.contactId` must NOT flip** — it reads like a physical ref but is a bag
  key (and is the `members_base` `localField`). Out of scope; contactId design ships later.
- Single-word columns (`token`, `email`, `role`, `status`, `slug`, `banned`) and
  `member.role` are a no-op under snakeCase — leave them.
- **Comment references also flip.** A comment naming a renamed physical column
  (`appRoles`/`expiresAt`/`userId`/`userAgent`…) beside a snake `$match` names a field that
  no longer exists — update it (per CLAUDE.md, comments describe current code).
- **Deep-link query key standardised on `user_id`** — writer and every reader must agree
  (it's an arbitrary label, not a column; the rename doesn't touch it on its own).
- **Nothing has shipped** — lands only on the experimental platform version in lockstep
  with the upstream adapter. No consumer migration, **no breaking-change framing** in docs.
- **Correctness depends on the upstream change being present** — the adapter's `fieldName`
  derive (snakes columns) and `normalizeCaller` (snakes `_user`) live in `lowdefy-design`,
  not this repo. Build checks here verify config compiles, not runtime behaviour.
- **Build-verify:** `pnpm ldf:b` (from `apps/demo`) + `pnpm docs:check`.

## Tasks

| #   | File                              | Summary                                                                          | Depends On    |
| --- | --------------------------------- | -------------------------------------------------------------------------------- | ------------- |
| 1   | `01-user-admin-native-reads.md`   | Flip `user-admin/requests/**` + `stages/**` pipeline refs; deep-link reader keys | —             |
| 2   | `02-user-admin-api-endpoints.md`  | Audit `user-admin/api/**`; flip native pipeline halves only                      | —             |
| 3   | `03-user-admin-client-reads.md`   | Flip `user-admin` components/pages reads; deep-link writer; comment refs         | 1             |
| 4   | `04-user-account-native-reads.md` | Flip `user-account/requests/**`; audit `user-account/api/**` (no change)         | —             |
| 5   | `05-user-account-client-reads.md` | Flip `user-account` components/pages reads; `_user: two_factor_enrolled`         | 4             |
| 6   | `06-shared-session-fields.md`     | Flip `shared/sessions/session_fields.yaml`; confirm `shared/contact/*` no-change | —             |
| 7   | `07-docs-regenerate.md`           | Update indexes/row-contract/migration + manifest var desc; `pnpm docs:gen`       | 1,2,3,4,5,6   |
| 8   | `08-demo-and-build-verify.md`     | Audit/update demo consumers; `pnpm ldf:b` + `pnpm docs:check`                    | 1,2,3,4,5,6,7 |

## Ordering Rationale

The sweep splits by module and by surface so each task is one coherent, reviewable commit
with the plane distinction checkable on a focused set of files.

- **Native reads are the foundation.** Tasks 1 and 4 flip each module's pipeline refs and
  thereby fix the snake **row contract** (the output keys client code reads). Each module's
  **client-reads** task (3, 5) consumes that contract, so 3 depends on 1 and 5 depends on 4;
  the `Interfaces` block pins the exact snake key names across the seam.
- **API endpoints (2)** and **shared session fields (6)** touch independent surfaces and
  depend on nothing — they can run in the first wave alongside 1 and 4.
- **First wave (parallel):** 1, 2, 4, 6. **Then:** 3 (after 1), 5 (after 4).
- **Docs (7)** encode the rename decisions and regenerate `vars.md` from an edited manifest,
  so they land after every rename task.
- **Demo + build-verify (8)** is the only task that exercises the whole change end-to-end
  (`ldf:b` + `docs:check`) — strictly last.

The deep-link key standardisation lives entirely within `user-admin`: the readers
(`_url_query`) are in the request files (task 1), the writer (urlQuery key) is in
`all_members_table` (task 3). Both use `user_id`; task 3 depends on task 1 so they land in
order.

## Scope

**Source:** `designs/users/snake-case-data-fields/design.md`
**Context read:** `design.md`; source under `modules/{user-admin,user-account,shared}/`;
`docs/{user-admin,user-account}/`; `apps/demo/`
**Review files skipped:** `review/review-1.md`
