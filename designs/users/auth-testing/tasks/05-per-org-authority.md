# Phase 5 — Per-organization authority (org-authority feature)

> **Depends on:** Phases 0, 3. · **Legend:** `[ ]` to do · `[x]` done · `[~]` partial · `[-]` N/A this run · **"Verify in Compass"** = check the rig DB. · Context: [`../design.md`](../design.md) · index: [`tasks.md`](./tasks.md).

> **Org-authority landed 2026-08-04** (`designs/auth-upgrade/features/org-authority`).
> App roles moved off the CSV `member.role` onto a native `member.appRoles` array; org
> authority became **per-organization** (the caller's member row in the target org);
> `auth.userAdminRole` and its app-wide floor are gone, replaced by a per-step per-scope
> floor; impersonation is retired; the user-admin module is welded to a build-time
> `org_slug` var. This phase covers what earlier phases predate — most items here were
> **never exercised against a running server** (the design's task 23 shipped config but
> no run record).
>
> **These items supersede three stale earlier notes** recorded under the pre-split
> behaviour: Phase 1 line 71's `role: ''` auto-join (now mints `'member'`), Phase 0
> line 44's UUID `_id` for the pinned org (now **keyed by its slug**), and Phase 3's F29
> `ROLE_NOT_FOUND`-on-save (orphan `appRoles` are now first-class — see below). Do not
> re-tick the old items; verify the new behaviour here.

### Setup — two instances in one app

The demo app hosts **both** admin surfaces: `user-admin` welded to the pinned `demo`
org, and `customer-user-admin` welded to `customer-portal` (`apps/demo/modules.yaml`,
two entries, one `source`, two `org_slug` values). The demo app does **not** create
`customer-portal` — a second app pinned to that slug must boot first to seed the org
(`ensureOrganization`), or `customer-user-admin`'s reads `$match` an org that does not
exist and render **empty with no error**.

- [ ] **Second app booted and `customer-portal` org seeded** — Verify in Compass: a
      `user-organizations` row whose `_id` **is** the string `customer-portal` (not a UUID).
- [ ] **Pinned `demo` org re-keyed by slug** — Verify in Compass: the `demo` org row's
      `_id` is the string `demo` (task 12 + the reshape re-key; supersedes Phase 0 line 44).
- [ ] Both instances build and both consoles load: `/user-admin/all` and
      `/customer-user-admin/all` each render their **own** organization's members only.

### Storage shape — the two role fields

- [ ] **Auto-join mints `role: 'member'`, not `''`** (supersedes Phase 1 line 71). Verify
      in Compass: a self-signup `user-members` row has `role: 'member'` and **no**
      `appRoles` (or `appRoles: []`), so `_user.roles = []` because it reads `appRoles` —
      **not** because `role` is empty.
- [ ] **App roles land in `member.appRoles` as a native array** — after saving roles on a
      member (Attributes tile → `UpdateMemberRoles`), Verify in Compass: `appRoles` is a
      BSON **array** (e.g. `["manager"]`), and `role` is untouched at `owner`/`admin`/`member`.
      No comma-joined CSV anywhere in the row.
- [ ] **`_user.roles` and `_user.orgRoles` are separate** — a signed-in member's `_user`
      shows `roles` = the app-role array and `orgRoles` = the split of `member.role`
      (`['member']` for a plain member). Confirm in the browser (renders on first paint and
      **survives** the session-store settle — the client spreads the resolved caller).
- [ ] **Orphaned `appRoles` are first-class** (supersedes F29) — a member holding an
      `appRoles` entry not in the app catalog: the card shows a flagged "no longer
      configured" chip, and **saving with the orphan present succeeds** — no `ROLE_NOT_FOUND`,
      nothing silently stripped. Verify in Compass the orphan is still on the row after save.

### Cross-organization authority (the task-23 walkthrough)

One administrator holding **`admin` in one org and `member` in the other** is the whole
point of the feature. Bootstrap such a user (e.g. `admin` in `demo`, `member` in
`customer-portal`).

- [ ] **Bounded to exactly one org** — in the `user-admin` (demo) console the admin can
      list, invite, edit roles, ban, and edit attributes; in the `customer-user-admin`
      console they hold **only** what `member` grants (reads gated by the app glob; every
      write refused by the floor).
- [ ] **Floor refusal names the organization** — a write into the org the caller does
      **not** administer (e.g. `customer-user-admin` invite/role-change) is refused, and the
      error **names `customer-portal`**. A generic "refused" is a **finding on the engine
      floor**, not a pass.
- [ ] **User-row writes are bounded by target membership** — ban / delete / revoke-sessions /
      global-attributes (`BanUser`, `DeleteUser`, `RevokeUserSessions`, `UpdateUserAttributes`)
      succeed only when the target holds a member row in the **resolved** org. From the
      `customer-user-admin` console, attempting these on a member who belongs **only** to
      `demo` is refused by the `targetUser` membership check.
- [ ] **A ban reaches every organization** (Decision 1, accepted) — banning from one org
      sets `users.banned: true` (one row per person) and locks the target out of the other
      org too. The containment is the audit event, not the permission model. Verify in Compass.
- [ ] **`get_user_memberships` shows other-org membership** — the target's detail page lists
      the name and roles of every **other** organization they belong to (defined by
      `organizationId: { $ne: org_slug }`). This is uniform and ungated by design.

### Endpoint gate + floor (negative)

- [ ] **Unlisted instance leaks** (guard the config) — confirm each admin instance has its
      glob in **both** `pages.roles` and `api.roles` (`user-admin: [user-admin/**]`,
      `customer-user-admin: [customer-user-admin/**]`, `apps/demo/lowdefy.yaml`). Temporarily
      **remove one `api.roles` glob**, rebuild, and confirm that instance's endpoint answers
      with **no session at all** (resolves `{ public: true }`) — its members/emails/export are
      exposed. **Revert immediately.** (This is task 23's step-7 ungated-endpoint probe: it
      must be **run and reverted**, not reasoned about.)
- [ ] **Gate role without org `admin` is still refused** — a caller who holds the instance's
      gate role (so reads pass) but is only `member` in the administered org is rejected by the
      step's per-organization floor on any write.

### Org-authority grant control (`UpdateMemberOrgRole`)

- [ ] **Grant / revoke org authority** — the Attributes-tile control (behind `org_authority`,
      default **on**) has its own selector and submit → `UpdateMemberOrgRole` writes
      `user-members.role` to `owner` / `admin` / `member`. Revoking writes **`member`**, never
      an empty value. Verify in Compass.
- [ ] **Sole-owner demotion refused** — demoting the organization's only `owner` is refused
      with the org plugin's own last-owner message.
- [ ] **`org_authority: false` rejects, not just hides** (fix `5efcece3`) — in a config run
      with the var off, the control is hidden **and** a forged call to `update-org-role` is
      **rejected** with "Organization authority is not granted through this app", not silently
      accepted.

### Impersonation retired (negative)

- [ ] **No "View as user" control** anywhere in the user-admin console (removed).
- [ ] **`ImpersonateUser` / `StopImpersonating` client actions gone** — an app authoring them
      fails to build (unknown action), not a silent no-op.
- [ ] **`/admin/*` disabled at the router** — a direct browser POST to
      `/api/auth/admin/impersonate-user` (or any `/admin/*`) is refused; `disabledPaths` covers
      the whole surface with no exemption.
- [ ] **No `impersonatedBy`** — `_user` never carries `impersonatedBy` (producer deleted).

### Organization rename (`UpdateOrganization` step)

- [ ] **Rename works** — a step call with `name` / `logo` / `metadata` updates the org row;
      an empty call (none of the three) is **rejected**, and a call carrying `slug` is
      **refused** (the slug is the org id and is immutable). Verify in Compass.
