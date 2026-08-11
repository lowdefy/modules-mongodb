# Task 1: `roles_from_catalog` resolves `id` + `description` per entry

## Context

`modules/user-admin/requests/stages/roles_from_catalog.yaml` is the shared
aggregation stage that resolves each held role id (from the member's / invitation's
`appRoles` array) against the app's authored role catalog
(`_build.authConfig.roles`). It runs in `get_all_members.yaml`,
`get_user_detail.yaml`, and (indirectly, via the base stages) the export.

Today it emits only `{ label, orphan }` per entry. This is the root of the design:
three display surfaces cannot show descriptions because the stage never carries
`description`, and the raw-id aliases cannot be dropped because no resolved entry
carries a stable `id`. This task adds both fields and deletes the stale gap note.

The stage also carries a `NOTE (running-engine gap)` (lines 11–15) claiming
`_build.authConfig` is unavailable to module config. That is false — the built
`apps/demo/.lowdefy/server/build/pages/user-admin/view.json` carries the resolved
catalog labels and descriptions, proving the operator resolves. The note must go.

## Interfaces

- **Produces:** each `roles` entry is now
  `{ id: string, label: string, description: string | null, orphan: bool }`.
  - `id` — the raw held role id (`$$rid`), always present. Consumed by task 2
    (`orphan_ids`, orphan option values, access-modal seed) and task 7 (dropping
    the raw-id aliases).
  - `description` — the catalog `description` for the id, or `null` for a role with
    none and for an orphan. Consumed by tasks 3 and 4 (tooltips, search, filter).

## Task

Edit `modules/user-admin/requests/stages/roles_from_catalog.yaml`:

1. **Add `id: "$$rid"`** as the first key of each resolved entry — the raw held id,
   verbatim, unconditionally.
2. **Add `description`** resolved the same way `label` is — a `$let` over the
   catalog `$filter` for the matching `$$hit`, reading `$$hit.description`, wrapped
   `$ifNull: [..., null]` so a role with no description and an orphan both resolve
   to `null`. Reuse the same `hit` lookup shape the existing `label` `$let` uses.
3. **Keep `label` and `orphan` unchanged** — `label` still falls back to `$$rid`
   via `$ifNull: ["$$hit.label", "$$rid"]` (display only; the orphan's real id now
   rides `id`, so this fallback never feeds a written value).
4. **Delete the `NOTE (running-engine gap)` block** (the `# NOTE …` lines through
   `upstream ask 7`).
5. **Update the header comment**: the per-entry shape is now
   `{ id, label, description, orphan }` — describe `id` (the held id) and
   `description` (catalog description or null) alongside the existing `label` /
   `orphan` lines. Do not narrate the change (no "now carries", "used to").

Target shape (from the design's Proposed config):

```yaml
$addFields:
  roles:
    $map:
      input:
        $ifNull:
          - "$appRoles"
          - []
      as: rid
      in:
        id: "$$rid"
        label: # $let over the catalog, unchanged
        description: # the same $let, reading $$hit.description, $ifNull → null
        orphan: # unchanged
```

## Acceptance Criteria

- Each `roles` entry carries `id`, `label`, `description`, `orphan`.
- `id` is `$$rid` (the raw held id), unconditionally present.
- `description` is `null` for a role with no catalog description and for an orphan.
- No `NOTE (running-engine gap)` text remains in the file.
- The header comment describes the `{ id, label, description, orphan }` shape
  without journey framing.
- `pnpm ldf:b` from `apps/demo` succeeds; the built
  `pages/user-admin/view.json` roles entries carry `id` and `description`.

## Files

- `modules/user-admin/requests/stages/roles_from_catalog.yaml` — modify — add `id`
  - `description` to each resolved entry; delete the gap NOTE; update header comment.

## Notes

`description` reaching `null` is intentional and load-bearing: Nunjucks renders a
`null` description as an empty attribute (task 4's tooltip needs no `{% if %}`
guard), and the `filterString` concat (tasks 3, 4) uses `__build.if_none` to fall
back to `""`.
