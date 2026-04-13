# Contacts — Vars

- **`app_name`** (required) — App identifier for `is_user` guard and per-app access flags.
- **`collection`** — MongoDB collection name. Default: `user-contacts`.
- **`label`** — Singular display label. Default: `Contact`.
- **`label_plural`** — Plural display label. Default: `Contacts`.
- **`event_display`** — Per-app event display templates. Default: built-in defaults.
- **`components`** — Overrides: `detail_fields`, `form_fields`, `form_attributes`, `table`, `filters`, `main_tiles`, `sidebar_tiles`, `download_columns`.
- **`request_stages`** — Pipeline overrides: `get_all_contacts`, `get_contact`, `insert_contact`, `update_contact`, `selector`, `filter_match`.
- **`filter_requests`** — Additional requests for the custom filters section. Default: `[]`.
