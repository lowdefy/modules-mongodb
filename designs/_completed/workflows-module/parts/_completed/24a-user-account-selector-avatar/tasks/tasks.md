# Implementation Tasks — Part 24a: user-account selector + avatar

## Overview

These tasks implement [`design.md`](../design.md): relocate the shared `user-selector` (and its
options request) from `user-admin` into `user-account`, ship a new `user-multi-selector` and a
new `user-avatar` component in `user-account`, and verify all three in the demo app. Each task
leaves the build clean.

## Tasks

| #   | File                            | Summary                                                                                                                            | Depends On |
| --- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1   | `01-migrate-user-selector.md`   | Move `user-selector` + `get_users_for_selector` request to user-account; rewire both manifests + READMEs; delete user-admin copies | —          |
| 2   | `02-add-user-multi-selector.md` | Add `user-multi-selector` component in user-account (reuses the moved request)                                                     | 1          |
| 3   | `03-add-user-avatar.md`         | Add `user-avatar` component in user-account                                                                                        | —          |
| 4   | `04-demo-verification-pages.md` | Add demo sample pages exercising `user-avatar` and `user-multi-selector`                                                           | 2, 3       |
| 5   | `05-changeset.md`               | Write the changeset documenting the relocation as a breaking change under a minor bump                                             | 1, 2, 3    |

## Ordering Rationale

- **Task 1 is the foundation.** The `get_users_for_selector` request physically moves into
  user-account as part of relocating `user-selector`. Task 2's `user-multi-selector` reuses that
  same request file by relative `_ref`, so it cannot land until the request exists at
  `modules/user-account/requests/get_users_for_selector.yaml`. Hence **2 depends on 1**.
- **Task 3 (`user-avatar`) is independent** — it adds a self-contained component with no request
  dependency. It only shares the `modules/user-account/module.lowdefy.yaml` file with tasks 1 and 2
  (each adds a different `components:` / `exports.components` entry), so it can run in parallel; just
  expect to reconcile additive edits to that one manifest if tasks run concurrently.
- **Task 4 verifies** the new exports in the demo app and therefore depends on the components
  existing (**2 and 3**). The design does not call for a demo page for the single-select
  `user-selector` (it has no in-repo consumer), so task 4 only covers `user-avatar` and
  `user-multi-selector`.
- **Task 5 (changeset)** records the cross-module narrative — including the breaking path change for
  downstream consumers of `user-admin/user-selector` — and is written once everything is in place
  (**1, 2, 3**).

Tasks 1 and 3 can proceed in parallel; 2 follows 1; 4 follows 2 and 3; 5 follows 1, 2, 3.

## Scope

**Source:** `designs/workflows-module/parts/24a-user-account-selector-avatar/design.md`
**Context files considered:** none beyond `design.md` (no other supporting files in the design folder)
**Review files skipped:** `review/review-1.md`
