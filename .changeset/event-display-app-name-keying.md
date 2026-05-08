---
"@lowdefy/modules-mongodb-contacts": minor
"@lowdefy/modules-mongodb-user-admin": minor
"@lowdefy/modules-mongodb-user-account": minor
"@lowdefy/modules-mongodb-companies": minor
---

Change `event_display` defaulting and override semantics across all event-emitting modules. The default (no override) now renders titles under the consumer's `app_name` instead of a literal `default` key, and an override fully replaces the defaults instead of merging with them.

**Behavior changes (potentially breaking for consumers):**

- **Override fully replaces, no merge.** Whatever you write under `event_display` is exactly what's stored on the event document. Consumers that previously relied on partial overrides being merged with the module's defaults must now list every app and event type they want rendered.
- **Defaults file shape changed.** `modules/{name}/defaults/event_display.yaml` is now a flat `{ event-type: template }` map. The previous top-level `default:` wrapper is gone — the build wraps the flat map under the consumer's `app_name` var. Consumers that `_ref` the defaults file directly will see the new shape.
- **`companies` now requires `app_name`.** Every event-emitting module declares its app context the same way contacts/user-admin/user-account already did. Companies consumers must add `app_name` to their module vars (typically wired from `app_config.yaml`).

**Migration:**

- If you didn't override `event_display`, no action needed beyond setting `app_name` on companies.
- If you overrode `event_display`, list every app and event type you want stored — defaults no longer fill the gaps. The override shape stays `{ [app_name]: { [event-type]: template } }`.

See `docs/idioms.md#event-display` for the updated reference.
