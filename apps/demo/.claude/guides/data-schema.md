# Data Schema Design

Conventions for designing MongoDB collections, naming fields, modeling relationships, and choosing query patterns in Lowdefy projects.

## Pattern

Every entity lives in its own MongoDB collection and follows the same structural template: root-level identity fields, nested domain objects, reference arrays for relationships, and audit stamps for traceability. The schema is designed for Lowdefy's data flow where page state maps through `payload` to request pipelines — field names in the database directly become field paths in `_state`, `_payload`, and `_request`.

### Document layers

Every mutable document has these layers:

1. **Identity** — `_id` (UUID or auto-increment), plus entity-specific unique keys (e.g., `lowercase_email`)
2. **Domain data** — nested objects grouping related fields (`profile`, `class`, `address`, `contact`)
3. **References** — arrays of foreign key IDs linking to other collections (`company_ids`, `contact_ids`)
4. **Status** — array of `{ stage, created: change_stamp }` entries, newest first (current = `status[0]`)
5. **Audit** — `created` and `updated` change stamps on every document; `hidden`/`disabled`/`removed` for soft lifecycle
6. **Per-app config** — `apps.{app_name}` for multi-app entities like contacts (roles, invite, access)

### Field naming

**`snake_case` everywhere.** All collection names, field names, enum keys, and reference fields use `snake_case`. Never camelCase in the database. Nested objects use dot notation in queries (`profile.given_name`, `status.0.stage`).

- Singular for single values: `company_id`, `author`, `description`
- Plural `_ids` suffix for reference arrays: `company_ids`, `contact_ids`, `ticket_ids`, `device_ids`
- Boolean flags: `is_user`, `disabled`, `hidden`, `verified`, `removed`, `active`, `archive`
- Computed/derived fields: `lowercase_email` (from `email`), `profile.name` (from `given_name` + `family_name`)

## ID Patterns

**UUID** — default for most entities. Generated with `_uuid: true`. Used for contacts, events, files, notifications, actions.

**Auto-increment with prefix** — for human-readable entities that are referenced in conversation. Uses `MongoDBInsertConsecutiveId`:

| Entity        | Prefix      | Length | Example       |
| ------------- | ----------- | ------ | ------------- |
| Tickets       | `T-{YY}`    | 5      | `T-2600001`   |
| Tasks         | `BH-{YY}`   | 5      | `BH-2600001`  |
| Companies     | `C-`        | 4      | `C-0001`      |
| Products      | `FLA-`      | 5      | `FLA-00001`   |
| Raw materials | `RM-{CAT}-` | 4      | `RM-VEG-0001` |
| Batches       | `B-`        | 7      | `B-0000001`   |

```yaml
type: MongoDBInsertConsecutiveId
properties:
  prefix:
    _nunjucks:
      template: 'T-{{ date | date("YY") }}'
      on:
        date:
          _date: now
  length: 5
  doc:
    # ... document fields
```

## Common Fields

Every mutable entity must have `created` and `updated` change stamps. Most entities also include soft-lifecycle flags:

```yaml
# Required on every entity
created: change_stamp # Set once on insert, guarded with $ifNull or $setOnInsert
updated: change_stamp # Set on every write, unconditionally

# Soft lifecycle (pick what fits)
hidden: Boolean # Excluded from list queries (contacts)
disabled: Boolean # Globally or per-app disabled
removed: null | change_stamp # Soft delete with timestamp (files, companies)
archive: Boolean # Archived/soft-deleted (manufacturers, raw materials)
```

Immutable entities (events, files) have only `created` — no `updated`.

## Status Arrays

Status is **never a single string**. It's an array of `{ stage, created }` entries, prepended so `status[0]` is always current:

```yaml
status:
  - stage: "resolved" # Current (index 0)
    created: change_stamp
  - stage: "in-progress" # Previous
    created: change_stamp
  - stage: "new" # Original
    created: change_stamp
```

**Query current:** `"status.0.stage": "open"`
**Update (prepend):** `$push: { status: { $each: [{ stage, created }], $position: 0 } }`
**Always also set:** `$set: { updated: change_stamp }` alongside the `$push`

Each stage value must match a key in the entity's status enum file (`shared/enums/{entity}_statuses.yaml`).

## Relationship Modeling

**Reference arrays** — the default. Store foreign key IDs as arrays on the document that "owns" the relationship:

```yaml
company_ids: ["C-001", "C-002"] # Contact works for these companies
ticket_ids: ["T-2600001"] # Action linked to these tickets
```

**`$lookup` at read time** — join related data in aggregation pipelines. Always place after `$skip`/`$limit` for performance:

```yaml
- $lookup:
    from: companies
    localField: company_ids
    foreignField: _id
    as: companies
    pipeline:
      - $project:
          trading_name: 1
```

**Denormalization** — duplicate frequently-read fields to avoid lookups. Use for display-only data:

```yaml
author:
  contact_id: "uuid" # The real FK
  name: "Jordan Bell" # Denormalized for display
  email: "jb@co.com" # Denormalized for display
```

**Embedded subdocuments** — for data that belongs to the parent and is always read together:

```yaml
profile: # Always read with the contact
  name: "Jordan Bell"
  given_name: "Jordan"
address: # Always read with the company
  line1: "123 Main St"
```

**Embedded arrays** — for small, bounded collections owned by the parent:

```yaml
linked_documents: # Few items, always read with the lot
  - _id: "uuid"
    name: "Drawing A"
    url: "https://..."
    created: change_stamp
suppliers: # Supplier details for a raw material
  - _id: "SP-00001"
    product_code: "ABC123"
    price: 45.50
```

## When to Use MongoDBAggregation vs MongoDBFindOne

**MongoDBFindOne** — single document by `_id` or unique key. Use for:

- Duplicate checks before insert (`lowercase_email`)
- Reading current state before an update
- Simple detail page fetch (no joins needed)

**MongoDBAggregation** — everything else. Use when you need:

- Full-text search (`$search` with Atlas Search)
- Pagination with total count (`$facet` with `count` + `results` branches)
- Filtering by multiple criteria (`$match` with `$and`/`$or`)
- Joining related collections (`$lookup`)
- Computed/transformed fields (`$addFields`, `$project`)
- Sorting by dynamic field or search relevance

Even simple "get one by ID" queries use `MongoDBAggregation` when the detail page needs `$lookup` joins.

## Connections

Every collection is a `MongoDBCollection` connection with `changeLog` for automatic audit logging:

```yaml
id: {entities}-collection
type: MongoDBCollection
properties:
  collection: {collection_name}
  changeLog:
    collection: log-changes
    meta:
      user:
        _user: true
  databaseUri:
    _secret: MONGODB_URI
  write: true
```

Collection names use **kebab-case or snake_case**: `user-contacts`, `log-events`, `log-changes`.

## Anti-patterns

- **Don't store status as a single string** — use the status array pattern. A string loses all history and breaks duration calculations.
- **Don't `$set` the entire status array** — use `$push` with `$position: 0` to prepend. Setting the array overwrites history.
- **Don't forget `$position: 0`** — without it, `$push` appends to the end, making `status[0]` the oldest instead of newest.
- **Don't store computed fields from user input** — `profile.name` is computed from `given_name + family_name`; `lowercase_email` is derived from `email`. Always recompute on write.
- **Don't use camelCase in the database** — all fields are `snake_case`. Lowdefy state paths and MongoDB dot notation both work cleanly with `snake_case`.
- **Don't store singleton references as arrays unnecessarily** — `company_id` (singular) for tickets (one company per ticket), `company_ids` (array) for contacts (multi-company). Match the cardinality.
- **Don't `$lookup` before `$skip`/`$limit`** — joins are expensive. Paginate first, then enrich the result set.
- **Don't skip `changeLog` on writable connections** — every write should be automatically logged to `log-changes`.

## Reference Files

- `docs/data-design/app-schema-example/_README.yaml` — overview of all schema patterns
- `docs/data-design/app-schema-example/_change_stamp.yaml` — change stamp pattern with examples
- `docs/data-design/app-schema-example/_status_array.yaml` — status array pattern with query examples
- `docs/data-design/app-schema-example/_auto_increment_id.yaml` — auto-increment ID pattern
- `docs/data-design/app-schema-example/_connections.yaml` — connection config patterns
- `docs/data-design/app-schema-example/user_contacts.yaml` — contact/user schema with all fields
- `docs/data-design/app-schema-example/tickets.yaml` — ticket schema with rich description, author denormalization
- `docs/data-design/app-schema-example/companies.yaml` — company schema with address nesting
- `docs/data-design/app-schema-example/actions.yaml` — workflow action schema with status + per-app display
- `docs/data-design/app-schema-example/files.yaml` — immutable file metadata schema
- `docs/data-design/app-schema-example/log_events.yaml` — event schema with per-app display keys

## Template

**New entity schema documentation** (`docs/data-design/app-schema-example/{entity}.yaml`):

```yaml
# ============================================================================
# Collection: {collection_name}
# ID Pattern: {UUID | MongoDBInsertConsecutiveId PREFIX-YY#####}
# changeLog: enabled -> log-changes
# Atlas Search: {enabled on field1, field2 | not configured}
# ============================================================================
# {Description of what this entity represents and why it exists.}
#
# INDEXES: {field1 (unique)}, {field2}, {compound: field3 + field4}
# ============================================================================

schema:
  _id: {UUID | String}
  {domain_field}: {Type}                       # {Purpose}

  {nested_object}:
    {sub_field}: {Type}                        # {Purpose}

  # --- References ---
  {entity}_ids: Array                          # String[] -> {other_collection}._id

  # --- Status history ---
  status:
    - stage: String                            # Enum: {entity}_statuses
      created: change_stamp

  # --- Soft lifecycle ---
  removed: change_stamp                              # for soft deleting data

  # --- Audit ---
  created: change_stamp
  updated: change_stamp

examples:
  - _id: "{example_id}"
    # ... complete example document
```

## Checklist

- [ ] All field names use `snake_case` — no camelCase in the database
- [ ] `_id` pattern chosen: UUID for internal entities, auto-increment for user-facing entities
- [ ] `created` and `updated` change stamps present on every mutable entity
- [ ] `created` guarded with `$ifNull` or `$setOnInsert` on upserts
- [ ] Status stored as array with `{ stage, created }` entries, prepended with `$position: 0`
- [ ] Status enum file exists at `shared/enums/{entity}_statuses.yaml`
- [ ] Reference arrays use plural `_ids` suffix; singular references use singular `_id`
- [ ] Soft lifecycle field chosen: `hidden`, `disabled`, `removed`, or `archive`
- [ ] Connection has `changeLog` with `collection: log-changes`
- [ ] Schema documented in `docs/data-design/` with examples
- [ ] Indexes planned for: unique keys, foreign key arrays, `status.0.stage`, `created.timestamp`
