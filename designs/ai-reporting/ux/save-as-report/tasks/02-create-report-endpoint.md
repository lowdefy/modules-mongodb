# Task 2: The create-report endpoint

## Context

Report creation currently depends on the agent's `generate-report` tool. This task adds a
**page-callable** endpoint, `create-report`, so the confirm sheet (task 3) can save a report
directly — and can supply the `conversation_id` a tool endpoint cannot (the sheet is a modal on
the chat page and has `_state: conversationId` in hand).

`create-report` is a thin validate-and-insert: it validates the spec exactly as
`generate-report` does (same `validateReportSpec`, same auth guard) and inserts through the
shared `new_report.yaml` fragment from task 1 — differing from `generate-report` only in that
its `conversation_id` comes from the payload instead of being `null`.

## Interfaces

- **Consumes:** `modules/ai-reporting/defaults/new_report.yaml` (task 1) — `_ref` with
  `vars: { validated: { _state: validated }, conversation_id: { _payload: conversation_id } }`.
- **Produces:** endpoint `create-report`, callable as `_module.endpointId: create-report`.
  - **Payload:** `{ spec: { title, description?, sections }, conversation_id }`. The `spec`
    shape matches `generate-report`'s payload (title/description/sections nested under `spec`).
  - **Returns:** `{ ok: true, report_id, url }` where `url` is
    `/{module.id}/report?report_id={insertedId}` — the same return shape `generate-report` uses.

## Task

**Create `modules/ai-reporting/api/create-report.yaml`**, an `Api` mirroring `generate-report.yaml`'s
routine but page-facing:

1. **Payload schema** — `spec` (required object: required `title` string, optional `description`
   string, required `sections` array) plus `conversation_id` (string, nullable — the caller may
   pass a real id or null). Model the `spec` sub-schema on `generate-report.yaml`'s `payloadSchema`.
2. **Auth guard** — reject an unauthenticated caller:
   ```yaml
   - :if:
       _eq:
         - _user: id
         - null
     :then:
       - :reject: You must be signed in to save a report.
   ```
3. **Validate** — `:set_state: { validated: { _analytics.validateReportSpec: { spec: { _payload: spec }, catalog: { _module.var: catalog }, roles: { _user: roles } } } }`, identical to
   `generate-report`. Validation throwing surfaces the validator's actionable message to the
   sheet's `CallAPI` error.
4. **Insert** — one `MongoDBInsertOne` step (`id: insert_report`) on
   `connectionId: { _module.connectionId: reports-store }`, whose `doc:` is a `_ref` to
   `defaults/new_report.yaml` passing `validated: { _state: validated }` and
   `conversation_id: { _payload: conversation_id }`.
5. **Return** — `{ ok: true, report_id: { _step: insert_report.insertedId }, url: <concat> }`,
   copying `generate-report`'s `url` construction verbatim (`"/"`, `_module.id: true`,
   `"/report?report_id="`, `_step: insert_report.insertedId`).

Give the file a header comment stating it is the page-side twin of `generate-report`: same
validation and same stored shape (both via `new_report.yaml`), differing only in that it
records the source `conversation_id`.

**Register and export in `modules/ai-reporting/module.lowdefy.yaml`:**

- Add `- _ref: api/create-report.yaml` to the `api:` list (near `generate-report`).
- Add to `exports.api`:
  ```yaml
  - id: create-report
    description: Validate and persist a report spec from the chat page (records conversation_id)
  ```

## Acceptance Criteria

- `create-report.yaml` exists with auth guard, `validateReportSpec` call, fragment-backed insert,
  and the `{ ok, report_id, url }` return.
- The endpoint is `_ref`'d in `api:` and listed under `exports.api` in the manifest.
- `pnpm ldf:b` from `apps/demo` builds clean and `_module.endpointId: create-report` resolves.
- In `apps/demo/.lowdefy/server/build/api/reporting/**`, the resolved `create-report` insert
  document matches `generate-report`'s except `conversation_id` is bound to the payload, not null.

## Files

- `modules/ai-reporting/api/create-report.yaml` — create — validate-and-insert, conversation_id from payload.
- `modules/ai-reporting/module.lowdefy.yaml` — modify — `api:` `_ref` and `exports.api` entry.

## Notes

- Persist the **validator's output** (`_state: validated.*`), never the payload — the fragment
  from task 1 already enforces this; just pass `validated` through.
- Do not add a `conversation_id` existence check or ObjectId coercion — it is a stored string
  (or null) that the report page reads back; no processing is warranted here.
