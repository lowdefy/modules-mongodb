---
title: AI Chat Reporting
module: reporting
type: index
concepts: [data-dictionary, reporting-agent, report-specs]
---

# AI Chat Reporting

Chat to your data and generate saved, navigable reports. The module ships a reporting agent (chat and one-shot surfaces), a constrained query engine over an app-supplied data dictionary, and report pages compiled server-side from AI-generated report specs.

The data dictionary — the `datasets` var — is both the agent's knowledge of what it can query (embedded in its instructions at build time) and the allowlist the query engine validates every generated spec against. The agent can only describe and query what the dictionary declares.

## Dependencies

None. `reporting` is self-contained — its pages do not wrap in the `layout` module, and it declares no cross-module dependencies. It does require two plugin packages (pulled in automatically): [`@lowdefy/community-plugin-mongodb`](https://www.npmjs.com/package/@lowdefy/community-plugin-mongodb) and [`@lowdefy/modules-mongodb-plugins`](../plugins/index.md) (the `ReportingData` connection and `_analytics` operators).

## When to use

Add `reporting` to an app whose users need to explore data conversationally and save the results as reusable reports. You supply a declarative `datasets` dictionary describing your queryable collections; the module provides the chat surface, the one-shot "describe a report, get a URL" surface, the saved-reports list, and the report renderer.

Surfaces exported as pages:

| Page          | Surface                                                          |
| ------------- | --------------------------------------------------------------- |
| `chat`        | Conversational — `AgentChat` with an adjacent charts/downloads panel |
| `generate`    | One-shot — describe a report, get its URL                       |
| `reports-list`| Saved reports with open and delete                              |
| `report`      | Report renderer (`Dynamic` block over `resolve-report`)         |

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: reporting
    source: "github:lowdefy/modules-mongodb/modules/reporting@v0.9.2"
    vars:
      datasets:
        _ref: modules/reporting/datasets.yaml
```

`datasets` is required — it is the data dictionary the agent reasons over and the query engine validates against. See [Vars](reference/vars.md) for the optional collection-name and model overrides.

### Connections

The module bundles four connections; only two point at data you must supply:

| Connection            | What it is                                                      |
| --------------------- | -------------------------------------------------------------- |
| `reports-store`       | MongoDB collection for saved report specs                      |
| `conversations-store` | MongoDB collection for chat conversations                      |
| `reporting-data`      | Read-only `ReportingData` connection over the app's own data   |
| `ai`                  | Anthropic provider connection                                  |

To reuse an existing provider connection instead of the bundled one, remap `ai`:

```yaml
    connections:
      ai: my-anthropic-connection
```

When `ai` is remapped, `ANTHROPIC_API_KEY` is not needed.

## Reference

- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [Secrets](../shared/secrets.md) — `REPORTING_MONGODB_URI`, `REPORTING_DATA_MONGODB_URI`, and `ANTHROPIC_API_KEY`
