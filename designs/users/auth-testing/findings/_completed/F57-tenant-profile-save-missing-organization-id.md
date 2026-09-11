# F57 — Saving own profile under `tenant` policy fails: `denorm_user_profile` step has no `organizationId`

**Status:** `fixed` (root-caused, patched, verified with a live tenant save) · **Area:**
shared/contact / profile save (both policies; surfaces first under `tenant`)

Saving the caller's own profile in a `tenant`-policy app (e.g. `apps/tenant-demo`) throws a route
`ConfigError` at request time:

```
[ConfigError] Auth step "denorm_user_profile" requires an "organizationId" property under the
"tenant" organizations policy - there is no pinned organization to default to.
Set organizationId on the step properties.
  Source: /Users/sam/Developer/modules-mongodb/modules/shared/contact/write-profile.yaml:152
```

## Root cause — a camelCase → snake_case rename hit a framework API

The failure is **not** an org-less session (an earlier draft of this finding chased that — it was wrong;
see the correction at the bottom). It is a **property-key casing mismatch** on the `UpdateUserProfile`
auth step.

`write-profile.yaml`'s `denorm_user_profile` step passed its properties in **snake_case**:

```yaml
- id: denorm_user_profile
  type: UpdateUserProfile
  properties:
    user_id: # framework reads `userId`
      _var: user_id
    organization_id: # framework reads `organizationId`
      _var: organization_id
```

But the BetterAuth auth-step contract is **camelCase**. `resolveStepOrganizationId` reads
`properties.organizationId`; with the key spelled `organization_id` that is `undefined`, and under
`tenant` an absent `organizationId` is a hard error (no pinned org to default to) — F57. It throws in
`handleAuthStep` **before** the step body runs, so the `write_contact` step (earlier in the routine)
had already landed. The var _value_ (`_user.organization_id`) was correct all along — it simply never
reached the key the framework inspects.

**Evidence (each verified in source / DB / git):**

- **Framework contract is camelCase, in every installed version.** `UpdateUserProfile.allowedProperties`
  is `[…, 'organizationId', …, 'userId']` and the step _rejects_ unknown keys; `resolveStepOrganizationId`
  reads `properties.organizationId`. True in `@lowdefy/plugin-better-auth` `20260723`, `20260807`, and the
  running `20260813120102` alike — the framework never used snake_case for these.
- **Working reference next door.** `modules/organizations/api/invite.yaml:45` calls `InviteMember` with
  `organizationId: { _user: organization_id }` (camelCase key, snake value) and works. Every other
  auth-step caller in the repo (`organizations/*`, `user-admin/*`) uses camelCase keys. `write-profile.yaml`
  was the sole outlier — the repo-wide sweep found no other snake-cased auth-step property key.
- **The DB disproves org-less.** For the failing account (`tenant2@demo.test`) the tenant wall stamped
  `organization_id: 1dc4…` onto the `write_contact` step, and the `log-changes` `meta.user` on that write
  shows `organization_id: 1dc4…` populated. The caller _had_ an active org; the denorm still threw. The
  tell: that account's **contact** carries the full profile (`write_contact` succeeded) while its **user
  row** has `name: ""` and no profile bag (the denorm never persisted).
- **git blame names the regression.** `write-profile.yaml:155,157` were rewritten by
  `dff2cb044` — _"merge: Reconcile auth-upgrade's org-authority and snake_case work with the tenant
  surface"_ — which renamed the step-property keys `userId → user_id` and `organizationId →
organization_id`. The original step (b14faa67 / 5ffb2153) used camelCase. The snake_case reconciliation
  over-reached from repo IDs (correctly snake_case) into a framework API (must stay camelCase).

**Blast radius — both profile-save paths through the shared fragment:**

- Under `tenant` (user-account self-service): throws F57 at `resolveStepOrganizationId` (no pinned default).
- Under `pinned` (`apps/demo`, and `user-admin`): `resolveStepOrganizationId` silently defaults to the
  pinned org, so it gets one step further and then throws
  `UpdateUserProfile received unknown properties "user_id", "organization_id"` at the step's own
  validation. Either way the denorm never lands.

## Fix (applied)

`modules/shared/contact/write-profile.yaml` — revert the two step-property **keys** to camelCase (the
`_var` names, which are local, stay snake):

```yaml
properties:
  userId:
    _var: user_id
  organizationId:
    _var: organization_id
  profile: …
  name: …
  image: …
```

One shared fragment fixes both the tenant self-service save and the pinned/admin save. `apps/tenant-demo`
(tenant) and `apps/demo` (pinned) both build clean, and a live tenant save (signup → 2FA enrol →
onboarding) now succeeds. Note: the running `pnpm ldf:d` dev server serves `.lowdefy/dev/build` and does
**not** hot-reload edits to `_ref`'d files under `modules/` — a server restart was needed before the fix
took effect live.

A repo-wide sweep of all 18 BetterAuth step types confirmed `write-profile.yaml` was the _only_ auth-step
caller carrying snake-cased property keys — no siblings from the same rename remain.

---

### Correction — the earlier "org-less session" root cause was wrong

A prior version of this finding concluded the caller reached onboarding with an org-less
(`awaitingOrganization`) session and that `_user.organization_id` was therefore null. The DB refutes it:
the failing caller held an active org, the wall stamped it, and the same request's `meta.user` carried it.
The org-less-caller change (lowdefy #2292) is real and does change how an org-less tenant session resolves,
but it is **not** what caused F57 here. Kept as a note so the reasoning isn't re-derived: the trigger is
the property-key casing above, full stop.
