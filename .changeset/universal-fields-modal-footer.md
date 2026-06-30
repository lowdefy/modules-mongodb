---
"@lowdefy/modules-mongodb-workflows": patch
---

Rework the universal-fields edit modal to use the antd Modal's native footer (Part 56 addendum). The modal's `Ok` (`okText: Update`) now drives the update via `onOk`, replacing the `footer: false` in-body Update button and its manual self-close — the block auto-closes on success, keeps the dialog open with the error shown when an action returns `success:false`, and shows a loading spinner while the async CallAPI runs. The shared Validate→CallAPI→`on_complete` sequence is extracted into a new `update_fields_actions.yaml` fragment so the modal footer and the in-context check surface's in-body button (gated by a new `show_update_button` var on `universal-fields.yaml`) run identical logic. The display group's assignees now render as an overlapping `Avatar.Group` instead of a `List` (which bound to state at its own id and rendered zero items).
