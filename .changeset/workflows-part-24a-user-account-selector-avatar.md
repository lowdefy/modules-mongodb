---
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-user-admin": minor
---

Workflows Part 24a — relocate `user-selector` to user-account; add `user-multi-selector` and `user-avatar`.

The shared user picker moves from user-admin to user-account, the module every app ships. Two new user-account component exports support assignee workflows: a multi-select picker and a doc-shaped avatar chip.

- `user-account`: gains three component exports — `user-selector` (relocated, single-select), `user-multi-selector` (multi-select, writes an array of user ids), and `user-avatar` (inline avatar + name rendered from a user-contacts doc). The `get_users_for_selector` request moved here and serves both selectors.
- `user-admin`: **breaking** — drops the `user-selector` component export. No in-repo consumer relied on it, but any downstream app that `_ref`'d `{ module: user-admin, component: user-selector }` must switch to `{ module: user-account, component: user-selector }`. user-admin's `dependencies:` is unchanged.
