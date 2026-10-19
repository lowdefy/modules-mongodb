# Implementation Tasks — Roles UX and org-authority migration corrections

## Overview

These tasks implement `designs/users/role-editing/design.md` — the `user-admin`
module's own side of the shipped org-authority storage migration: fix the
silently-deleting orphan chip, surface role descriptions on the three surfaces
that miss them, drop the inert `required` asterisks, delete the stale
`_build.authConfig` gap notes, close the resend org-authority downgrade, drop the
`roles_arr` / `role_ids` raw-id aliases in favour of the resolved `roles` surface,
document the role-filter index, and cut dead/journey config.

## Global Constraints

- **`roles` is the single published roles surface.** After this work no
  `roles_arr` and no `role_ids` exist anywhere in the module — reads, components,
  payloads, or `row-contract.md` (D-alias).
- **An orphan option's `value:` is the real role id**, carried from
  `roles_from_catalog`'s new `id` field — never derived from a display label (the
  label falls back to the raw id via `$ifNull: ["$$hit.label", "$$rid"]` only for
  display) (D4).
- **`_build.authConfig` resolves in module config.** It is NOT a running-engine
  gap — the built `view.json` proves it. Never reintroduce a
  `NOTE (running-engine gap)` comment (D5-notes).
- **Physical member field names are `organizationId` / `appRoles` (camelCase)
  today.** The upstream snake-case-data-fields rename has not landed; `indexes.md`
  states the physical adapter-derived names and is regenerated to snake_case when
  that design ships (D7).
- **`org_role` single `Selector`s keep `required: true`.** Only the array-valued
  role `MultipleSelector`s lose it (D6).
- **Repo comment rule (CLAUDE.md):** comments describe the current code, not the
  journey to it — no task-numbers, "used to", "no longer", stale-model framing.

## Tasks

| #   | File                                 | Summary                                                                                      | Depends On |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-roles-catalog-id-desc.md`        | `roles_from_catalog.yaml`: resolved entry gains `id` + `description`; gap note gone          | —          |
| 2   | `02-access-modal-orphan-picker.md`   | `get_user_detail` + `modal_access`: orphan_ids, orphan options, seed→roles.id, no `required` | 1          |
| 3   | `03-invite-form-desc-required.md`    | `invite_form.yaml`: filterString+description, drop `required`, delete gap note               | 1          |
| 4   | `04-filter-and-chip-descriptions.md` | `all_members_filters` + `tile_attributes`: rich filter label/tag/search, chip tooltip        | 1          |
| 5   | `05-members-table-dead-config.md`    | `all_members_table.yaml`: drop dead `{% elif r.primary %}`, fix entry-shape comments         | 1          |
| 6   | `06-resend-preserve-serverside.md`   | `resend-invitation` + `all_invitations_table`: server-side preserve; drop role_ids payload   | —          |
| 7   | `07-drop-raw-id-aliases.md`          | `members_base` / `invitations_base` / `close_row`: drop `roles_arr` + `role_ids`             | 2, 6       |
| 8   | `08-comment-cleanup.md`              | `api/invite`, `api/suspend`, `api/update-access`: cut journey/stale comments                 | —          |
| 9   | `09-index-docs.md`                   | New `docs/user-admin/reference/indexes.md`; link from `index.md`; regen `llms.txt`           | —          |
| 10  | `10-row-contract-doc.md`             | `row-contract.md`: drop both aliases, `roles` is the one binding, record reversal            | 7          |
| 11  | `11-verify-and-demo.md`              | Build check, artifact inspection, index explain plan, resend/orphan rig checks               | 1–10       |

## Ordering Rationale

**Task 1 is the root.** `roles_from_catalog.yaml` carrying `id` + `description`
per resolved entry unlocks everything downstream: descriptions on the display
surfaces (tasks 3, 4), the orphan option's stable id value (task 2), and — via
`id` on each entry — the ability to drop the raw-id aliases (task 7). Tasks 2–5
each depend only on task 1 and are **independent of each other**, so they can run
in parallel once task 1 lands.

**Task 6 (resend preserve) is independent of the catalog work** and can run in
parallel with task 1. It must land before task 7, because task 6 is what moves the
Invitations-list Resend button off `row.role_ids`; task 7 then removes `role_ids`
from the invitations row. Removing the alias before its last reader is gone would
break the button at runtime.

**Task 7 (drop aliases) depends on 2 and 6** — the two internal readers of the
raw-id aliases. Task 2 moves the access-modal seed off `get_user_detail.role_ids`
(and task 2 itself drops `role_ids` from `get_user_detail`); task 6 moves the
resend button off `row.role_ids`. Once both are done, `members_base`,
`invitations_base` and `close_row` can drop the aliases with no live reader left.
(`roles_arr` has no internal reader at all — the coupling is entirely through
`role_ids`.)

**Task 10 (row-contract doc) depends on 7** so the doc matches the shipped wire.
**Task 9 (index docs) is independent** and can run any time; it owns the
`pnpm docs:gen` regen for the new page.

**Task 11 exercises the feature last** — build check plus artifact inspection are
autonomous; the index `explain` plan, the resend downgrade re-test on both callers,
and the orphan behavioural checks need a live DB / the auth-testing rig and are
called out as non-autonomous steps.

## Scope

**Source:** `designs/users/role-editing/design.md`
**Context read:** `design.md` and the touched module/docs source (`roles_from_catalog.yaml`, `get_user_detail.yaml`, `members_base.yaml`, `invitations_base.yaml`, `close_row.yaml`, `modal_access.yaml`, `tile_attributes.yaml`, `invite_form.yaml`, `all_members_filters.yaml`, `all_members_table.yaml`, `all_invitations_table.yaml`, `resend-invitation.yaml`, `check-invite-email.yaml`, `get_all_members.yaml`, `get_users_excel_data.yaml`, `docs/user-admin/index.md`, `docs/user-admin/reference/row-contract.md`, `docs/user-account/reference/indexes.md`)
**Review files skipped:** `review/review-1.md`, `review/review-2.md`, `review/review-3.md`
