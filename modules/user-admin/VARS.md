# User Admin — Vars

- **`app_name`** (required) — App name for MongoDB field paths (e.g., `prp-team`).
- **`roles`** (required) — List of available user roles `[{label, value}]`.
- **`app_title`** — Optional display prefix (e.g., `Team`). When set: "Team User Admin", "Invite Team User". When not set: "User Admin", "Invite User".
- **`event_display`** — Per-app event display templates. Keys are app identifiers, values map event types to Nunjucks title templates. Templates receive `user` (current) and `target` (edited/invited user). Default: built-in defaults.
- **`app_domain`** — App domain URL for invite links. Default: current origin.
- **`components`** — Overrides: `profile_fields`, `profile_set_fields`, `global_attributes_fields`, `app_attributes_fields`, `table_columns`, `download_columns`, `filters`.
- **`request_stages`** — MongoDB pipeline stage overrides: `get_all_users`, `invite_user`, `update_user`, `filter_match`.
- **`filter_requests`** — Additional requests for the custom filters section. Default: `[]`.
