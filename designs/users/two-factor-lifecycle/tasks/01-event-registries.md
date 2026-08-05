# Task 1: Register the two recovery audit events

## Context

Each recovery routine (tasks 3) emits one audit event, and the Activity timeline on the user detail
page reads **two** registries per event type:

- `modules/user-admin/defaults/event_display.yaml` — the Nunjucks **title template**, keyed by type. Each
  template receives `user` (acting admin) and `target` (`{ name, email }`).
- `modules/user-admin/enums/event_types.yaml` — **colour, title label, icon**, keyed by type. This file is
  merged into the timeline through `modules/shared/enums/event_types.yaml` (which already
  `_build.object.assign`s `../user-admin/enums/event_types.yaml`), so new keys reach the timeline with no
  further wiring.

Design Decision 9 requires **both** registries to carry both new events; an earlier draft listed only
`event_display`, which would render the events with no icon or type label.

## Task

Add two event types — `two-factor-reset` and `passkeys-revoked` — to both files, matching the existing
entries' style (the existing eleven types, e.g. `sessions-revoked`).

In `defaults/event_display.yaml`, add title templates in the house voice (compare
`sessions-revoked: "{{ user.profile.name }} signed {{ target.name }} out everywhere"`):

```yaml
two-factor-reset: "{{ user.profile.name }} reset {{ target.name }}'s two-factor authentication"
passkeys-revoked: "{{ user.profile.name }} revoked {{ target.name }}'s passkeys"
```

In `enums/event_types.yaml`, add entries with `color` / `title` / `icon` beside the existing ones (pick
icons consistent with the set — `sessions-revoked` uses `AiOutlineLogout`, `user-suspended` uses
`AiOutlineStop`; a key/security icon such as `AiOutlineSafety` / `AiOutlineKey` suits these). Titles
should read as short labels, e.g. `Two-Factor Reset` and `Passkeys Revoked`.

## Acceptance Criteria

- `two-factor-reset` and `passkeys-revoked` appear in **both** `defaults/event_display.yaml` and
  `enums/event_types.yaml`.
- No manifest or `vars.md` change (Decision 9: `event_display` is a bare `type: object` var with no
  per-type sub-properties, so new keys need no `docs:gen`).
- `pnpm ldf:b` from `apps/demo` still compiles.

## Files

- `modules/user-admin/defaults/event_display.yaml` — modify — add the two title templates.
- `modules/user-admin/enums/event_types.yaml` — modify — add the two `{ color, title, icon }` entries.

## Notes

The wording verb is **reset** / **revoked**, never "disabled" (Global Constraints, Decision 2). Icon
names must be valid react-icons `Ai*` names as used elsewhere in the file — confirm against an existing
entry rather than inventing one.
