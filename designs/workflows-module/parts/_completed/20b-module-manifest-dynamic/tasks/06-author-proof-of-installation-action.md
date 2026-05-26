# Task 6: Author `proof-of-installation` instanced action

## Context

`proof-of-installation` is the keyed (instanced) action in the new `onboarding` worked example — `kind: form`, in group `g3` (blocked by `g2`), `key: $device_serial`. Per [action-authoring spec § Instanced actions](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md), `key:` declares a symbolic placeholder; concrete values arrive at workflow-start time via the `actions:` payload on `start-workflow` — one action doc per `(workflow_id, type, key)` triple.

Task 9 builds the lead-view modal that constructs the start payload with two devices; this task authors the action YAML the modal references by `type`.

## Task

Create `apps/demo/modules/workflows/workflow_config/onboarding/proof-of-installation.yaml`:

- `type: proof-of-installation`
- `kind: form`
- `key: $device_serial` (symbolic placeholder).
- `action_group: g3`
- `sort_order: 10`
- `blocked_by: [send-quote]` (won't unblock until the quote stage is `done`; spec § Instanced actions allows non-instanced → instanced refs, which unblock when *all* instances reach terminal status).
- `description: Capture proof of installation for each device.`
- `access.demo: [edit, view]`, `access.roles: [admin]`.
- `form:` block with at least one field — e.g. `text_input` `device_serial` (read-only display of the key) plus `file_upload` `installation_photo`. The `device_serial` field exists in `form` so the user can see which device they're working on; the value is also the key.
- No `hooks:`, no custom `interactions:` (engine defaults — `submit_edit` to `done`).
- `status_map` for `blocked`, `action-required`, `in-progress`, `done`:
  - `blocked.demo.message:` Awaiting quote approval. (no `link:`).
  - `action-required.demo.link.pageId: { _module.pageId: { id: onboarding-proof-of-installation-edit, module: workflows } }`, `urlQuery: { action_id: true }`.
  - `in-progress.demo.link.pageId: { _module.pageId: { id: onboarding-proof-of-installation-view, module: workflows } }`, `urlQuery: { action_id: true }`.
  - `done.demo.message:` Installation verified. (no `link:`).

Per [action-authoring spec lines 337–355](modules-mongodb/designs/workflows-module-concept/action-authoring/spec.md): with `key:`, action identity is `(workflow_id, type, key)`. Form data path is `form_data.{action_type}.{key}.{field}`. `key:` and `tracker:` are mutually exclusive.

## Acceptance Criteria

- File exists and is valid YAML.
- `key:` is set to the symbolic placeholder `$device_serial`.
- `blocked_by: [send-quote]` declared.
- `status_map` covers `blocked`, `action-required`, `in-progress`, `done` at minimum.
- `apps/demo` builds without errors. (The action is not yet referenced from `onboarding.yaml`'s `actions[]` — that's task 8.)
- The build doesn't emit per-action endpoints or pages for this action yet (no `actions[]` entry), but the file itself is valid.

## Files

- `apps/demo/modules/workflows/workflow_config/onboarding/proof-of-installation.yaml` — create.

## Notes

- The `$device_serial` placeholder is purely symbolic — Lowdefy doesn't interpret it. It's a convention from the spec for documenting which payload field carries the concrete key at spawn time.
- This is the only action where `key:` appears. The lead-view modal in task 9 will construct `actions: [{ type: proof-of-installation, key: <serial>, fields: { device_serial: <serial> } }, ...]` per device row.
- The `form:` block's `device_serial` field is intentionally redundant with the `key` — it lets the form display "which device am I working on?" without a separate read of `action.key`.
