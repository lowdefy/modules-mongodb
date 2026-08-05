# Phase 3 — User-admin console (`user-admin`)

> **Depends on:** Phases 0, 1. · **Legend:** `[ ]` to do · `[x]` done · `[~]` partial · `[-]` N/A this run · **"Verify in Compass"** = check the rig DB. · Context: [`../design.md`](../design.md) · index: [`tasks.md`](./tasks.md).

### Page role gate

- [ ] **`user-admin/*` page gate holds:** a signed-in user **without** the `user-admin` role is denied the console pages (redirect/403), not just the endpoints — `auth.pages.roles.user-admin: [user-admin/*]`. Test by visiting `/user-admin/all` as a plain member (a second account, or temporarily strip the role) and confirming access is refused; then confirm the bootstrapped admin is admitted. (Admin reached the page this run, but the negative case — non-admin blocked — wasn't confirmed.)

### `all` page

- [~] **Members** tab: name/email/roles/status + created/updated/signed-up dates; joined contact name renders — list renders **only with a filter applied** (no-filter load crashes → **F24**); custom Department column empty → **F26**; core fields (name/email/roles-label/status/dates) pending visual confirmation
- [ ] **Invitations** tab with pending-count badge; **Invited** vs **Expired** derived correctly (`pending` + `expiresAt` vs now)
- [ ] Filters: name/email are regex; **role filter matches exact split elements** (`admin` does not match `super-admin`)
- [ ] Sort via `sort-filters` is server-side (orders across pages); direction toggle flips order
- [ ] Excel export (`download: true`) merges members + invitations into one sheet with a `status` column

### Invite flow (`invite` page — email-first check)

- [ ] **Unknown email** → blank form → creates contact + `InviteMember`; branded invitation email in Mailpit; accept link carries `?invitationId=`
- [ ] **Existing contact, no membership** → prefilled from `contact.profile`
- [ ] **Pending invitation** → shown with resend / cancel
- [ ] **Already a member** → links to their user detail page
- [ ] Captured profile is **persisted** to the contact (write-profile); the members list shows a name pre-onboarding
- [ ] **Re-invite an Expired row** → cancel-then-invite; **no duplicate `pending`** row (Verify in Compass: `user-invitations`)
- [ ] Member attributes captured on the invite are applied to the member at accept-time

### `view` (user detail)

- [x] **Profile** tile edit (admin editing the target) → write-profile → **target's** `users.profile` re-denormed (Verify in Compass) — confirmed: `job_title`/honorific `title` written to `user-contacts.profile` + re-denormed to `users.profile`; change stamp now carries `updated.user {name, id}`. (Self-edit here since admin is the only user; target = admin. Form UX → **F27**.)
- [x] **Attributes** tile: roles from the catalog (labels + descriptions in the picker); save → `UpdateMemberRoles` + `UpdateMemberAttributes` — confirmed: role `manager` added (`user-members.role: "user-admin,manager"`) and `attributes.team: "beta"` written
- [~] **Orphaned role** (in `member.appRoles` but not in the catalog) → shown as a flagged "no longer configured" chip, removable, never silently stripped — **display** confirmed (card chip renders); **edit** broken → **F29**: selector shows a label-less tag, and saving with the orphaned role throws `ROLE_NOT_FOUND` (uninformative; conflicts with "removable, never silently stripped")
- [x] **Global attributes** tile → `UpdateUserAttributes` — confirmed: `users.attributes.notes` written
- [ ] **Security** tile: sessions (token projected out), "sign out everywhere" (`RevokeUserSessions`); auth methods read-only (linked providers, passkey count, MFA, email-verified)
- [ ] **Suspend** (`BanUser`) → `users.banned: true`, sessions revoked, status → Suspended; blast-radius dialog enumerates other memberships (when any exist)
- [ ] **Reinstate** (`UnbanUser`) → back to Active
- [ ] Suspend/reinstate surface **hidden** when `suspension: false` (separate config run)
- [ ] **Remove from app** (`RemoveMember`) → member row deleted; contact survives
- [ ] **Delete login identity** (`DeleteUser`) — available **only** when the user has no other memberships; user row hard-deleted, contact survives
- [x] **Apps** tile: cross-app badges from other memberships; **hidden** when the user belongs only to this app — confirmed hidden (single-app membership)
- [ ] **Activity** tile: event timeline renders module audit events — **empty despite events existing** (8 `log-events`, 4 matching the target); read-side schema mismatch → **F28**
- [ ] **Organization authority** (Attributes tile, behind `org_authority`, default on): its own selector and its own submit → `UpdateMemberOrgRole` writes `user-members.role` (`owner` / `admin` / `member`); revoking writes `member`, not an empty value; demoting the organization's sole owner is refused with the plugin's own message. **Verify in Compass**
