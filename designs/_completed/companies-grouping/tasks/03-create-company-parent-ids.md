# Task 3: Build-gate `parent_ids` write in `create-company`

## Context

`create-company` (`modules/companies/api/create-company.yaml`) inserts a new company doc using `MongoDBInsertConsecutiveId`. The doc body sets `name`, `description`, the section sub-objects (`contact`, `address`, `registration`, `attributes`), `lowercase_email`, `removed: null`, and `created/updated` change stamps.

When `hierarchy.enabled: true`, the doc body should also set `parent_ids` from the API payload (defaulting to `[]`). When `hierarchy.enabled: false`, the field is **omitted entirely** from the insert — non-hierarchy documents stay byte-identical to today's documents.

For `create-company` specifically, **no cycle check is needed** — a brand-new doc has no descendants, so no parent set can form a cycle.

The build-gating idiom in this file is already established: see the `_build.if` block at `modules/companies/api/create-company.yaml:50-68` that conditionally injects the `apply-write-stages` step. The same pattern applies — but here the gating is on `_module.var: hierarchy.enabled` and what's gated is a single field inside the `doc:` map.

## Task

Modify `modules/companies/api/create-company.yaml`:

1. Inside the `doc:` map (the literal insert body, currently lines ~14–49), add `parent_ids` as a build-gated key. The cleanest pattern is to use `_build.if` at the value level — when `hierarchy.enabled` is true, the value resolves to `_payload: parent_ids` (or `[]` if missing); when false, the entry is omitted from the resulting object.

   Lowdefy's `_build.if` returns one or the other branch at build time. To omit a key entirely when disabled, the cleanest expression is to merge the field in with `_build.object.assign` or to use an inline conditional that produces `{}` when disabled and `{ parent_ids: ... }` when enabled. Suggested shape:

   ```yaml
   doc:
     _build.object.assign:
       - name:
           _payload: name
         description:
           _payload: description
         contact:
           _if_none:
             - _payload: contact
             - {}
         address:
           _if_none:
             - _payload: address
             - {}
         registration:
           _if_none:
             - _payload: registration
             - {}
         attributes:
           _if_none:
             - _payload: attributes
             - {}
         lowercase_email:
           _string.toLowerCase:
             _string.trim:
               _if_none:
                 - _payload: contact.primary_email
                 - ""
         removed: null
         created:
           _ref:
             module: events
             component: change_stamp
         updated:
           _ref:
             module: events
             component: change_stamp
       - _build.if:
           test:
             _module.var: hierarchy.enabled
           then:
             parent_ids:
               _if_none:
                 - _payload: parent_ids
                 - []
           else: {}
   ```

   When `hierarchy.enabled: false`, the second `_build.object.assign` argument resolves to `{}` and is merged with no effect — the resulting doc is identical to today's. When `hierarchy.enabled: true`, `parent_ids` is added with the payload value (or `[]` fallback).

2. Do **not** add a cycle check to `create-company`. (See "Context" — it's not needed for inserts.)

## Acceptance Criteria

- `modules/companies/api/create-company.yaml` reads `_module.var: hierarchy.enabled` to conditionally include `parent_ids` in the inserted doc.
- When `hierarchy.enabled: false`: built API output writes no `parent_ids` key into the doc — verify by inserting a new company with the demo at `hierarchy.enabled: false` (default before task 11) and checking the inserted MongoDB doc has no `parent_ids` field.
- When `hierarchy.enabled: true`: built API output writes `parent_ids: []` (or the payload value if non-empty) into the doc.
- **Verification step**: confirm `_build.object.assign` + `_build.if(then: { parent_ids: ... }, else: {})` produces the right output. The pattern is that `_build.object.assign` merges objects at build time; an `else: {}` branch contributes no keys to the merge result. If this combination doesn't produce a clean omission (e.g. emits `parent_ids: undefined` instead of dropping the key), fall back to wrapping the entire `doc:` block in `_build.if` with two duplicated branches — verbose but unambiguous.
- `pnpm ldf:b:i` builds without errors against the demo app (which sets `hierarchy.enabled: true` after task 11 — until then, it's still `false` and the field stays omitted).
- Manual verification (after task 11 lands): inserting a new company via the demo app's "New Company" button creates a doc with `parent_ids: []` in MongoDB.

## Files

- `modules/companies/api/create-company.yaml` — modify — add build-gated `parent_ids` to the `doc:` block.

## Notes

- **No cycle check, no early return, no skip decoration.** This file gets only the `parent_ids` write addition. The cycle-check infrastructure is `update-company`-only (task 4).
- **`_build.object.assign` precedent.** Look at `modules/companies/components/view_company.yaml` and similar files for established `_build.*` patterns — using `_build.object.assign` to merge a build-conditional fragment into a base object is idiomatic.
- **Edit-form payload.** Task 7 wires the form to send `parent_ids` in the create/update payload. Until then, this file accepts `parent_ids` payloads but no consumer sends one — fine, the `_if_none` fallback handles missing payloads.
