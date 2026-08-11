# Phase 3 — User-admin console (`user-admin`)

> **Depends on:** Phases 0, 1. · **Legend:** `[ ]` to do · `[x]` done · `[~]` partial · `[-]` N/A this run · **"Verify in Compass"** = check the rig DB. · Context: [`../design.md`](../design.md) · index: [`tasks.md`](./tasks.md).

### Page role gate

- [ ] **`user-admin/*` page gate holds:** a signed-in user **without** the `user-admin` role is denied the console pages (redirect/403), not just the endpoints — `auth.pages.roles.user-admin: [user-admin/*]`. Test by visiting `/user-admin/all` as a plain member (a second account, or temporarily strip the role) and confirming access is refused; then confirm the bootstrapped admin is admitted.

### `all` page

- [ ] **Members** tab: name/email/roles/status + created/updated/signed-up dates; joined contact name renders. No-filter load must **not** crash (F24); the custom Department column is populated (F26)
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

- [ ] **Profile** tile edit (admin editing the target) → write-profile → the **target's** `users.profile` re-denormed; the change stamp carries `updated.user {name, id}` (Verify in Compass). Form UX → **F27**.
- [ ] **Attributes** tile: roles from the catalog (labels + descriptions in the picker); save → `UpdateMemberRoles` + `UpdateMemberAttributes` (Verify in Compass)
- [ ] **Orphaned role** (in `member.appRoles` but not in the catalog) → shown as a flagged "no longer configured" chip, editable and removable, and **saving with the orphan present succeeds** — no `ROLE_NOT_FOUND`, nothing silently stripped. Verify in Compass the orphan is still on the row. _(Supersedes F29 — orphan `appRoles` are now first-class; see Phase 5.)_
- [ ] **Global attributes** tile → `UpdateUserAttributes` (Verify in Compass)
- [ ] **Security** tile: sessions (token projected out), "sign out everywhere" (`RevokeUserSessions`); auth methods read-only (linked providers, passkey count, MFA, email-verified)
- [ ] **Suspend** (`BanUser`) → `users.banned: true`, sessions revoked, status → Suspended; blast-radius dialog enumerates other memberships (when any exist)
- [ ] **Reinstate** (`UnbanUser`) → back to Active
- [ ] Suspend/reinstate surface **hidden** when `suspension: false` (separate config run)
- [ ] **Remove from app** (`RemoveMember`) → member row deleted; contact survives
- [ ] **Delete login identity** (`DeleteUser`) — available **only** when the user has no other memberships; user row hard-deleted, contact survives
- [ ] **Apps** tile: cross-app badges from other memberships; **hidden** when the user belongs only to this app
- [ ] **Activity** tile: the event timeline renders the module audit events for the target (read-side schema alignment — **F28**)
- [ ] **Organization authority** (Attributes tile, behind `org_authority`, default on): its own selector and its own submit → `UpdateMemberOrgRole` writes `user-members.role` (`owner` / `admin` / `member`); revoking writes `member`, not an empty value; demoting the organization's sole owner is refused with the plugin's own message. **Verify in Compass**
