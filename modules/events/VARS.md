# Events — Vars

- **`display_key`** (required) — App identifier for display objects. Events store per-app display titles keyed by app name — this var selects which to render. Must not contain dots.
- **`collection`** — MongoDB collection name. Default: `log-events`.
- **`change_stamp`** — Audit metadata template resolved at runtime. Contains runtime operators (`_user`, `_date`) that evaluate per-request. Default: `{ timestamp: { _date: now }, user: { name: { _user: profile.name }, id: { _user: id } } }`.
- **`event_types`** — Additional event type display metadata. Merged with built-in types. Keys are type strings, values have `color`, `title`, `icon`. Default: `{}`.
