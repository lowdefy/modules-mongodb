# Task 11: Delete `apps/demo/app_config.yaml`

## Context

`apps/demo/app_config.yaml` exists solely to enforce single-source-of-truth for `app_name` across the demo's six per-module vars files. Once tasks 3–9 land, no file references it: every reader has been migrated to `_app: slug` or `_app: name`.

The design's decision (`Delete app_config.yaml rather than keep it for future shared config`) is to remove the file entirely. Keeping it empty invites the same drift problem it originally prevented — consumers and modules start stuffing values in, implicit cross-module coupling reappears. If genuinely shared non-slug config surfaces later, add it back then.

## Task

1. Search the repo for any remaining references to `app_config.yaml`:

    ```bash
    grep -rln "app_config.yaml" apps/ modules/ docs/ README.md CLAUDE.md
    ```

    Expect zero results from `apps/demo/modules/*/vars.yaml` (tasks 3–9 removed them).

2. If any references remain, stop and migrate them — do not delete the file while a consumer is still reading it.

3. Delete `apps/demo/app_config.yaml`.

## Acceptance Criteria

- `apps/demo/app_config.yaml` no longer exists.
- `grep -r "app_config.yaml" apps/ modules/ docs/ README.md CLAUDE.md` returns no results.
- `pnpm ldf:b` succeeds — no `_ref` resolution errors for the deleted file.
- The demo app runs end-to-end (home page, contacts, companies, notifications, user-account, user-admin, workflows) with no broken pages or requests.

## Files

- `apps/demo/app_config.yaml` — delete.

## Notes

- This task is the gate between the per-module migrations and the final docs sweep. Run it only after every per-module task (3–9) has been merged or staged in the same PR.
