# AI Chat Reporting

Chat to your data and generate saved, navigable reports. The module ships a
reporting agent with two entry surfaces — a conversational **chat** page and a
one-shot **generate** page — plus a constrained query engine over an
app-supplied data dictionary, report storage, and a report renderer that
compiles AI-generated report specs to real Lowdefy pages server-side.

The AI never runs uncontrolled queries or emits uncontrolled UI: every path
from natural language to data goes through the `AnalyticsQuery` request
(validate spec against the dictionary → compile a read-only aggregation →
execute), and every report is a validated spec compiled to blocks by trusted
server code.

## Install

```yaml
plugins:
  - name: '@lowdefy/community-plugin-mongodb'
    version: '^3'
  - name: '@lowdefy/modules-mongodb-plugins'
    version: '^0.9.2'

modules:
  - id: reporting
    source: 'github:lowdefy/modules-mongodb/modules/reporting@<ref>'
    vars:
      datasets:
        _ref: reporting-datasets.yaml
```

```bash
# .env
REPORTING_MONGODB_URI=...        # report + conversation storage
REPORTING_DATA_MONGODB_URI=...   # the app data the dictionary describes
ANTHROPIC_API_KEY=...            # or remap the ai connection (below)
```

Apps that already declare an Anthropic connection can remap instead of
supplying the key:

```yaml
modules:
  - id: reporting
    source: ...
    connections:
      ai: my-anthropic-connection
```

## Protect the pages and endpoints

Auth roles are app-level config. Gate the module's surface to your analyst
role (the endpoints also self-guard: writes and reads are `userId`-scoped and
reject unauthenticated calls, and each dataset's `roles` are checked on every
query):

```yaml
auth:
  pages:
    roles:
      analyst:
        - 'reporting/*'
  api:
    roles:
      analyst:
        - 'reporting/*'
```

## The data dictionary

The `datasets` var describes what the AI may query — it feeds the agent's
instructions at build time and is the allowlist every query spec is validated
against. Metadata only; never data.

```yaml
# reporting-datasets.yaml
- id: orders
  label: Orders
  description: Customer orders with totals and status.
  roles: [analyst, admin]        # dataset-level data access gate
  source:
    collection: orders           # on the reporting-data connection
  dimensions:
    - { id: status,    type: string, description: Order status, values: [pending, paid, shipped, cancelled] }
    - { id: region,    type: string, description: Customer region }
    - { id: createdAt, type: date,   description: When the order was placed }
  measures:
    - { id: total, type: number, description: Order total (USD), aggregations: [sum, avg, min, max] }
    - { id: count, type: count,  description: Number of orders }
```

## Pages

| Page | Purpose |
| --- | --- |
| `reporting/chat` | Chat to your data; charts and CSV downloads accumulate in a panel beside the conversation; "turn this into a report" saves one. |
| `reporting/generate` | One-shot: describe the report, the agent builds it headlessly and the app navigates to it. |
| `reporting/reports-list` | Saved reports — open or delete. |
| `reporting/report` | The report renderer (`?reportId=...`) — live filters re-query through the same engine. |

## Vars

| Var | Default | Description |
| --- | --- | --- |
| `datasets` | (required) | The data dictionary. |
| `reports_collection` | `report_layouts` | Collection for saved report specs. |
| `conversations_collection` | `conversations` | Collection for conversations. |
| `model` | `claude-sonnet-4-5` | Model id for the reporting assistant. |

## Notes

- The module requires a Lowdefy version with module-level `agents:` support
  and the Dynamic block.
- Reports are per-user in v1. Sharing, admin-published reports, and report
  editing are future phases.
- The `reporting-data` connection is read-only by construction and cannot be
  remapped — datasets choose collections per request, so the app supplies the
  URI secret instead.
