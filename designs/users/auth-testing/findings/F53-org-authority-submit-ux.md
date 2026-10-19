# F53 — Organization authority has its own submit hidden in the edit-role modal

**Status:** `designed` (decision settled; ready to implement) · **Area:** user-admin / view (Attributes tile)

The Organization authority control lives inside the edit-role modal but has its **own separate
submit button**, distinct from the modal's main "save roles" button. The result is confusing:
changing the authority selector and then clicking the modal's role-save button **does nothing**
to the authority — the change only lands via the other, less obvious button.

## Decision

Two changes to `modules/user-admin/components/view/modal_access.yaml`, no change to either API.

### 1. One submit, tier-first ordering

Drop the separate `save_org_role_btn`. The modal's single Save orchestrates both writes in its
`onOk`, running the **guarded tier write first**:

1. Validate `roles`, `member_attributes.*`, and (when the tier control renders) `org_role`.
2. `update-org-role` **first**, `skip`ped when `org_role` is unchanged from its seeded value — so
   a plain attributes save never invokes the organizations plugin or emits a spurious
   `org-role-updated` audit event. A refusal (sole owner, creator demotion) halts the chain here,
   **before** any app-role write lands, and the plugin's own message surfaces (no `error`
   override).
3. `update-access` (roles + attributes) — reached only on tier success or skip. It is an
   idempotent SET, so a failure here after a tier success is resolved by re-running Save.
4. `detail_refetch` runs last, so it doubles as the commit point.

**Why this dissolves the old "no rollback" objection.** The previous design kept two submits
because folding them would leave the app-role write applied when the tier write failed, with
nothing to roll back. That is an artifact of _ordering_, not of combining: running the guarded
write first means a refusal applies nothing, and the only residual write path is app-roles, which
is idempotent. The two-endpoint architecture (different write paths, separate auth, separate
audit) is unchanged — only the button wiring.

**Residual trade-off to accept and document:** if the tier write succeeds and `update-access`
then fails, `detail_refetch` never runs, so `get_user_detail.0.org_role` stays stale. On retry
the skip-compare sees new-state ≠ stale-request and **re-fires the tier write** — idempotent, but
it emits a second `org-role-updated` audit event. This mirrors the benign partial-state
`update-access` already tolerates.

Comments to rewrite (they currently assert the two-submit necessity):
`modal_access.yaml` header, and `docs/user-admin/index.md` lines ~46 and ~178 ("with its own
submit" / "app-role write applied with nothing to roll it back").

### 2. Copy: no manually-settable owner tier

The selector's owner/admin/member options read as a **capability ladder**, but there is none.
Per `../../../../lowdefy-design/designs/auth-upgrade/_completed/org-authority/design.md` Decision 4
(lines 250–252) `owner` and `admin` hold the **identical** permission set across the module's
whole floor (`member`, `user`, `session`, invitation actions); `member` holds none. The only
real difference is that `owner` is the **protected creator tier** (`creatorRole: 'owner'`,
last-owner guard) — the org-mutation powers that would distinguish it (`organization:
[update,delete]`) aren't reachable, since those mounted endpoints are disabled. Under `pinned`
there is typically no owner at all: the seed writes no member row, and migrated `userAdminRole`
users are minted as `admin` (user-model design, line 125).

So the assignable choice is binary — administrator or not:

```yaml
label:
  title: Organisation authority
  extra: Whether this person can administer the organisation — manage its
    members and their access. Independent of the app roles above.
```

- The selector offers **Admin** ("Administers the organisation") and **No admin access**
  ("A standard member; cannot administer") only.
- **`owner` is not manually settable.** When the member is currently an owner (the tenant
  creator; a migrated pinned admin never is), show it as a **read-only / locked "Owner" state**
  rather than a selectable option, and don't submit a tier change for them.

Rationale: it matches the model (administering = holding `admin`, Decision 1) instead of inventing
a grade distinction users must decode; it removes speculative surface (nothing in either policy
has a concrete need to _mint_ owners, and the last-owner guard already prevents stranding); and an
existing owner still round-trips safely under the write's own guards.

The `onOk` skip-compare and single Validate are identical whether the control is a 3-option
selector or the 2-option one, so change 1 and change 2 compose without interaction.

## Demo / verify

Exercise both the `pinned` (`apps/demo`) and `tenant` (`apps/tenant-demo`) access modals: a plain
attributes save (no tier call fires), an admin↔none grant/revoke via the single Save, and an owner
member rendering as the locked Owner state. `ldf:b` both apps.
