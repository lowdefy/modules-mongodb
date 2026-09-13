# Review 2

Second pass, after the first round of resolutions. The platform-behaviour
section and the packaging answer hold up under re-verification and are not
re-raised. The findings below are concentrated in the material added during
resolve — the envelope, the Verification section, and the readable-predicate
extraction — which is the part that has never had a cold read.

### 1. `payloadSchema` is not enforced at runtime, so the scope narrowing is cosmetic

> **Resolved.** Confirmed: `payloadSchema` appears only as a type definition
> (`lowdefySchema.js:2251`), a build-time presence check (`buildMcp.js:112`) and
> the agent-tool equivalent (`buildAgents.js:151`) — nothing validates a payload
> against it, and the MCP handler passes `args` straight to `callEndpoint`. The
> design now carries a dedicated rule: **`payloadSchema` is advertisory, every
> guard lives in the routine.** The `deleted` narrowing moves into the sibling's
> routine guard, which is now stated as the actual reason a sibling is needed
> rather than an annotation.

The endpoint-work section narrows the MCP schema to `[mine, shared, favourites,
all]`, leaving `deleted` off, and treats that as the control that stops an
external agent enumerating soft-deleted reports.

It isn't a control. `payloadSchema` occurs in exactly three places in
`@lowdefy/api` + `@lowdefy/build`: the schema type definition
(`lowdefySchema.js:2251`), a build-time **presence** check
(`buildMcp.js:112`), and the equivalent for agent tools
(`buildAgents.js:151`). Nothing validates a payload against it at call time.
The MCP call handler passes arguments straight through —
`callEndpoint(context, { blockId: '_mcp', endpointId, pageId: '_mcp', payload: args ?? {} })`
in `createMcpServer.js` — and `handleValidateSchema.js` is an opt-in routine
_step_ that takes its own `schema` and `data` properties, not automatic payload
validation.

So `payloadSchema` is **advertisory**: it tells an MCP client what to send. A
caller holding a valid token can send anything, including `scope: "deleted"`,
and `list-reports`' own guard (`list-reports.yaml:34-44`) permits `deleted`.
The narrowing would stop a well-behaved agent and nothing else.

This matters beyond the one enum, because the design leans on the schema in
three places (the scope enum, the filter argument shape, "clients know exactly
what arguments to pass"). All of them are ergonomics; none is enforcement.

**Proposed fix:** enforce the narrowing in the routine — the MCP sibling's own
guard rejects `deleted` — and state plainly, once, that `payloadSchema` is
documentation for the caller and every payload assumption must be guarded in
the routine. Note this _strengthens_ the argument for a dedicated sibling
rather than annotating `list-reports`: the sibling needs a different guard, not
just a different schema.

### 2. The demo consumer as specified would fail the build

> **Resolved — and the review's cost estimate was wrong.** Checked an existing
> production app that ships an `mcp` block: its `oauthProvider` is
> `{ consentPage, dynamicClientRegistration: false }`. The schema requires
> exactly one field (`consentPage`); DCR is optional and off by default; JWKS and
> resource binding are engine routes, not app config. So "the demo becomes its
> own OAuth authorization server" overstated three of four particulars — the
> author writes one line.
>
> The one real cost is the consent page itself (~680 lines across six files in
> that app), and chasing it showed the work belongs elsewhere entirely: a consent
> page is a prerequisite for _any_ MCP tool in _any_ app on these modules, in the
> same category as the login page — which `user-account` already owns. Author's
> call: **this design declares the dependency and does not carry the work**; the
> consent page gets its own design under `user-account`.
>
> Consequence recorded in a new **consent-page dependency** section: the demo
> `mcp` block lands only once that page exists, so the endpoints ship e2e-verified
> with no demo `mcp` block — a stated exception to the demo-consumer rule, on the
> grounds that the demo can host the config but can never be the consumer.

The Verification section says the demo contribution is "the `mcp` block itself
in `apps/demo/lowdefy.yaml`… which makes the config a build-verified reference
an app author can copy."

That block cannot build. `buildMcp.js` throws for any exposed endpoint that is
not `auth.public === true` when `auth.oauthProvider` is absent:

> MCP endpoint "…" is protected or role-gated, but "auth.oauthProvider" is not
> configured.

`apps/demo/lowdefy.yaml`'s `auth` block (from line 37) is an MDB adapter with
email/invite providers and authPages — there is no `oauthProvider`. And all
three endpoints reject unauthenticated callers by design, so none of them is
public.

So the demo consumer requires the demo app to become **its own OAuth
authorization server** — consent page, dynamic client registration, JWKS. The
design already lists standing that up under _Cost of adoption_, framed as a
consuming-app concern, while _Verification_ treats the demo block as a free
by-product. Those two sections contradict each other.

**Proposed fix:** move the demo `mcp` block explicitly behind the version bump
_and_ an `auth.oauthProvider` in the demo, and price it there rather than in
Verification. If that is too much for a demo, say so and let the e2e specs be
the whole demo contribution — but then the design must acknowledge it is
shipping module capability with no demo `mcp` block, against CLAUDE.md's rule,
and say why that is the right call here.

### 3. Date filter values cannot cross the MCP wire as plain JSON

> **Resolved.** Confirmed the mechanism: `callEndpoint` runs
> `serializer.deserialize(payload)` and Lowdefy encodes Dates as `{"~d": …}`
> (`serializer.js:46,50,198-199`), so a plain ISO string stays a string and a
> `$match` against a BSON date matches nothing silently. The binder now coerces
> ISO-8601 strings to `Date` for `daterange` controls, the schema declares
> `format: date`, and an e2e case asserts a date-filtered section matches what a
> UI-driven filter returns. Emitting `{"~d": …}` from the client was rejected —
> it leaks an internal wire format into a public tool schema.

`callEndpoint` deserializes the payload before the routine sees it:
`payload: serializer.deserialize(payload)`. Lowdefy's serializer represents
Dates as `{"~d": "<ISO>"}` or `{"~d": <epoch ms>}`
(`@lowdefy/helpers` `serializer.js:46,50` writing, `198-199` reading).

An MCP client is handed a JSON Schema and will send `"2026-01-01"` — a plain
string, which deserializes to a plain string. The `daterange` control emits
`gte`/`lte` triples whose values land in a MongoDB `$match` against a BSON
date field. A string compared to a date **matches nothing, silently**: no
error, no rejection, just an empty result the agent reports as "no data in that
range."

The design's filter section covers the binder's control→op mapping and never
mentions value types, so an implementer following it will produce exactly this
bug.

**Proposed fix:** the server-side binder coerces ISO-8601 strings to `Date` for
`daterange` controls (and states what it does for the other controls), the
`payloadSchema` documents ISO strings with `format: date`, and an e2e case
asserts a date-filtered section returns the rows a UI-driven filter would.
Requiring callers to emit `{"~d": …}` is the alternative and a bad public
contract — no agent will reliably produce it.

### 4. The readable-predicate extraction is built on a miscount and the wrong mechanism

> **Resolved.** All three corrections applied. The predicate is a **fragment**
> spliced inside larger `$match` objects, so the mechanism is a `_ref` returning
> the `$or` value — not a file under `api/stages/` referenced as a stage. The
> count is **five copies across four files** today (`duplicate-report`,
> `list-reports` ×2, `resolve-report`, `set-report-favourite`), making seven
> after the MCP endpoints — so the cleanup is larger and more valuable than the
> design claimed. The `mine` and `deleted` branches deliberately omit the
> predicate and keep omitting it. Correct line cites recorded.

The reuse section says four inline copies exist and decides to "extract the
readable-scope match into a shared stage under
`modules/ai-reporting/api/stages/` and have all four endpoints `_ref` it."

Three things are off, and the first two make the decision unimplementable as
written:

- **It is a fragment, not a stage.** The predicate is
  `$or: [{owner.user_id: _user.id}, {visibility: shared}]`, spliced _inside_
  larger `$match` objects that add different sibling conditions —
  `favourite_of` plus `deleted.timestamp: {$exists: false}` in the favourites
  branch, `deleted.timestamp` alone in the all branch, `_id` plus
  `deleted.timestamp` in `resolve-report`. A file under `api/stages/`
  `_ref`'d as a pipeline stage cannot express that. What is needed is a `_ref`
  that returns the `$or` **value**, spliced into each match.
- **The count is wrong, in the direction that strengthens the case.** The exact
  predicate already appears **five times across four files**:
  `duplicate-report.yaml` ×1, `list-reports.yaml` ×2, `resolve-report.yaml` ×1,
  `set-report-favourite.yaml` ×1. Adding two MCP endpoints makes seven, not
  four — and two of the existing sites are endpoints the design never mentions.
- **"All four endpoints" is wrong on membership.** `list-reports`' `mine` and
  `deleted` branches deliberately do not use the readable predicate (`mine` is
  owner-matched at any visibility; `deleted` inverts the stamp test and is
  owner-only). The module's own comments name it "the readable predicate" and
  mark exactly where it is load-bearing (`list-reports.yaml:82-84`), so the
  selectivity is intentional and must survive the extraction.

**Proposed fix:** restate as extracting the `$or` fragment via `_ref`, name the
five existing call sites, and note that the branches which intentionally omit
it keep omitting it. The upside is bigger than the design claims — this is a
cleanup of five sites, not two.

### 5. `complete: false` conflates truncation with failure, and `failed_sections` covers only one

> **Resolved.** `complete` is gone. The response carries two separate top-level
> lists — `truncated_sections` and `failed_sections` — because the conditions
> call for different agent behaviour: truncated data is usable with a caveat, a
> failed section is absent. Per-section `truncated` / `row_cap` / `error` fields
> remain.

The envelope defines `complete` as "false if ANY section failed **or**
truncated" and `failed_sections` as the list of failures. A report that
truncated but suffered no failure therefore returns:

```jsonc
{ "complete": false, "failed_sections": [] }
```

which reads as a contradiction and tells the agent nothing about where the
problem is. The two conditions also call for different behaviour: truncated
data is usable with a stated caveat; a failed section is simply absent. Folding
them into one boolean destroys the distinction the section was written to
preserve.

**Proposed fix:** two explicit lists — `truncated_sections` and
`failed_sections` — and either drop `complete` or define it as "no section
failed and none truncated" with both lists always present. The agent-facing
instruction in the tool description then has something specific to say about
each case.

### 6. The envelope is specified for two of six section types

> **Resolved, and the review was partly wrong.** `querySections.js`'s docstring
> already settles which sections carry data: "Download sections query
> client-side on click, markdown sections have no query, and a filter without an
> optionsQuery has nothing to run — all are excluded." So this was answered by
> existing code, not open. The design now carries a table covering all six
> types. The finding still earned its place: chasing it showed `markdown`
> content is spec text that a hand-assembled envelope would drop, which drove
> the decision below.

`validateReportSpec.js:433` closes the vocabulary: `kpi, chart, table, filter,
markdown, download`. The envelope example shows `table` and `chart`. The other
four are unaddressed, and each is a real question:

- **`kpi`** is a single value read from row 0 via `valueKey`
  (`validateReportSpec.js:182`). `columns` + `rows` fits it badly — does the
  agent get the raw row, or the resolved scalar?
- **`markdown`** is the report author's own prose. It is arguably the single
  most useful section type for an agent writing a narrative, and an
  envelope built only from query results drops it silently.
- **`filter`** sections are controls rather than data, but they run options
  queries. Do they appear in `get-report-data` at all, given `get-report`
  already carries the filter definitions?
- **`download`** carries a query like a table.

**Proposed fix:** state the envelope mapping for all six types, including the
ones that are deliberately omitted and why.

### 7. The envelope omits `label`, and `section_id` is frequently positional

> **Resolved structurally.** Author's call: `get-report-data` is now
> **self-contained, built by walking the spec** and attaching results by section
> id — so `label`, `type`, `markdown` prose and rows arrive already joined and
> nothing is hand-copied. That removes the whole class of omission this finding
> and [6] are instances of, rather than patching two missing fields. The
> positional-id note (`validateReportSpec.js:85` derives `s${index}`) is recorded
> as the reason `label` is mandatory.

`validateReportSpec.js:85` derives `s${index}` when the author supplied no id,
so real reports commonly carry `s0`, `s1`, `s2`. The example's
`"section_id": "orders_table"` is the optimistic case, not the common one.

With no `label` in the envelope, an agent receives `s0` and has no
human-readable name for what it is holding — while the design's whole premise
is that agent turning the data into a presentation or a narrative. It would
have to invent section titles, which is exactly the kind of confident
fabrication this surface should avoid.

**Proposed fix:** include the section `label` alongside `section_id` in every
envelope entry.

### 8. A line cite an implementer would follow is wrong

> **Resolved (auto).** Cites corrected: the reject and enum guard at
> `list-reports.yaml:24-44`, the five per-scope predicates at `56-118`, and
> `resolve-report.yaml:38-42` for its own copy of the predicate.

The reuse section states `list-reports.yaml:24-44` "carries its own reject plus
five per-scope predicates." The signed-in reject is at line 28 and the scope
enum guard at 34-44; the five per-scope predicates are in the `$match`
`_switch` at roughly 56-118. Anyone opening the cited range to find the
predicates will not see them.

**Proposed fix:** cite the reject and guard as `24-44` and the predicates
separately as `56-118`.
