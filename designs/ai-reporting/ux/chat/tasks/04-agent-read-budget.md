# Task 4: The agent's read path gets its own budget and a `display` summary

## Context

`save-conversation` `$set`s the whole `messages` array every turn, and that array carries every
tool result verbatim — including `query_data`'s raw rows. `PIPELINE_RESULT_CAP` bounds the row
_count_ at 1000, but the only bound on total size is `MAX_RESULT_BYTES = 8000000`, an 8 MB
app-memory backstop shared with the download and report paths. Two fat results in one
conversation therefore exceed the 16 MB document ceiling on `messages` alone, and the write
throws inside a hook whose errors `handleAgentChat` only `console.warn`s — the turn vanishes
with nothing shown.

Bounding what gets stored would fix the document and nothing else. Bounding what the tool
_returns_ fixes three things with one number: a tool result is model context, re-sent on every
later step and turn (this is already the codebase's stated principle — `render-chart` returns
the validated spec rather than its rows for exactly this reason, in that file's header); and
nobody reads the raw rows, because `MessageBubble` takes the `toolOutput.display` branch ahead
of every other and renders that markdown behind the collapse.

**The budget cannot come from the payload.** `query-data.yaml`'s header records the deliberate
decision that one endpoint serves three consumers — the agent's `query_data` tool, report filter
re-queries, and panel downloads — with the `AnalyticsPipeline` request as the single security
boundary. That holds for the boundary and stops holding for the budget: the agent authors the
payload, so a payload-supplied budget is one the agent can raise. The distinguishing fact is
which endpoint was called.

`query-data` must be left **completely alone**. `chat.yaml` reads its response as a bare array
straight into `DownloadCsv`, so adding a `display` key to it would break the panel download.

`AnalyticsPipeline` reads its budget at `AnalyticsPipeline.js:133`,
`const maxBytes = connection.maxResultBytes ?? MAX_RESULT_BYTES;`, and destructures its inputs
at `:92-93` (`async function AnalyticsPipeline({ request = {}, connection })`,
`const { query, roles, filters } = request;`). **There is no property schema to extend** —
`AnalyticsPipeline.schema = {}` deliberately, and the header says why: "The pipeline is
validated by validatePipeline, so no property schema is needed." So the budget is one more key
read off `request` beside `query`, `roles` and `filters`.

The alternative was a second `reporting-data-agent` connection with a tighter
`maxResultBytes`, which would need no plugin change at all. It loses because
`connections/reporting-data.yaml`'s own header records that a consumer remapping the connection
"replaces this definition entirely — it must re-bind BOTH the catalog and a read-only
principal": a second connection doubles that hazard and adds a second remappable name to the
manifest's `connections:` list, which can then drift from the first while both are supposed to
reach the same data through the same catalog. A budget is a request-shaped fact anyway.

## Interfaces

- **Produces:**
  - `AnalyticsPipeline` accepts `request.maxResultBytes`, resolved as
    `request.maxResultBytes ?? connection.maxResultBytes ?? MAX_RESULT_BYTES`.
  - endpoint `query-data-tool`, returning `{ display, rows }`.

## Task

**`plugins/.../connections/ReportingData/AnalyticsPipeline/AnalyticsPipeline.js`:**

- add `maxResultBytes` to the `request` destructure;
- change the budget line to `request.maxResultBytes ?? connection.maxResultBytes ?? MAX_RESULT_BYTES`;
- document it in the header's "Request properties" list, with the reason the property exists:
  the two read paths want different numbers — the agent's, whose rows are persisted into the
  conversation document and re-sent as model context, and everything else, where the 8 MB
  connection default is an app-memory backstop for rows nobody re-sends. Note there is no
  schema to declare it in, and why.
- **do not add a schema.** `AnalyticsPipeline.schema = {}` stays.
- extend `AnalyticsPipeline.test.js`: a request-set budget below the result size throws the
  engine's message; a request-set budget above it passes; with none set the connection's value
  still applies; with neither, `MAX_RESULT_BYTES` does.

**Create `modules/ai-reporting/api/query-data-tool.yaml`** — the agent's read path.

Header comment: why this exists as a second endpoint rather than a payload property or a second
connection (the paragraphs above, condensed), and that the security boundary does not move —
both endpoints run the same signed-in guard and the same `AnalyticsPipeline` request against the
same catalog bound at the connection.

Routine:

1. The same signed-in guard `query-data.yaml` opens with, verbatim, including its comment about
   role-less catalog entries assuming there is a user. `:reject: You must be signed in to query data.`
2. `:set_state: started: { _date: now }` — `_date` is a `dynamic` operator and each routine step
   resolves when it runs, so this and the reading after the step are two distinct timestamps.
3. `id: run_query`, `type: AnalyticsPipeline`, `connectionId: { _module.connectionId: reporting-data }`,
   with `query: { _payload: query }`, `roles: { _user: roles }`, and

   ```yaml
   maxResultBytes: 200000
   ```

   Comment the number where it is set: 200 KB sits on the discriminating line rather than at a
   round guess — a typical aggregation row (`{ _id: "Acme", total: 412000, count: 12 }`) is
   under a hundred bytes, so the full 1000-row cap costs well under it, while a
   `$push: "$$ROOT"` dump of wide documents breaks it immediately. Exceeding it throws the
   engine's existing message mid-stream — _"Narrow the query — project fewer fields, or
   aggregate instead of returning raw documents"_ — which is the correct instruction to an
   analytics agent and one it can act on inside the turn. It throws rather than truncating
   deliberately: knowing a remainder means draining the cursor past the budget, and a silently
   shortened aggregation is a wrong answer that looks complete.

   **No `filters` property.** Filter triples are the report re-query path's; the agent authors
   its whole pipeline.

4. `:set_state: finished: { _date: now }`.
5. `:return:` an object with `display` and `rows`:

   ```yaml
   - :return:
       display: …
       rows:
         _step: run_query
   ```

**The `display` string** is the sentence the row cap owes the model, and the repo already
writes it: `compileReport`'s `sectionHeading` heads a capped section "— first 1000 rows"
because "a table silently showing its first 1000 rows reads as the complete answer". Build the
same disclosure here as markdown, carrying three facts:

- the row count — `_array.length: { _step: run_query }`;
- an explicit note that the engine's trailing `$limit` bound it, when the count is
  `>= 1000` (`PIPELINE_RESULT_CAP`) — e.g. `1,000 rows (capped — the engine returns at most the
first 1000; narrow or aggregate for a complete answer)`;
- the duration, from the two timestamps. Use `_mql.expr` with `$subtract` on the pair and
  `$divide` by 1000 for seconds — the repo's server-side arithmetic idiom.

Target the trace line the design specifies: `842 rows · 0.4s`. `MessageBubble` uses the first
80 characters as the `ThoughtChain` item's description and renders the full markdown behind the
collapse, so lead with the count and the duration and put the pipeline detail after.

**`modules/ai-reporting/module.lowdefy.yaml`:**

- add `- _ref: api/query-data-tool.yaml` to `api:` — the manifest lists every endpoint
  explicitly and an unreferenced API file is never loaded;
- **no `exports.api` entry.** It exists for the agent, and a consumer calling it directly would
  be calling the wrong one of the two. Add a comment on the `api:` line saying so.
- in `exports.api`, drop "agent tool" from `query-data`'s description — that consumer moves off
  it. It becomes the report re-query and panel download path only.

## Acceptance Criteria

- `npx jest src/connections` from `plugins/modules-mongodb-plugins` passes, with the four
  budget-precedence cases covered.
- `pnpm --filter @lowdefy/modules-mongodb-plugins build`, then `pnpm ldf:b` from `apps/demo`
  builds, and `query-data-tool` appears in the generated
  `.lowdefy/server/build/` API artefacts.
- `query-data.yaml` is untouched — `git diff` shows no change to it.
- A query exceeding 200 KB through `query-data-tool` throws
  `Query result exceeds the 200000 byte result budget. Narrow the query — …`; the same query
  through `query-data` succeeds.

## Files

- `plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsPipeline/AnalyticsPipeline.js` — modify — the request-set budget
- `plugins/modules-mongodb-plugins/src/connections/ReportingData/AnalyticsPipeline/AnalyticsPipeline.test.js` — modify — budget precedence
- `modules/ai-reporting/api/query-data-tool.yaml` — create
- `modules/ai-reporting/module.lowdefy.yaml` — modify — the `api:` `_ref`, the `query-data`
  description

## Notes

The 200 KB is a new way for a legitimate query to fail: a wide catalog with long text fields
could break it on something a user considers reasonable. That is accepted because the failure
is loud, self-describing and recoverable inside the turn, and because it is one number in one
file. Watch for it in the demo (task 17) before assuming the line is in the right place.

`_payload` of an absent key resolves to `null`, not `undefined`, so do not rely on
destructuring-style defaults anywhere in this routine.

The other read that persists rows — `emit-data-parts`' per-chart query — deliberately does
**not** take this budget. See task 6.
