---
title: Modules MongoDB Plugins
module: plugins
type: index
---

# Modules MongoDB Plugins

Custom Lowdefy blocks and actions used by the modules in this repo. The package is a regular Lowdefy plugin — modules declare it under their `plugins:` and consumers register it in their app's `lowdefy.yaml`. You only need to add it yourself if you are wiring blocks or the `FetchRequest` action directly into app YAML outside of a module.

The workflow engine behind the `WorkflowAPI` and `EventsTimeline` connections lives in `@lowdefy/mongodb-workflows-sdk` (`packages/mongodb-workflows-sdk`); this plugin wraps it for Lowdefy apps. Non-Lowdefy services (e.g. Lambda microservices) can consume the SDK directly — see the SDK package's README. Nothing changes for Lowdefy consumers: the connections, request types, and YAML surface are identical.

## Blocks

| Block                                      | Category          | Purpose                                                                                                                                               |
| ------------------------------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ActionSteps](action-steps.md)             | `display`         | Antd `Steps` view of grouped actions — each step is an action group with badged, optionally linked sub-actions and a rolled-up status.                |
| [ContactSelector](contact-selector.md)     | `input-container` | Multi-select contact picker with search, add, edit, remove, and verify flows. Backs the `contacts` module's selector component.                       |
| [DataDescriptions](data-descriptions.md)   | `display`         | Rich, structured Antd `Descriptions` view driven by an explicit `formConfig` with sections, ordering, and component hints.                            |
| [EventsTimeline](events-timeline.md)       | `display`         | Timeline of `log-events` documents — avatars, time-ago labels, action badges, optional file attachments. Backs the `events` module's timeline.        |
| [FileManager](file-manager.md)             | `container`       | Drag-drop S3 upload with thumbnails, paste-to-upload, optional metadata form, download, and delete. Backs the `files` module.                         |
| [SmartDescriptions](smart-descriptions.md) | `display`         | Antd `Descriptions` view with auto type detection from the data — no schema required. Use `DataDescriptions` instead when you need explicit grouping. |

## `FetchRequest` action

Auto-paginates a paginated request and returns the concatenated results. Calls the request repeatedly with `{ skip, pageSize }` set on state at `fetch_request_pagination`, concatenating results until a page comes back smaller than `pageSize`. Useful for pulling every row of a large export without forcing the request itself to know it's being paginated.

### Params

| Param         | Type   | Default | Description                                                                                |
| ------------- | ------ | ------- | ------------------------------------------------------------------------------------------ |
| `requestName` | string | —       | The id of the request to call. Required. Throws if missing.                                |
| `pageSize`    | number | `2000`  | Page size written to `fetch_request_pagination.pageSize` and used to detect the last page. |

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

## Install

`lowdefy.yaml`:

```yaml
plugins:
  - name: "@lowdefy/modules-mongodb-plugins"
    version: ^0.1.0
```

Modules in this repo already declare it; only consumers wiring blocks or `FetchRequest` directly into app YAML need to add it themselves.

## Peer dependencies

The plugin assumes the following peers are already in the app:

- `@lowdefy/block-utils`
- `@lowdefy/blocks-antd`
- `@lowdefy/blocks-basic`
- `@lowdefy/community-plugin-mongodb` (^3)
- `@lowdefy/helpers`
- `@lowdefy/nunjucks`
- `@lowdefy/plugin-aws` (≥ 4)
- `antd` (≥ 6)
- `mongodb` (^6)
- `react` (≥ 18) and `react-dom` (≥ 18)

`@lowdefy/plugin-aws` is required by `FileManager` and by the `file` / `fileList` field types in `DataDescriptions` and `SmartDescriptions`. `mongodb` and `@lowdefy/community-plugin-mongodb` are required by the `WorkflowAPI` connection.
