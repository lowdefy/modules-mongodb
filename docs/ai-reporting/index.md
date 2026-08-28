---
title: AI Chat Reporting
module: ai-reporting
type: index
concepts: [open-query-engine, collections-catalog, presentation-contract]
---

# AI Chat Reporting

Chat to your data and generate saved, navigable reports. The module ships a reporting agent chat surface, an **open query engine** over an app-supplied collections catalog, and report pages compiled server-side from AI-generated report specs.

The agent answers questions by authoring near-arbitrary read-only MongoDB aggregation pipelines — `$lookup`, `$unwind`, array work, window functions, faceting — which a validation layer plus a read-only database principal keep safe. The [collections catalog](reference/catalog.md) — the `catalog` var — is both the agent's knowledge of what it can query (embedded in its instructions at build time) and the allowlist the engine validates every pipeline against, as well as the confidentiality/authorization boundary. The agent can only describe and query what the catalog declares.

Charts, saved reports, and CSV exports ride the same engine: their queries are pipelines paired with an AI-declared [presentation contract](reference/presentation-contract.md).

## Requirements

**A Lowdefy build whose server passes `urlQuery` into page config.** The `report` page is a `Dynamic` block: it resolves each viewer's report through `resolve-report`, which reads the report id as `_payload: urlQuery.report_id`. That only works where the server threads the URL query into `getPageConfig` — it does so on the Vite/Hono line (verified in `0.0.0-experimental-20260814133003` and `0.0.0-experimental-20260822164337`), and not on the current stable `5.5.1`, which calls `getPageConfig(context, { pageId })` with no `urlQuery` at all.

On a build without it, every report page resolves as though no report id had been supplied and renders the not-found fallback. Nothing else degrades: the agent still answers questions, `generate_report` still persists specs, and the reports list still shows them — the saved report simply cannot be opened. Only this page is affected, because `chat` reads its deep-link parameter with the client-side `_url_query` operator, which every build supports.

**MongoDB ≥ 5.0** for the database behind `REPORTING_MONGODB_URI` — see [minimum server version](../shared/secrets.md#minimum-server-version). The reporting-data database is unaffected.

## Dependencies

`ai-reporting` depends on the [`layout`](../layout/index.md) module: every reporting page renders through layout's `page` component, so the module sits in the host app's chrome (sider, menu, profile, notifications) like every other module rather than as bare full-screen pages. The build auto-wires it when a module entry with id `layout` exists; remap with a `dependencies:` entry if yours is named differently. The `chat` page renders full-bleed inside that shell (no title bar or breadcrumb, content padding removed) so its three-column workspace keeps the viewport.

It also requires two plugin packages (pulled in automatically): [`@lowdefy/community-plugin-mongodb`](https://www.npmjs.com/package/@lowdefy/community-plugin-mongodb) and [`@lowdefy/modules-mongodb-plugins`](../plugins/index.md) (the `ReportingData` connection and its `AnalyticsPipeline` request).

## When to use

Add `ai-reporting` to an app whose users need to explore data conversationally and save the results as reusable reports. You supply a declarative `catalog` describing your queryable collections; the module provides the chat surface, the saved-reports list, and the report renderer.

Surfaces exported as pages:

| Page              | Surface                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat`            | Conversational — `AgentChat` with an adjacent charts, tables and downloads panel, and a two-track empty state (ask a question / build a report) taught by the `welcome` var                                                                                                                                                                                                                                             |
| `reports-list`    | Saved reports as a scannable grid — Mine / Shared / Favourites / All scopes, search, sort, a contents preview, visibility, per-row actions, a New report shortcut to the chat, and a link to recovery                                                                                                                                                                                                                   |
| `reports-deleted` | Recovery — [soft-deleted](../shared/soft-delete.md) reports with their delete stamp and one-click restore to private; reached from the reports-list footer                                                                                                                                                                                                                                                              |
| `report`          | Report renderer (`Dynamic` block over `resolve-report`) — a provenance header (who made it, last edited, data-as-of, and the publisher when shared), per-section CSV export on chart and table sections, filters co-located inline above their first bound section, owner-only Continue-in-chat and broken-section recoveries (Fix in chat / Drop this section), and a distinct withheld Alert for role-denied sections |

Reports are created from the chat surface two ways: the agent's `generate_report` tool persists a spec and returns its URL, or the user ticks result cards and confirms a sheet — see [Save as report](how-to/save-as-report.md).

## Quickstart

```yaml
# lowdefy.yaml
modules:
  - id: ai-reporting
    source: "github:lowdefy/modules-mongodb/modules/ai-reporting@v0.35.0"
    vars:
      catalog:
        _ref: modules/ai-reporting/catalog.yaml
```

`catalog` is required — it is the data dictionary the agent reasons over, the allowlist the engine validates against, and the confidentiality/authorization boundary. See [The collections catalog](reference/catalog.md) for its shape and semantics, and [Vars](reference/vars.md) for the optional collection-name and model overrides.

Declaring a collection in the catalog is the act of exposing it. The agent joins across collections directly via declared `relationships`; for a fixed grain (exact counts) or to hide fields, catalog a read-only MongoDB view — see [Reporting over complex data](how-to/complex-data.md).

### Project context for the agent

The catalog describes the _data_. The optional `app_context` var describes the _business_ — it is injected verbatim into the agent's instructions at build time, under an "About this application" heading between the agent's role and the pipeline-authoring rules:

```yaml
vars:
  catalog:
    _ref: modules/ai-reporting/catalog.yaml
  app_context: >
    Acme Freight brokers truckload shipments for shippers and carriers.


    Vocabulary users will type: "loads" mean shipments; "customers" mean
    shippers; "margin" means revenue minus carrier cost.


    Conventions to assume unless the user says otherwise: the fiscal year
    starts in April; a shipment is "open" until it is delivered and invoiced;
    exclude test accounts (`account.is_test: true`).
```

Use it for what the catalog cannot express: what the app is for, domain vocabulary and the synonyms users will actually type, business rules the agent should assume (fiscal year, which statuses count as "open", how "active" is defined), and preferences for how to answer. Keep per-field mechanics — types, enum values, display hints, which array holds the current status — in the catalog, where they sit next to the field they describe.

Omitting the var omits the section; the agent works without it. It is prompt material only, never validation: nothing written here widens what the agent may query, which remains exactly what `catalog` declares.

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

### Protect the pages and endpoints

**Lowdefy pages and API endpoints are public unless the app protects them.** This module's endpoints are not an exception, and `query-data` reaches app data: a catalog entry with no `roles` is readable by any _authenticated_ user, so leaving the app unprotected exposes every role-less cataloged collection to anonymous callers. (`query-data` rejects an unauthenticated caller, but that is a backstop, not a substitute for app-level auth.)

Protect the module's pages and endpoints in the app's `auth` config, for example:

```yaml
auth:
  pages:
    protected: true
  api:
    protected: true
```

Role-gate individual collections with `roles` in the [catalog](reference/catalog.md#roles-semantics) — that is enforced by the engine on every touched collection, including `$lookup` targets.

## Concepts

- [The open query engine](concepts/open-query-engine.md) — the pipeline model, the three default-deny grammars, resource caps, the always-appended row limit, the two-layer security model, and the grain/fan-out risk
- [Implementation walkthrough](concepts/implementation-walkthrough.md) — contributor-facing end-to-end trace: chat message in, rendered output out, with file and line references for each hop
- [Report ownership, visibility and retirement](concepts/ownership.md) — who can see a report and who can change it: `share_roles` and the asymmetric publish gate, what `shared` does and does not promise, per-user favourites, the five list scopes, soft delete and restore

## How-to

- [Bootstrap a catalog from a live database](how-to/bootstrap-catalog.md) — the `lowdefy-reporting-catalog` CLI: running it, credentials, options, and why every drafted entry arrives commented out
- [Reporting over complex data](how-to/complex-data.md) — direct joins via catalog relationships, the grain/fan-out risk, and the optional MongoDB-view pattern for fixed grains and field hiding
- [Save a conversation's results as a report](how-to/save-as-report.md) — tick chart/table/download cards and confirm a pre-filled sheet to keep the discrete results a chat produced; the chart/table/download-only scope and the report ↔ chat link

## Reference

- [The collections catalog](reference/catalog.md) — catalog shape, roles semantics, display hints, the bootstrap workflow, and the view-leak caveat
- [The presentation contract](reference/presentation-contract.md) — chart / KPI / table contracts, number formatting, and the filter-binding limitation
- [Expected indexes](reference/indexes.md) — what the reports and conversations collections need indexing on, and why the default list sort cannot be indexed
- [Vars](reference/vars.md) — all module vars with types, defaults, and descriptions

## Shared idioms

- [Secrets](../shared/secrets.md) — `REPORTING_MONGODB_URI`, `REPORTING_DATA_MONGODB_URI` (the read-only principal), and `AI_GATEWAY_API_KEY`
