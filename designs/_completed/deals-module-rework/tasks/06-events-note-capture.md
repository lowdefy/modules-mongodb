# Task 6: Extract the @mention note-capture modal to events

## Context

Workstream B3. Deals' `components/detail/add_note_modal.yaml` is a `TiptapMentionInput` that writes a note as an **events** event (`new-event`) shown via `events-timeline`. Both the write (`new-event`) and read (`events-timeline`) sides already live in events; only the capture UI is deals-local — so the modal belongs in events.

It is **not** a UI-only lift: the modal pulls in app-coupled dependencies that must become seams (host-compatibility obligation):
- `get_mentionable_users` (`add_note_modal.yaml:9-11,106`) — an app-coupled request whose `$match` is built from `_module.var: app_name` (`get_mentionable_users.yaml:14-25`).
- deals context — `get_selected_deal.0.company_id` (`:51`) and an `app_name`-keyed event display (`:37`).

## Task

Add an exported **`note-capture`** (aka `add-note-modal`) component to the **events** module, with:
- a **mention-source seam** — accept the mentionable-users source as a request-id var (or injected options list), so the host supplies its own `get_mentionable_users`;
- **entity/context inputs** — `entity_id`, `company_id`, and the display key, passed by the host;
- the write wired to the module's `new-event`.

Then rewire **deals** to consume `note-capture`, wiring its own `get_mentionable_users` request + deal context, and delete `components/detail/add_note_modal.yaml`.

## Acceptance Criteria

- events exports `note-capture` with the mention-source + context seams (manifest + docs updated).
- In the demo, "Add Note" on a deal still opens the @mention box, resolves mentionable users, and the note appears in the Events timeline.
- deals no longer defines `add_note_modal.yaml`; it `_ref`s the events component.
- `CI=true pnpm ldf:b` green; changesets for events (minor) + deals; `docs:check` green.

## Files

- `modules/events/components/note-capture.yaml` — create.
- `modules/events/module.lowdefy.yaml` — modify — export `note-capture`; note vars.
- `modules/deals/pages/view.yaml` / `components/detail/detail_panel.yaml` — modify — consume `note-capture`.
- `modules/deals/components/detail/add_note_modal.yaml` — delete.
- `.changeset/*.md` — create.

## Notes

Final home (events vs activities) is design open-question #1 — the design leans events (a note persists as an event); proceed with events unless directed otherwise. The `@mention` input is a shared plugin block, so events needs no new plugin dependency. Edits `view.yaml`/`detail_panel.yaml` — coordinate with tasks 4, 5, 7.
