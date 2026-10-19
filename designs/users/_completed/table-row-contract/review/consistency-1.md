# Consistency Review 1

## Summary

Checked the design against every resolution annotation in `review-1.md` and against the code the
design cites. All ten review decisions are correctly reflected in `design.md`; five inconsistencies
were found — one dangling forward reference to a rejected review finding, four stale line citations
— all auto-resolved. One further conflict is with code shipped by the sibling `profile-identity`
work and is open pending a decision (item 6).

## Files Reviewed

**Design:** `designs/users-fixes/table-row-contract/design.md`
**Reviews:** `designs/users-fixes/table-row-contract/review/review-1.md`
**Supporting:** none in this design's tree
**Tasks / plans:** none exist yet
**Referenced (read for reference-integrity):** `designs/users-fixes/04-planning/findings.md` (F26,
F14), `designs/users-fixes/profile-identity/design.md`,
`modules/user-admin/requests/{get_user_detail,get_all_members,get_users_excel_data,get_all_invitations}.yaml`,
`modules/user-admin/requests/stages/{members_base,invitations_base}.yaml`,
`modules/user-admin/{module.lowdefy.yaml,pages/all.yaml,pages/view.yaml,components/all_invitations_table.yaml}`,
`modules/activities/requests/get_activities_excel_data.yaml`,
`apps/demo/modules/user-admin/vars.yaml`, `docs/shared/slots.md`, `docs/user-admin/**`,
`modules/user-admin/package.json`

## Inconsistencies Found

### 1. D8 refers to a "key-set assertion in Verification" that review-1 rejected

**Type:** Review-vs-Design
**Source of truth:** review-1 finding #9 — `> **Rejected.** The developer will verify the row shape by hand rather than the design carrying a formal key-set gate. Verification section left as-is.`
**Files affected:** `design.md` (D8)
**Resolution:** D8's closing clause read "the key-set assertion in Verification becomes a real check
rather than a restatement of whatever the rig happens to hold" — but the Verification section carries
no such assertion, by that rejection. Rewrote to "the by-hand row-shape check reads against a stable
key set rather than whatever the rig happens to hold", which keeps the diagnosis rationale (the point
of D8) without pointing at a gate the design deliberately doesn't have.

### 2. `get_user_detail.yaml:39-49` is off by one line

**Type:** Stale Reference
**Source of truth:** the file — the three bags occupy `:39-50`; review-1's verification header cites
`:39-50` as well
**Files affected:** `design.md` (Current state, D3)
**Resolution:** both citations changed to `:39-50`.

### 3. `pages/all.yaml:126` no longer points at the `download_columns` wiring

**Type:** Stale Reference
**Source of truth:** the file — `- _module.var: components.download_columns` is at `:130`
**Files affected:** `design.md` ("The export slot pair is inert")
**Resolution:** changed to `pages/all.yaml:130`. (review-1 inherited the same `:126`; the file has
moved since.)

### 4. `apps/demo/modules/user-admin/vars.yaml:18-22` spans the comment, not the column

**Type:** Stale Reference
**Source of truth:** the file — `table_columns:` is at `:20`, the Department entry at `:21-23`
**Files affected:** `design.md` ("The list row is an accidental shape")
**Resolution:** changed to `vars.yaml:20-23`.

### 5. `docs/shared/slots.md` citation checked and correct

**Type:** Stale Reference (none)
**Source of truth:** the file — `get_all_*` is documented at `:45`
**Resolution:** no change. The design cites `:45`; review-1 finding #7 cites `:43`. The design is
right and is the later document, so nothing propagates.

### 6. `profile.picture` is bound by a built-in the design says binds nothing — RESOLVED

**Type:** Stale Reference / cross-design contradiction
**Source of truth:** the code, and `designs/users-fixes/profile-identity/design.md:81-82`
**Files affected:** `design.md` (D2), `modules/user-admin/pages/view.yaml:18`
**Resolution:** **Rebind, keeping `profile.picture` stripped.** The user chose the top-level alias at
implementation time. `pages/view.yaml:18` now reads `get_user_detail.0.picture`; D2's "nothing
built-in binds the raw forms" sentence is corrected to name the binding and the rebind, the rebind is
listed in Files changed, and `profile-identity/design.md` carries a note that its "all three reads
project the whole `profile` subdoc" claim no longer holds for the `user-admin` detail read. The
rejected alternative — dropping `profile.picture` from the exclusion list — would ship the
~800-character data-URI avatar twice on every row, which is the duplicate-path problem the alias rule
exists to prevent.

Original finding follows. D2 adds `profile.picture` to `close_row`'s exclusion
list and asserts "Nothing built-in binds the raw forms — the resend action reads `member_attributes`,
the Invitations table reads `expires_at`." That was true when review-1 was written. The sibling
`profile-identity` work has since shipped `modules/user-admin/pages/view.yaml:18`
(`avatar_src: {_request: get_user_detail.0.profile.picture}`), and that design states "all three reads
project the whole `profile` subdoc, so `profile.picture` is available on each page without a read
change" — which `close_row` falsifies for the `user-admin` detail read. `members_base` already emits
the top-level `picture` alias on that read, so the natural resolution is a one-line rebind recorded in
Files changed plus a correction to D2's claim; the alternative is dropping `profile.picture` from the
exclusion list and accepting the duplicated data-URI blob.

## No Issues

- **All ten review-1 decisions are reflected in the design.** Breaking changes section with its four
  items and the single `get_all_users` `$addFields` migration (#1); D4's shape-parity premise struck
  and D5 reduced to a documentation note (#2); both export `$project` whitelists deleted and the close
  applied after the slot in every read (#3); the exclusion list's two-category rule with `attributes`,
  `createdAt`, `expiresAt` (#4); D8 declaring `picture` / `created` / `updated` via `$ifNull`, plus
  `profile.picture` in the exclusion list and the export's trailing `$unset: picture` (#5); the
  export's `roles`-as-string and `expires` divergence note under the contract table (#6);
  `docs/shared/slots.md` in Files changed (#7); D7 closing `get_all_invitations` and the stage renamed
  `close_row.yaml` (#8); Verification left as-is with no key-set gate and no demo comment (#9); the
  Team column's `cellRenderer` and the "a bag column renders the stored value" rule (#10).
- **The deliberate omission holds.** Review #1's resolution says the passkey-leak upside was left out
  of the migration note on purpose; the design's Breaking changes section does not mention it.
- **No stale stage name.** `members_row` (review-1's name for it) appears nowhere in `design.md`; all
  ten references are `close_row`.
- **Every cited file exists and every internal link resolves** — `docs/user-admin/how-to/migration.md`,
  `docs/user-admin/concepts/co-location.md`, `designs/user-account-better-auth/design.md`,
  `../04-planning/findings.md`, the orphan `apps/demo/modules/user-admin/components/table_columns.yaml`
  slated for deletion, and `modules/shared/profile/generate-avatar-svg.js.njk`.
- **Remaining code citations verified:** `get_users_excel_data.yaml:45`/`:89` (the two whitelists) and
  `:99` (the `$sort`), `module.lowdefy.yaml:152` (the `get_all_users` description),
  `members_base.yaml:31-33`/`:39`, `invitations_base.yaml:15-22`/`:47-51`,
  `all_invitations_table.yaml:41` (the `cellRenderer` pattern),
  `get_activities_excel_data.yaml:31` (slot after `$sort`), and `user-admin` at `0.17.0` (pre-1.0, so
  the minor changeset is right).
- **F26 cross-reference is current** — `04-planning/findings.md:23` marks it "→ designed" and links
  back to this design; F14 is still open there, matching the Non-goals entry.
- **No built-in binds any other stripped path.** Searched module and demo source for
  `get_user_detail.0.{user.,contact.,attributes,createdAt,passkeys}` and for `field:` / `value:`
  bound to `user.*` / `contact.*` / `attributes.*` — no hits, so D2's claim holds for everything
  except `profile.picture` (item 6).
- **No task or plan files exist**, so there is no design-vs-task or design-vs-plan drift to check.
