# Task 5: `render-table` — the table tool endpoint

## Context

The panel accumulates artefacts from tool results. `render-chart` is the pattern: it validates
the chart spec against the catalog and **acks with the small validated spec rather than the
rows**, because tool results are model context re-sent on every later step and turn; the
`emit-data-parts` onFinish hook then reads the spec out of the hook payload's `toolResults`,
runs the pipeline once at turn end, and emits the dataPart.

A table part needs the same production half, and none of it exists — `emit-data-parts` builds
its parts by filtering the turn's `toolResults` on `toolName`, and there is no table tool to
filter on.

Task 1 added `_analytics.validateTableSpec`, which validates `{ title, query, columns }` and
throws `Invalid table spec: …`.

## Interfaces

- **Consumes:** `_analytics.validateTableSpec` (task 1).
- **Produces:** endpoint `render-table`, returning
  `{ ok: true, title, spec: { title, query, columns } }` — the shape `emit-data-parts` filters
  for on `toolName: render_table` and reads `output.spec` from (task 6), and the shape the agent
  is told about (task 9).

## Task

**Create `modules/reporting/api/render-table.yaml`**, mirroring `modules/reporting/api/render-chart.yaml`
structurally and in its commenting.

Header comment: it validates the table spec against the catalog and acks; tool results are model
context, so it returns only the small validated spec — the `emit-data-parts` onFinish hook runs
the pipeline once at turn end, verifies the declared columns against the actual rows, caps the
rows and emits the table dataPart.

`id: render-table`, `type: Api`.

`description:` — the text the model reads as the tool's description. Say that the table renders
in the results panel beside the chat when the turn completes, and that the presentation contract
is `columns`, an array of `{ key, label?, format? }`, one per column to show, in order, each
`key` naming a column the pipeline outputs.

`payloadSchema:` — `type: object`, `required: [title, query, columns]`:

- `title` — string, the table title shown in the panel;
- `query` — object, `required: [collection, pipeline]`, with the same two property descriptions
  `render-chart` gives (`collection`: catalog-declared base collection the pipeline reads from;
  `pipeline`: read-only MongoDB aggregation pipeline stages). Note in its description that it is
  the same shape as `query_data`;
- `columns` — array, `items: { type: object, required: [key], properties: { key, label, format } }`.
  Describe `key` as the output column to show, `label` as its heading (defaulting to the key),
  and `format` as the optional number-format descriptor `{ style: decimal | currency, currency?,
locale?, decimals? }`.

Routine:

- one `:set_state:` step calling `_analytics.validateTableSpec` with `spec` assembled from the
  payload keys, `catalog: { _module.var: catalog }` and `roles: { _user: roles }`. Carry
  `render-chart`'s comment across: validation throws on an invalid spec so the tool call fails
  with the validator's actionable message, and passing the catalog runs the full pipeline
  grammar/role gate now — validate-before-ack.
- `:return:` `ok: true`, `title` from the payload, and `spec:` rebuilt from the payload keys
  (`title`, `query`, `columns`), exactly as `render-chart` returns its five.

**`modules/reporting/module.lowdefy.yaml`:** add `- _ref: api/render-table.yaml` to `api:`,
beside `render-chart.yaml`. No `exports.api` entry — `render-chart` and `export-data` have none
either; they are the agent's, not a consumer's.

## Acceptance Criteria

- `pnpm --filter @lowdefy/modules-mongodb-plugins build`, then `pnpm ldf:b` from `apps/demo`
  builds and `render-table` appears in the generated `.lowdefy/server/build/` API artefacts.
- A spec with a column key over 200 characters, an empty `columns` array, or an unexpected
  column key is rejected with the validator's message rather than acked.
- A spec whose pipeline touches a collection outside the catalog is rejected at the tool call,
  not at turn end.

## Files

- `modules/reporting/api/render-table.yaml` — create
- `modules/reporting/module.lowdefy.yaml` — modify — the `api:` `_ref`

## Notes

Do **not** return the rows. That is the whole point of the pattern, and `render-chart`'s header
comment is the canonical statement of it.

A report table _section_ calls its user-facing string `label` while this tool calls it `title` —
the same asymmetry `render-chart` already has against a chart section. Leave it; the tool's
`title` is what the panel card shows, and `validateReportSpec` passes `title: label` when it
delegates.
