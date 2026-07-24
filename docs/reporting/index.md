---
title: AI Chat Reporting
module: reporting
type: index
concepts: [open-query-engine, collections-catalog, presentation-contract]
---

# AI Chat Reporting

Chat to your data and generate saved, navigable reports. The module ships a reporting agent (chat and one-shot surfaces), an **open query engine** over an app-supplied collections catalog, and report pages compiled server-side from AI-generated report specs.

The agent answers questions by authoring near-arbitrary read-only MongoDB aggregation pipelines — `$lookup`, `$unwind`, array work, window functions, faceting — which a validation layer plus a read-only database principal keep safe. The [collections catalog](reference/catalog.md) — the `catalog` var — is both the agent's knowledge of what it can query (embedded in its instructions at build time) and the allowlist the engine validates every pipeline against, as well as the confidentiality/authorization boundary. The agent can only describe and query what the catalog declares.

Charts, saved reports, and CSV exports ride the same engine: their queries are pipelines paired with an AI-declared [presentation contract](reference/presentation-contract.md).

## Dependencies

None. `reporting` is self-contained — its pages do not wrap in the `layout` module, and it declares no cross-module dependencies. It does require two plugin packages (pulled in automatically): [`@lowdefy/community-plugin-mongodb`](https://www.npmjs.com/package/@lowdefy/community-plugin-mongodb) and [`@lowdefy/modules-mongodb-plugins`](../plugins/index.md) (the `ReportingData` connection and its `AnalyticsPipeline` request).

## When to use

Add `reporting` to an app whose users need to explore data conversationally and save the results as reusable reports. You supply a declarative `catalog` describing your queryable collections; the module provides the chat surface, the one-shot "describe a report, get a URL" surface, the saved-reports list, and the report renderer.

Surfaces exported as pages:

| Page           | Surface                                                              |
| -------------- | -------------------------------------------------------------------- |
| `chat`         | Conversational — `AgentChat` with an adjacent charts/downloads panel |
| `generate`     | One-shot — describe a report, get its URL                            |
| `reports-list` | Saved reports with open and delete                                   |
| `report`       | Report renderer (`Dynamic` block over `resolve-report`)              |

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: reporting
    source: "github:lowdefy/modules-mongodb/modules/reporting@v0.9.2"
    vars:
      catalog:
        _ref: modules/reporting/catalog.yaml
```

`catalog` is required — it is the data dictionary the agent reasons over, the allowlist the engine validates against, and the confidentiality/authorization boundary. See [The collections catalog](reference/catalog.md) for its shape and semantics, and [Vars](reference/vars.md) for the optional collection-name and model overrides.

Declaring a collection in the catalog is the act of exposing it. The agent joins across collections directly via declared `relationships`; for a fixed grain (exact counts) or to hide fields, catalog a read-only MongoDB view — see [Reporting over complex data](how-to/complex-data.md).

### Connections

The module bundles four connections; only two point at data you must supply:

| Connection            | What it is                                                              |
| --------------------- | ----------------------------------------------------------------------- |
| `reports-store`       | MongoDB collection for saved report specs                               |
| `conversations-store` | MongoDB collection for chat conversations                               |
| `reporting-data`      | Read-only `ReportingData` connection over the app's own data            |
| `ai`                  | AI gateway provider connection (the `model` var selects provider/model) |

The `reporting-data` connection must point at a **read-only MongoDB principal** — the engine's second safety layer. See [Secrets → Read-only reporting principal](../shared/secrets.md#read-only-reporting-principal-reporting_data_mongodb_uri) for provisioning.

To reuse an existing gateway connection instead of the bundled one, remap `ai`:

```yaml
connections:
  ai: my-gateway-connection
```

When `ai` is remapped, `AI_GATEWAY_API_KEY` is not needed.

## Concepts

- [The open query engine](concepts/open-query-engine.md) — the pipeline model, the three default-deny grammars, resource caps, the always-appended row limit, the two-layer security model, and the grain/fan-out risk

## How-to

- [Reporting over complex data](how-to/complex-data.md) — direct joins via catalog relationships, the grain/fan-out risk, and the optional MongoDB-view pattern for fixed grains and field hiding

## Reference

- [The collections catalog](reference/catalog.md) — catalog shape, roles semantics, display hints, the bootstrap workflow, and the view-leak caveat
- [The presentation contract](reference/presentation-contract.md) — chart / KPI / table contracts, number formatting, and the filter-binding limitation
- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [Secrets](../shared/secrets.md) — `REPORTING_MONGODB_URI`, `REPORTING_DATA_MONGODB_URI` (the read-only principal), and `AI_GATEWAY_API_KEY`
