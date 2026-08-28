---
title: Modules MongoDB Plugins
module: plugins
type: index
---

# Modules MongoDB Plugins

Custom Lowdefy blocks, actions, and connections used by the modules in this repo. The package is a regular Lowdefy plugin — modules declare it under their `plugins:` and consumers register it in their app's `lowdefy.yaml`. You only need to add it yourself if you are wiring blocks, the `FetchRequest` action, or the `AiText` connection directly into app YAML outside of a module.

## Blocks

| Block                                      | Category          | Purpose                                                                                                                                                                            |
| ------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [ActionSteps](action-steps.md)             | `display`         | Antd `Steps` view of grouped actions — each step is an action group with badged, optionally linked sub-actions and a rolled-up status.                                             |
| [ContactSelector](contact-selector.md)     | `input-container` | Multi-select contact picker with search, add, edit, remove, and verify flows. Backs the `contacts` module's selector component.                                                    |
| [DataDescriptions](data-descriptions.md)   | `display`         | Rich, structured Antd `Descriptions` view driven by an explicit `formConfig` with sections, ordering, and component hints.                                                         |
| [EventsTimeline](events-timeline.md)       | `display`         | Timeline of `log-events` documents — avatars, time-ago labels, action badges, optional file attachments. Backs the `events` module's timeline.                                     |
| [FileManager](file-manager.md)             | `container`       | Drag-drop S3 upload with thumbnails, paste-to-upload, optional metadata form, download, and delete. Backs the `files` module.                                                      |
| [FloatingPanel](floating-panel.md)         | `container`       | Intercom-style corner launcher + floating panel over a `pointer-events: none` wrapper — the page stays clickable. Backs the `ai-assistant` module.                                 |
| [SmartDescriptions](smart-descriptions.md) | `display`         | Antd `Descriptions` view with auto type detection from the data — no schema required. Use `DataDescriptions` instead when you need explicit grouping.                              |
| [WorkflowProgress](workflow-progress.md)   | `display`         | Collapsible per-workflow sections of grouped, status-colored action buttons — a presentation variant of `ActionSteps`. Backs the workflows module's `workflow-progress` component. |

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

## `AiText` connection

Small one-shot LLM calls that are not agents, over the Vercel AI Gateway. Lowdefy's agent connections own conversations; a plain "ask a model one question and get a value back" has nowhere else to live in YAML.

```yaml
connections:
  - id: ai_text
    type: AiText
    properties:
      apiKey:
        _secret: AI_GATEWAY_API_KEY
```

### `GenerateChatTitle` request

Names a chat thread from its **first exchange** — the opening question and the reply. An agent's own `generateTitle` sees only the opening message, which behind a welcome screen's suggestion prompts is one of a handful of canned strings; the subject is almost always in the reply. Backs the `ai-assistant` module's `title-thread` endpoint.

Best-effort by design: every failure returns `{ title: null }` so the caller keeps whatever provisional title it already shows — a cosmetic call must never be the reason a thread has no name.

| Property          | Type   | Default             | Description                                                                  |
| ----------------- | ------ | ------------------- | ---------------------------------------------------------------------------- |
| `prompt`          | string | —                   | The user's first message. Required.                                          |
| `reply`           | string | —                   | The assistant's first reply. Required.                                       |
| `context`         | string | —                   | One-line hint, e.g. the record in view.                                      |
| `domain`          | string | —                   | Description of the app, to ground the title vocabulary.                      |
| `model`           | string | `openai/gpt-5-mini` | Gateway model id. Small and fast is the right choice.                        |
| `reasoningEffort` | string | `low`               | Passed to the model provider; this runs on a cosmetic path, latency matters. |

## Reporting analytics

The `ai-reporting` module's query engine ships here. These are documented with the module rather than duplicated:

| Export                       | What it is                                                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ReportingData` connection   | Read-only MongoDB connection carrying the collections catalog — the engine's authorization boundary                                                        |
| `AnalyticsPipeline` request  | The single path from an AI-authored aggregation pipeline to the driver: validate against the catalog and three default-deny grammars, reconstruct, execute |
| `DownloadCsv` action         | Client action turning request rows into a CSV download                                                                                                     |
| `_analytics` server operator | Server-side spec validation and block compilation (`buildDataParts`, `compileReport`, `querySections`)                                                     |

See [AI Chat Reporting](../ai-reporting/index.md), and [the open query engine](../ai-reporting/concepts/open-query-engine.md) for the validation model and caps.

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
