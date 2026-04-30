# @lowdefy/modules-mongodb-plugins

Custom Lowdefy blocks and actions used by the [modules-mongodb](../../README.md) module set. The package is a regular Lowdefy plugin — modules in this repo declare it under their `plugins:` and consumers register it in their app's `lowdefy.yaml`.

## What's in the package

### Blocks

| Block | Category | Purpose |
|---|---|---|
| [`ContactSelector`](src/blocks/ContactSelector/README.md) | `input-container` | Multi-select contact picker with search, add, edit, remove, and verify flows. Backs the `contacts` module's selector component. |
| [`DataDescriptions`](src/blocks/DataDescriptions/README.md) | `display` | Rich, structured Antd `Descriptions` view driven by an explicit `formConfig` with sections, ordering, and component hints. |
| [`EventsTimeline`](src/blocks/EventsTimeline/README.md) | `display` | Timeline of `log-events` documents — avatars, time-ago labels, action badges, optional file attachments. Backs the `events` module's timeline. |
| [`FileManager`](src/blocks/FileManager/README.md) | `container` | Drag-drop S3 upload with thumbnails, paste-to-upload, optional metadata form, download, and delete. Backs the `files` module. |
| [`SmartDescriptions`](src/blocks/SmartDescriptions/README.md) | `display` | Antd `Descriptions` view with auto type detection from the data — no schema required. Use `DataDescriptions` instead when you need explicit grouping. |

### Actions

| Action | Purpose |
|---|---|
| `FetchRequest` | Auto-paginate a paginated request and return the concatenated results. See below. |

## Install

`lowdefy.yaml`:

```yaml
plugins:
  - name: "@lowdefy/modules-mongodb-plugins"
    version: ^0.1.0
```

Modules in this repo already declare it; only consumers wiring blocks or `FetchRequest` directly into app YAML need to add it themselves.

### Peer dependencies

The plugin assumes the following peers are already in the app:

- `@lowdefy/block-utils`
- `@lowdefy/blocks-antd`
- `@lowdefy/blocks-basic`
- `@lowdefy/helpers`
- `@lowdefy/nunjucks`
- `@lowdefy/plugin-aws` (≥ 4)
- `antd` (≥ 6)
- `react` (≥ 18) and `react-dom` (≥ 18)

`@lowdefy/plugin-aws` is required by `FileManager` and by the `file` / `fileList` field types in `DataDescriptions` and `SmartDescriptions`.

## `FetchRequest` action

Calls a request repeatedly with `{ skip, pageSize }` set on state at `fetch_request_pagination`, concatenating results until a page comes back smaller than `pageSize`. Useful for pulling every row of a large export without forcing the request itself to know it's being paginated.

### Params

| Param | Type | Default | Description |
|---|---|---|---|
| `requestName` | string | — | The id of the request to call. Required. Throws if missing. |
| `pageSize` | number | `2000` | Page size written to `fetch_request_pagination.pageSize` and used to detect the last page. |

### Contract

The named request must read `skip` and `pageSize` off state at `fetch_request_pagination` (e.g. `_state: fetch_request_pagination.skip` in a `$skip` stage). It must return an array as the first response value. The action stops paging when the latest response has fewer than `pageSize` rows.

### Example

```yaml
events:
  onClick:
    - id: download_all_rows
      type: FetchRequest
      params:
        requestName: get_all_rows
        pageSize: 1000
    - id: write_csv
      type: # ... receives the full concatenated array via _actions: download_all_rows.response
```

The matching request:

```yaml
- id: get_all_rows
  type: MongoDBAggregation
  connectionId: my-collection
  payload:
    skip:
      _state: fetch_request_pagination.skip
    pageSize:
      _state: fetch_request_pagination.pageSize
  properties:
    pipeline:
      - $match: { ... }
      - $skip:
          _payload: skip
      - $limit:
          _payload: pageSize
```

## Per-block README template

Each block under `src/blocks/` has its own `README.md` covering:

1. **Description** — what it does, when to use it.
2. **Usage** — minimal Lowdefy YAML example with required requests, events, and properties.
3. **Properties** — table of every property the block accepts.
4. **Events** — table of every event the block fires (and the payload, where relevant).
5. **Methods** — methods registered via `registerMethod` and callable from `CallMethod` actions (omitted if the block exposes none).
6. **Slots** — content slots the block exposes (omitted if none).
7. **CSS Keys** — hooks for `classNames` / `styles`.
8. **Notes** — gotchas and caveats (omitted if none).

## Building

```sh
pnpm install
pnpm --filter @lowdefy/modules-mongodb-plugins build
```

The build uses SWC (`pnpm build` script) and writes the package to `dist/`. Module entry points are exposed via the `exports` field in `package.json` (`./blocks`, `./actions`, `./metas`, `./types`).

## License

MIT.
