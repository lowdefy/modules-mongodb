# Review 1 — Correctness and Completeness

## Pipeline Semantics

### 1. `$mergeObjects` and `profile.name` in the same `$set` stage produce stale computed values

> **Resolved.** Split API write example into two `$set` stages: stage 1 merges data objects, stage 2 computes derived fields like `profile.name` from the merged result.

The API write example (design lines 298-310) sets both `profile` (whole-object via `$mergeObjects`) and `profile.name` (dot-notation via `$concat`) in a single `$set` stage:

```yaml
$set:
  profile:
    $mergeObjects:
      - $ifNull: ["$$ROOT.profile", {}]
      - _payload: profile
  profile.name:
    $concat:
      - $trim: { input: "$profile.given_name" }
      - " "
      - $trim: { input: "$profile.family_name" }
```

In a MongoDB update pipeline, expressions within a single `$set` stage evaluate against the **input document**, not intermediate results from the same stage. `$profile.given_name` references the document's existing `profile.given_name`, not the merged value from the payload. When a user changes their name, `profile.name` is computed from the **old** values.

For invites (upsert, no existing document), `$profile.given_name` is null, so `profile.name` would be an empty string or error.

**Fix:** Split into two pipeline stages:

```yaml
# Stage 1: Merge data objects
- $set:
    profile:
      $mergeObjects:
        - $ifNull: ["$$ROOT.profile", {}]
        - _payload: profile
    global_attributes: ...
    app_attributes: ...

# Stage 2: Compute derived fields (sees merged profile)
- $set:
    profile.name:
      $concat:
        - $trim: { input: "$profile.given_name" }
        - " "
        - $trim: { input: "$profile.family_name" }
```

Note: the current code (`update-user.yaml:24-35`, `invite-user.yaml:45-56`) avoids this by computing `profile.name` from `_payload` values using Lowdefy operators, which resolve before the MongoDB query is sent. The switch to MongoDB `$concat`/`$trim` operators is what introduces the ordering dependency.

### 2. `profile` whole-object and `profile.name` dot-notation in the same `$set` — conflict resolution

> **Resolved.** Same fix as #1 — separate stages eliminate the parent/child path conflict entirely.

Even with the evaluation fix above, setting both `profile` (whole object) and `profile.name` (subfield) in a single `$set` stage creates an assignment conflict. MongoDB's behavior with conflicting parent/child field paths in a single `$set` is not well-documented and varies by version. Some versions error, others silently resolve in field order.

**Fix:** Same as above — separate stages avoid the conflict entirely.

## Var Interface

### 3. `show_title` var path inconsistency

> **Resolved.** Updated code references to `_module.var: profile.show_title` to match the nested consumer vars structure. Grouping `show_title` under `profile` is the intended direction. Migrating the existing module manifests to the nested var is a separate cleanup step during implementation.

The consumer vars example (design line 59) nests `show_title` under `profile`:

```yaml
profile:
  show_title: true
  fields: ...
```

But `form_profile.yaml` (design line 170) references it as a top-level var:

```yaml
_module.var: show_title
```

This is `_module.var: show_title` (top-level), not `_module.var: profile.show_title` (nested). One of these is wrong. Given that `show_title` is currently a top-level var in all three modules (`user-admin/module.lowdefy.yaml:28`, `contacts/module.lowdefy.yaml`, `user-account/module.lowdefy.yaml`), keeping it top-level is simpler.

**Fix:** Either move `show_title` out of the `profile` group in the consumer vars example, or change the code reference to `_module.var: profile.show_title`.

### 4. Relationship between `extra_update_stages` and existing `request_stages` is undefined

> **Resolved.** `extra_update_stages` was a hallucinated rename. Replaced with `request_stages.write` — a single shared write stage that consolidates the existing per-operation `request_stages.update_user` / `request_stages.invite_user` vars. Field definitions moved into a `fields` namespace (`fields.profile`, `fields.global_attributes`, `fields.app_attributes`, `fields.show_title`). Read-side `request_stages` sub-vars (`filter_match`, `get_all_users`, etc.) are unchanged and out of scope.

The design introduces `extra_update_stages` (line 81) as a new var for consumer pipeline stages. But all three modules already have `request_stages.update_user` and `request_stages.invite_user` vars that serve the same purpose (`user-admin/module.lowdefy.yaml:59-73`).

The "What this replaces" table (lines 73-83) does not mention `request_stages`. Questions left open:

- Does `extra_update_stages` replace both `request_stages.update_user` and `request_stages.invite_user`?
- Do the other `request_stages` sub-vars (`filter_match`, `get_all_users`) survive?
- Is one `extra_update_stages` var shared across update and invite flows, or should there be separate vars?

**Fix:** Add `request_stages.update_user` and `request_stages.invite_user` to the "What this replaces" table, or explicitly state they coexist with `extra_update_stages`.

## Coverage Gaps

### 5. Invite and create flows not shown

> **Resolved.** Added note in API write section that `$mergeObjects` + `$ifNull` pattern handles invite/create (no existing document → `$ifNull` falls back to `{}`). No separate example needed.

The design only shows the update API pattern (design lines 286-341). But user-admin's `invite-user.yaml` (`modules/user-admin/api/invite-user.yaml`) and contacts' `create-contact.yaml` (`modules/contacts/api/create-contact.yaml`) are structurally different from update:

- **Invite** uses upsert with `$ifNull` guards for insert-vs-existing logic (invite-user.yaml:20-131)
- **Create-contact** has duplicate detection by email before insert (create-contact.yaml:4-16)

Both flows write profile fields and need the flat namespace treatment. The invite flow is particularly important because the `$mergeObjects` approach interacts differently with `$ifNull`-guarded upserts (the "existing document" may not exist).

**Fix:** Add a brief example or note covering the invite/create pattern — specifically how `$mergeObjects` with `$ifNull: ["$$ROOT.profile", {}]` handles the upsert case (which it does correctly, since `$ifNull` falls back to `{}`).

### 6. Cross-module sharing claim is overstated

> **Rejected.** The problem framing is accurate enough. Two of three modules sharing doesn't invalidate the point — the divergent prefix still forces duplication for user-admin.

The problem statement (design line 7) says "the same field definitions can't be shared across modules without duplication." In practice, user-account and contacts **already share** the `contact.*` prefix. The demo app confirms this:

- `apps/demo/modules/shared/profile/form_fields.yaml` uses `contact.profile.*` IDs
- Referenced by both user-account and contacts vars

The actual sharing problem is specifically between **user-admin** (`user.*` prefix) and the other two modules. The demo app has a separate `apps/demo/modules/user-admin/components/profile_fields.yaml` with `user.profile.*` IDs — identical content, different prefix.

This doesn't change the solution (flat namespace still eliminates the duplication), but the problem framing should acknowledge that two of the three modules already share successfully. The duplication is user-admin vs. the others, not "all modules can't share."

## Minor

### 7. SmartDescriptions blocks a large portion of the value

> **Rejected.** Nothing has shipped yet — no existing consumers to protect. The dependency is already noted in the design. No transition shim needed.

The design correctly notes the SmartDescriptions dependency (line 406), but the view page changes represent roughly half the design's value proposition — eliminating `profile_view_config` and `attributes_view_config` vars. If SmartDescriptions is delayed, the form and API changes can ship but consumers would still need the view config vars until SmartDescriptions lands.

Consider keeping the view config vars in the module manifest (with defaults) during the transition, rather than removing them immediately. This decouples the form/API migration from the SmartDescriptions timeline.
