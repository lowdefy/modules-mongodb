# Task 5: `set-report-visibility` — one reversible act, gated asymmetrically

## Context

Publishing and unpublishing are **one reversible act** through a single endpoint with exactly two states: only me, or everyone in the app. No per-user grants, no groups, no share links. Anything finer needs an access model this module does not have, and inventing one here would mean owning it forever.

**The two directions are gated differently, and this is the whole substance of the task:**

- **Publish** requires the caller to be the owner **and** hold a `share_roles` role. Owner, because publishing someone else's private report would expose work they had not chosen to share; role, because that is the privilege.
- **Unpublish** requires the caller to be the owner **or** hold a `share_roles` role.

Checking both in both directions reads tidier and is the version that breaks. It makes publish reversible only while _both_ conditions still hold, and three ordinary situations dissolve one of them: a publisher whose role is revoked can no longer retract their own app-wide report; an app that switches publishing off freezes every already-shared report in place; and an author who leaves takes the only retraction path with them. In each case the content stays in front of the whole app and the only remaining exit is deleting it.

The asymmetry closes all three without a new field, endpoint or state. It is not an access model creeping in — it widens one existing check, in the restrictive direction only. It does hand `share_roles` holders a **moderation power** over reports they do not own, which is deliberate: anyone trusted to decide what the whole app sees is trusted to decide it should stop seeing something. There is no equivalent power to publish, rename, delete or edit someone else's report.

**Publish is independent of everything else.** Unpublishing does not archive, delete, unfavourite or move a report; it changes exactly one field. Conversely a deleted report cannot be published, because a deleted report is not readable at all.

**This write does not stamp `updated`.** The list sorts on `updated.timestamp`, so the stamp is not just an audit record — it is the list's order. Publishing changes who may see a report, not what it is.

## Interfaces

- **Consumes:** `_module.var: share_roles` (task 2); the document shape from task 3.
- **Produces:** `set-report-visibility` with payload `{ report_id, visibility }`. `reports-list` and `report-page` are the consumers. The build-gated `_user.hasSomeRoles` form written here is the one any later reader of `share_roles` copies.

## Task

Create `modules/ai-reporting/api/set-report-visibility.yaml`, `type: Api`.

### The role check

`_user.hasSomeRoles` does this in one operator — do **not** hand-roll the intersection with `_array.some` and a `_function`. It takes an array of role strings and returns `true` when `user.roles` contains at least one of them (`@lowdefy/operators-js/dist/operators/shared/user.js:54-64`, [docs](https://docs.lowdefy.com/_user)). It reads `user.roles` directly and returns `false` — rather than throwing — when the user is not logged in, when `roles` is missing, or when nothing matches, so the unauthenticated case needs no guard of its own.

**It validates its argument eagerly and throws on a non-array** (`:36-41`: `_user.hasSomeRoles accepts an array of strings`), and `share_roles` has no `default`, so an app that never sets it reaches the operator as `null` and the config errors at build. Gate the emission at build time:

```yaml
- :set_state:
    has_share_role:
      _build.if:
        test:
          _build.ne:
            - _module.var: share_roles
            - null
        then:
          _user.hasSomeRoles:
            _module.var: share_roles
        else: false
```

This is not a novel construction — `modules/deals/pages/all.yaml:27-42` already gates `_user.hasRole` behind `_build.if` for exactly this reason, with a comment saying so ("Build-gated so `_user.hasRole` isn't emitted with a null param (eager-validated → ConfigError)"). Follow that precedent and carry a comment of the same kind, since the reason is invisible from the YAML alone. `_build.*` resolves during the build, so an app with no `share_roles` ships a routine whose `has_share_role` is the literal `false` and the operator is never emitted at all.

`_user` is a shared operator, available server-side in a routine — the existing reporting endpoints already read `_user: id` and `_user: roles`.

**A build check proves the form compiles but cannot evaluate the role match.** That is why the e2e role matrix below is in this same task: it is the only thing that proves the gate at runtime.

### The routine

1. Reject an unauthenticated caller — "You must be signed in to change a report's visibility."
2. Validate `visibility` is exactly `"private"` or `"shared"`; reject anything else. There are two states and no third.
3. Compute `has_share_role` as above.
4. **Publish path** (`visibility: "shared"`): the update filter matches `_id`, `owner.user_id: caller`, and not-deleted; and the routine rejects before the write when `has_share_role` is false. Unset `share_roles` means every publish call is rejected — the rejection message should say publishing is not enabled for this app rather than implying the caller lacks a role.
5. **Unpublish path** (`visibility: "private"`): the filter matches `_id` and not-deleted, plus `$or: [{ owner.user_id: caller }, …]` — but the role half is not a document property, so express it as: when `has_share_role` is true the filter drops the owner match entirely; when it is false the filter keeps it. Use `_if` on `has_share_role` to choose between two static filters rather than assembling one dynamically.
6. `$set: { visibility: <payload value> }` and **nothing else**. No change stamp.
7. Return `{ ok: true, modifiedCount: … }`. A zero `modifiedCount` means the report was not found, not readable, already deleted, or already in that state — do not try to distinguish them into different messages; the endpoint's job is the authorization, and a non-owner learning _why_ their call failed is information the design does not owe them.

Register the endpoint in `modules/ai-reporting/module.lowdefy.yaml`: a `_ref` under `api:` and an entry under `exports.api` with a one-line description.

## Acceptance Criteria

`apps/demo/e2e/ai-reporting/report-visibility.spec.js`, using two seeded users — one holding a `share_roles` role, one not:

- **Owner + role publishes** — `visibility` becomes `"shared"` in the document.
- **Owner without the role cannot publish** — rejected; document unchanged.
- **Non-owner holding the role cannot publish** — rejected; document unchanged. This is the case that proves publish needs _both_.
- **Owner unpublishes** — `visibility` becomes `"private"`.
- **Non-owner holding the role unpublishes someone else's shared report** — succeeds. This is the moderation power, and it is the reason for the whole asymmetry.
- **Non-owner without the role cannot unpublish** — rejected.
- **A deleted report cannot be published** — the not-deleted predicate in the filter means zero modified.
- **Unpublishing changes exactly one field** — assert `updated`, `favourite_of` and `deleted` are byte-identical before and after, which is what "publish is independent of everything else" means concretely.
- An invalid `visibility` value is rejected.

Plus: `pnpm ldf:b` from `apps/demo` succeeds. Specs are written and reviewable; running them is task 11's step.

## Files

- `modules/ai-reporting/api/set-report-visibility.yaml` — create
- `modules/ai-reporting/module.lowdefy.yaml` — modify — `_ref` under `api:` and an `exports.api` entry
- `apps/demo/e2e/ai-reporting/report-visibility.spec.js` — create — the six-cell auth matrix plus the deleted and single-field cases

## Notes

- **`share_roles` unset is not a misconfiguration.** It means the app cannot publish anything new, and it is not retroactive: reports already shared stay listed and readable, and their owners can still unpublish them — which is only possible _because_ unpublish falls back to the owner. A spec for that case belongs here if it is cheap to express (seed a shared report, run with no `share_roles` on the module entry) but the demo entry sets the var, so it may have to wait for a separate demo entry; do not contort the demo config for it.
- **The list's row menu showing Unpublish on a shared report the viewer does not own is a display decision**, and it belongs to `reports-list`. It needs nothing new from `list-reports` — the page already knows the viewer's roles and the configured `share_roles`. Do not add a `can_unpublish` field to any response here; the endpoint is the boundary.
- **Do not add a `share-report` / `unshare-report` pair.** One endpoint, two states, one reversible act — splitting it would make the asymmetry two separate authorization rules instead of one widened check.
