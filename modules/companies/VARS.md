# Companies — Vars

- **`collection`** — MongoDB collection name. Default: `companies`.
- **`label`** — Singular display label. Default: `Company`.
- **`label_plural`** — Plural display label. Default: `Companies`.
- **`name_field`** — Field used as the display name in selectors and titles. Default: `trading_name`.
- **`id_prefix`** — Prefix for auto-generated consecutive IDs. Default: `C-`.
- **`id_length`** — Numeric length for consecutive IDs (e.g., 4 = `C-0001`). Default: `4`.
- **`contacts_collection`** — MongoDB collection name for contacts (used in `$lookup` for edit page pre-population). Default: `user-contacts`.
- **`event_display`** — Per-app event display templates. Keys are app identifiers, values map event types to Nunjucks title templates. Default: built-in defaults.
- **`components`** — Overrides: `detail_fields`, `form_fields`, `form_attributes`, `table`, `filters`, `main_tiles`, `sidebar_tiles`, `download_columns`.
- **`request_stages`** — Pipeline overrides: `get_all_companies`, `get_company`, `insert_company`, `update_company`, `selector`, `filter_match`.
- **`filter_requests`** — Additional requests for the custom filters section. Default: `[]`.
