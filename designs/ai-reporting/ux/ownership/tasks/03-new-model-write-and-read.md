# Task 3: Write the new report shape, and open `resolve-report` to shared reports

## Context

Task 1 made `validateReportSpec` idempotent and gave sections durable ids. This task changes the two endpoints that write and read a report document so the store actually holds the validator's output.

**Today's insert** (`modules/ai-reporting/api/generate-report.yaml`) already runs the validator into routine state:

```yaml
- :set_state:
    validated:
      _analytics.validateReportSpec:
        spec: { _payload: spec }
        catalog: { _module.var: catalog }
        roles: { _user: roles }
```

…and then throws that away, storing `spec: { _payload: spec }` — the agent's raw payload — plus `title` and `description` read off the payload. The header comment defends raw persistence on the grounds that "the pipeline is stored verbatim, never sanitized". **Both halves of that argument survive this change**: `validateQuery` returns the pipeline array unchanged (`validateChartSpec.js:20-21, 43`), so the validator's output carries every pipeline byte-for-byte, and `AnalyticsPipeline` still revalidates per section per viewer at every resolve. The reasoning was about pipelines and is correct about pipelines; it had simply been extended to the whole spec, and the presentation contract is where the cost landed.

**Today's read** (`modules/ai-reporting/api/resolve-report.yaml`) matches on `_id` **and** `owner.user_id`, so a report is readable only by its author. Opening it to shared reports is what makes publishing mean anything. It also has to compose `{ title, description, sections }` before validating, because `spec` now holds `{ sections }` only while `validateReportSpec` requires a non-empty `spec.title` (`:140-142`) — and both `querySections` (`querySections.js:58`) and `compileReport` (`compileReport.js:424`) call the validator, so both need the composed object.

`create-report` is the fifth writer of this model and is specified in `save-as-report`, not here. It writes the same shape.

## Interfaces

- **Consumes:** `validateReportSpec`'s output from task 1 — `{ title, description?, sections }`, sections carrying durable ids, no `null` or `undefined` at any depth.
- **Produces:**
  - The report document shape every later task reads and writes: `{ _id, owner: { user_id, name }, title, description, spec: { sections }, spec_version: 1, visibility: "private", favourite_of: [], conversation_id, deleted: null, created, updated }`.
  - **The readable-report predicate**, spelled in `resolve-report.yaml` and reused verbatim by task 7's two endpoints: not deleted, and owned by the caller **or** `visibility: "shared"`.
  - `apps/demo/e2e/ai-reporting/helpers.js` — `callEndpoint(page, endpointId, payload)` and `reportDoc({...})`, used by every spec in tasks 4–8 and 11.

## Task

### 1. `modules/ai-reporting/api/generate-report.yaml` — the insert shape

Change the `insert_report` doc to:

```yaml
doc:
  _id:
    _uuid: true
  owner:
    _ref: defaults/owner.yaml
  title:
    _state: validated.title
  description:
    _state: validated.description
  spec:
    sections:
      _state: validated.sections
  spec_version: 1
  visibility: private
  favourite_of: []
  conversation_id: null
  deleted: null
  created:
    _ref: defaults/change_stamp.yaml
  updated:
    _ref: defaults/change_stamp.yaml
```

`title` and `description` come off the **validated** object, not the payload — the validator is what caps the title length and rejects a non-string description, so reading the payload would store a value the validator had already normalized past. `description` resolves to `null` when the spec omitted it, which is exactly why task 1's "null reads as absent" rule exists: the round trip through this document field is the path that produces it.

Rewrite the header comment. It currently says the spec is persisted "raw (the durable contract)". State instead that the document holds `validateReportSpec`'s **output**: section ids and display defaults (`REPORT_LOCALE` / `REPORT_CURRENCY` / `REPORT_DECIMALS`, a multiselect's `match`) freeze at create time rather than being re-applied from current constants on every read, so an app changing its currency default does not retroactively re-denominate reports saved last year. Keep the pipeline half of the existing argument — pipelines are still stored verbatim and still revalidated per viewer at resolve — and keep the note about nested `$`-prefixed keys being allowed from MongoDB 5.0.

`conversation_id: null` and its comment stay exactly as they are: tool endpoints receive only the tool input, so the agent context does not reach them.

### 2. `modules/ai-reporting/api/resolve-report.yaml` — the read

**Add the signed-in guard every other reporting endpoint has**, as the first routine step:

```yaml
- :if:
    _eq:
      - _user: id
      - null
  :then:
    - :reject: You must be signed in to open a report.
```

This is new. Today the endpoint needs no guard because the `owner.user_id` match makes an unauthenticated read match nothing; once the match is opened to `visibility: "shared"`, an unauthenticated caller would read every shared report. "Shared" means _everyone in the app_, and the module's baseline everywhere else — including the catalog's role gate, where an absent `roles` list means "any **authenticated** user" (`validateReportSpec.js:101-106`) — is an authenticated user. See the Notes: the design does not spell this out, and this task resolves it the conservative way.

Then change the `load_report` query to the readable predicate:

```yaml
query:
  _id:
    _payload: urlQuery.report_id
  # A soft-deleted report resolves as not-found (the fallback slot), the same
  # as one that never existed.
  deleted.timestamp:
    $exists: false
  # Readable: yours, or published to the app. The per-section role gate below
  # is untouched and still runs against the VIEWING user, so opening the read
  # does not open the data — a shared report over a role-gated collection
  # resolves with its gated sections failing.
  $or:
    - owner.user_id:
        _user: id
    - visibility: shared
```

Compose the spec at both call sites. `querySections`:

```yaml
- :for: section
  :in:
    _analytics.querySections:
      spec:
        title:
          _step: load_report.title
        description:
          _step: load_report.description
        sections:
          _step: load_report.spec.sections
      roles:
        _user: roles
```

…and the same composed object under `compileReport`'s `spec:`. Keep the existing comment explaining why no `catalog` is passed at resolve. `compileReport` keeps reading `validated.title` (`compileReport.js:454-457`) unchanged.

Return the owner flag so the page can render owner-only actions:

```yaml
- :return:
    is_owner:
      _eq:
        - _step: load_report.owner.user_id
        - _user: id
    blocks:
      _analytics.compileReport: …
```

`report-page` is the consumer of `is_owner`; it is added here because this endpoint is the only party that knows it.

### 3. `apps/demo/e2e/ai-reporting/helpers.js` — the shared spec helpers

Every later spec drives an endpoint with no page, so create the wrapper once here rather than six times:

```js
// Ownership ships no page, so the specs reach the routines the way the client
// does: POST /api/endpoints/{entryId}/{endpointId} with { payload }. The
// session cookie ldf.user() sets lives on the browser context, and page.request
// shares that cookie jar — so the call runs as whoever the test last became.
export async function callEndpoint(page, endpointId, payload) {
  const response = await page.request.post(
    `/api/endpoints/reporting/${endpointId}`,
    {
      data: { payload },
    },
  );
  return {
    status: response.status(),
    body: await response.json().catch(() => null),
  };
}
```

Plus a `reportDoc({ id, title, owner, visibility, favouriteOf, deleted, spec, specVersion })` factory returning a document in the new shape, defaulting `visibility: "private"`, `favourite_of: []`, `spec_version: 1`, `deleted: null`, `conversation_id: null`, and both change stamps — modelled on the existing `reportDoc` in `apps/demo/e2e/ai-reporting/formatted-report.spec.js`, which should be left where it is (that spec is a regression guard for the identity key and is not this task's to move).

Export a `SPEC` fixture with one section of each type, so cascade and section-drop specs downstream have something real to remove from.

### 4. `apps/demo/e2e/ai-reporting/report-resolve-shared.spec.js`

- A report owned by user A with `visibility: "private"` is **not** readable by user B — assert the `Dynamic` fallback ("Report not found") on `/reporting/report?report_id=…`.
- The same report with `visibility: "shared"` **is** readable by user B, and the resolve response carries `is_owner: false` for B and `is_owner: true` for A.
- A **soft-deleted** shared report is not readable by either.

## Acceptance Criteria

- A report inserted by `generate-report` has `spec` containing **only** `sections`, `title` and `description` as document fields, `spec_version: 1`, `visibility: "private"`, `favourite_of: []`, and both change stamps.
- Every section in the stored `spec.sections` carries an `id`, and no stored value is `null` except `description` (when the spec omitted one), `conversation_id` and `deleted`.
- `resolve-report` rejects an unauthenticated call, resolves a shared report for a non-owner, and returns `is_owner` correctly for both.
- `pnpm ldf:b` from `apps/demo` succeeds.
- The specs in `report-resolve-shared.spec.js` are written and reviewable. **Running them needs a live server and a reachable MongoDB** — that is task 11's step, not this one's.

## Files

- `modules/ai-reporting/api/generate-report.yaml` — modify — insert shape, `_state: validated`, rewritten header comment
- `modules/ai-reporting/api/resolve-report.yaml` — modify — signed-in guard, readable predicate, composed spec at both call sites, `is_owner` in the return
- `apps/demo/e2e/ai-reporting/helpers.js` — create — `callEndpoint`, `reportDoc`, `SPEC`
- `apps/demo/e2e/ai-reporting/report-resolve-shared.spec.js` — create — private/shared/deleted read matrix and `is_owner`

## Notes

- **`resolve-report` is `type: InternalApi`, not `Api`.** It is the `Dynamic` block's resolver and is reached by rendering the page, not by a POST to `/api/endpoints/…`. So its spec drives the page; only the `type: Api` endpoints in tasks 4–8 use `callEndpoint`.
- **A known harness gap affects the report page, not this endpoint.** `@lowdefy/server-e2e` omits `urlQuery` where `@lowdefy/server` threads it (documented at length in `formatted-report.spec.js`), so a report page under the e2e server always renders the fallback. That makes the _positive_ assertions here unreliable under e2e until the harness is fixed; mark them `test.fixme` with a pointer to the existing note rather than inventing a workaround, and keep the **negative** assertions (private report not readable by B), which pass either way because the fallback is the expected outcome. Say so in a comment — a fixme with no reason reads as an unfinished test.
- **The signed-in guard on `resolve-report` is not stated in the design.** The design opens the read match to `visibility: "shared"` and says nothing about authentication, because today the owner match makes the question moot. Adding the guard is the conservative reading of "the whole app" and matches every other reporting endpoint, but it is a decision this task is making rather than transcribing — flag it in the PR so it can be reversed cheaply if the intent was genuinely public shared reports.
- **Do not add a `spec_version` read anywhere.** Nothing branches on it yet; it exists so a future compatibility branch or migration has something to key on, and it cannot be backfilled meaningfully later.
