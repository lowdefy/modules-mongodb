---
"@lowdefy/modules-mongodb-plugins": minor
"@lowdefy/modules-mongodb-activities": minor
"@lowdefy/modules-mongodb-companies": minor
"@lowdefy/modules-mongodb-contacts": minor
"@lowdefy/modules-mongodb-deals": minor
"@lowdefy/modules-mongodb-events": minor
"@lowdefy/modules-mongodb-notifications": minor
"@lowdefy/modules-mongodb-workflows": minor
---

**Breaking: the `app_name` module var is replaced by Lowdefy's `_app` operator.** Apps now declare their identity once, as `slug:` on the root of `lowdefy.yaml`, and every module reads it directly with `_app: slug` (or `_build.app: slug` inside `_build.*` operator arguments).

Migration for consumers:

- Add `slug: <your-app-slug>` to the root of `lowdefy.yaml` if it isn't there already. It must be kebab-case (`^[a-z][a-z0-9]*(-[a-z0-9]+)*$`) — Lowdefy validates it, and referencing an undeclared slug fails the build.
- Remove the `app_name:` var from every module entry. `activities`, `companies`, `contacts`, `deals`, `notifications`, and `workflows` no longer declare it.
- `events.display_key` is now optional, defaulting to the app's own slug. Drop it unless the app deliberately renders another app's event display strings.
- If a `change_stamp` override baked in an app-attribution literal (`app_name: my-app`), change the value to `{ _app: slug }`. The stamp field keeps the name `app_name`.
- Any shared config file that existed only to hold `app_name` (e.g. an `app_config.yaml`) can be deleted.

No data migration is required — the slug produces the same string the `app_name` var did, and no stored field or key is renamed. `created.app_name` keeps its name on event and notification documents.

Connection schema changes in `@lowdefy/modules-mongodb-plugins`: the `WorkflowAPI` connection property `app_name` is renamed to `slug`, and the `EventsTimeline` connection property `app_name` is renamed to `display_key` (it carries the events module's `display_key`, which may legitimately differ from the slug). Apps wiring these connections directly must rename the property keys.
