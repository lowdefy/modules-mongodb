# Review 1

### 1. No concrete need is recorded, yet the design now specifies three endpoints

> **Resolved.** Author's call: this is a **buildable spec**, not a decision
> record — someone is going to build from it. The contradictory "backlog draft,
> not committed work" framing is removed and the envelope decisions below are
> settled rather than deferred. The concrete consumer is still unrecorded; the
> design now says so explicitly and asks for it, since it is the only thing
> that would let a reader check the envelope against a real need.

The design opens by saying it "remains a **backlog draft**, not committed work…
Pull it forward when a real consumer asks" — and then specifies three endpoints,
their payload schemas, an envelope shape, and a filter-discoverability protocol.
Those two halves pull against each other, and against CLAUDE.md's "build for
concrete needs, not speculation": nowhere does the design name who asked for
this, what they would do with it, or which app needs it.

Resolving the security crux was worth doing regardless — that question was going
to be re-asked by whoever picked this up. Specifying the envelope may not be:
envelope shape is exactly the decision a real consumer would settle in one
conversation, and guessing it now means designing against an imagined client.

**Proposed fix:** decide which document this is. Either (a) name the concrete
consumer and drop the backlog framing, or (b) keep it a decision record — the
platform feature, the packaging answer, the endpoint gap, the bump cost — and
cut the endpoint specification back to "three endpoints are needed; shape them
with the first real consumer." Do not keep both framings.

### 2. The row-cap truncation signal is UI-only, and `get_report_data` would silently drop it

> **Resolved.** Applying a decision this module already made — `report-filters`
> established "truncation is stated, not silent". The envelope carries
> `truncated` and `row_cap` per section, and a top-level `complete: false` when
> any section hit the cap. The tool description tells the agent to check
> `complete` before reporting a total.

`validatePipeline.js:980` appends `{ $limit: PIPELINE_RESULT_CAP }`
unconditionally to every pipeline (`constants.js:118` — 1000). The only place
that truncation becomes visible is the block compiler:
`compileReport.js:614-624` compares `rows.length >= PIPELINE_RESULT_CAP` and
rewrites the section's **heading string** to `"{label} — first 1000 rows"`. Its
own comment states the reason: "a table silently showing its first 1000 rows
reads as the complete answer, and a reader has no way to tell the difference."

`get_report_data` is specified to return "a normalized envelope (section id,
type, columns, rows)" _instead of_ compiled blocks — so it bypasses
`sectionHeading` entirely and the signal is lost. An agent that receives exactly
1000 rows will total them and state the total as fact. This is strictly worse
than the UI case the guard was written for, because there is no reader to notice
a suspiciously round number.

Note this is the same principle `report-filters` already committed to for filter
options ("Truncation is stated, not silent") — so the envelope dropping it is a
regression against a decision already made in this module.

**Proposed fix:** the envelope carries truncation per section explicitly — e.g.
`{ section_id, type, columns, rows, truncated: true, row_cap: 1000 }` — and the
tool description tells the calling agent to check it.

### 3. Filter values are client-resolved `__state` reads, so the filter path is new code, not reuse

> **Resolved.** The design no longer claims reuse. It now states that
> `get-report-data` needs a server-side binder, and requires the control→op
> mapping to be **extracted so `boundFilters` and the binder share one copy** —
> the drift failure mode is a filter that silently does nothing.

The design says `get_report_data` takes "an optional `filters` value… reusing the
same filter-binding the UI uses." The UI's binding is not reusable from a server
caller. `compileReport.js:297-325` (`boundFilters`) emits triples whose values
are **deferred placeholders**: `{ field, op: "eq", value: { __state: key } }`.
Those placeholders are baked into the compiled blocks and resolved by the browser
from live page state at `onChange` time (the `report-filters` design's data flow
step 4 says so explicitly: "values resolved from live page state").

An MCP caller has no page state and no `onChange`. So `get_report_data` needs a
**server-side binder** that takes `{ filterField: value }` from the payload and
produces the same triples using the same control→op rules (`daterange` →
`gte`/`lte` pair, `multiselect` → `in`/`all` per `match`, `select` → `eq`). That
is a real new component that must stay in lockstep with `boundFilters`, not a
reuse of it.

**Proposed fix:** say so, and decide where the shared rule lives. The
control→op mapping should exist once — extracted so `boundFilters` and the
server-side binder both consume it — or the two will drift the first time a
fourth control is added.

### 4. The reason not to expose `query-data` is stronger than the design states

> **Resolved.** "Not unsafe" is gone. The section now quotes
> `open-query-engine` §5 verbatim (no field scoping → a bounded full dump of
> any cataloged collection is available to any authorized caller), states the
> rule as a prohibition — `query-data` is never listed in an `mcp` block — and
> notes the module cannot enforce it, so `docs/ai-reporting/` must carry it too.

The design says exposing `query-data` is "not _unsafe_ — but a far larger
product surface." The open-query-engine design's field-scoping decision
(`../../open-query-engine/design.md`, §5) is blunter than that:

> with no field scoping, an empty pipeline (or `$replaceRoot: { newRoot:
"$$ROOT" }`, or `$getField`) returns **every field of every touched
> collection**, up to the injected row limit — i.e. a full, bounded dump of any
> cataloged collection is available to any authorized caller.

That is an accepted consequence _in-app_, where the caller is a signed-in user
in a browser session. Over MCP the same capability is handed to a third-party
agent holding a long-lived OAuth bearer token, driven by a model, on
infrastructure the app operator does not control. Same authorization, materially
different exposure — and "declare the collection = expose the collection" reads
very differently when the thing doing the reading is an autonomous client.

**Proposed fix:** replace the "not unsafe" phrasing with the citation, and state
the rule as a prohibition rather than a preference: `query-data` is never listed
in an `mcp` block. Worth recording in `docs/ai-reporting/` too, since the
prohibition is on the consuming app's config, where the module cannot enforce it.

### 5. "Visibility tracks by construction" is an obligation the design hasn't discharged

> **Resolved.** The claim is now labelled an obligation, and discharged:
> extract the readable-scope match into a shared stage under
> `modules/ai-reporting/api/stages/` and have all four endpoints `_ref` it.
> Four inline copies of a confidentiality-critical predicate is exactly what
> "one correct way" exists to prevent.

The design claims publish/`share_roles` visibility "tracks the existing model by
construction — there is no separate MCP visibility rule to design." That holds
only if the new endpoints reuse the existing readable predicate, and today that
predicate is written inline per endpoint: `resolve-report.yaml:19-45` carries
the signed-in reject plus the `$or` on `owner.user_id` / published visibility,
and `list-reports.yaml:24-44` carries its own signed-in reject plus five
per-scope predicates.

`get_report` and `get_report_data` are new endpoints. "By construction" would
mean the predicate is structurally shared; hand-copying it into two more places
is the opposite — it is four inline copies of a match whose own comment says "a
bug in it is a confidentiality bug rather than a display bug"
(`list-reports.yaml:4-5`). That is precisely the drift CLAUDE.md's "one correct
way" is about: prefer the shared component that enforces the pattern
mechanically over the convention that each caller remembers.

**Proposed fix:** extract the readable-scope match into a shared stage under
`modules/ai-reporting/api/stages/` and have all four endpoints `_ref` it, then
the "by construction" claim is true. Otherwise soften the claim to name the
obligation.

### 6. There is no verification story, and the usual gate cannot reach these endpoints

> **Resolved.** Test them as the HTTP endpoints they are, via Playwright's
> `request` fixture. Verified this works with the existing setup: endpoints are
> callable at `POST /api/endpoints/{endpointId}` (`createCallAPI.js:19-26`) with
> no CSRF on the route, the suite authenticates by cookie
> (`ldf.user()` → `setUserCookie` → `page.context().addCookies`), and
> `page.request` shares the context's cookie jar — so a POST after
> `ldf.user(USER_B)` arrives as USER_B and `_user` resolves in the routine. The
> design now carries a **Verification** section with the mechanism, what it
> covers, and what it deliberately does not (MCP transport, OAuth handshake —
> platform behaviour, already unit-tested upstream). The demo consumer is the
> `mcp` block in `apps/demo/lowdefy.yaml`, since there is no clickable surface.

CLAUDE.md requires a demo consumer for any new consumer-facing capability, and
`pnpm e2e` is named as the only gate that catches "anything that depends on a
routine actually executing (an authorization filter, a rejection path, an
operator resolving against a real `_user`)" — which is exactly what these three
endpoints are.

But the existing suite is entirely browser-driven: `apps/demo/e2e/` holds page
specs (`ai-reporting/`, `user-account/`, `mongodb.spec.js`) and nothing calls an
API endpoint directly. An MCP tool cannot be clicked, and the OAuth flow a real
MCP client runs is not something the suite can drive.

The design says nothing about this. Three endpoints whose entire job is
authorization-sensitive data return would ship with build-check coverage only.

**Proposed fix:** state the testing approach. Because these are plain `Api`
endpoints, Playwright's `request` fixture can POST to them with the session
cookie the existing fixtures already establish — covering the authorization
filters, the scope enum rejection, and the envelope shape — with the MCP
transport and OAuth handshake explicitly out of scope as platform behaviour.
Also name what the demo consumer is, given there is no clickable surface.

### 7. Partial failure is visible to a reader and invisible to an agent

> **Resolved.** Folded into the envelope decision with the truncation signal
> [2] — same failure, same fix. Degradation is structural: top-level
> `complete: false` plus a `failed_sections` list, so an agent reading only the
> envelope's top level cannot report a partial result as whole.

The design says a failed section "should surface as a per-section error in the
envelope, mirroring how the UI renders one failed section as an Alert card."
The mirror is imperfect in the way that matters. An Alert card is unmissable —
it occupies the section's space in a report a human is looking at. A per-section
error object in a JSON envelope is a key an agent can iterate straight past,
after which it presents "the report" to its user with a role-gated section
silently absent.

This is the same failure mode as finding #2 (silently partial data presented as
complete), and it has the same shape of fix.

**Proposed fix:** make degradation structural rather than per-section — a
top-level `complete: false` with the list of failed section ids alongside the
per-section errors, so an agent that reads only the envelope's top level still
cannot report the result as whole.

### 8. A new unthrottled invocation path against per-query-only resource bounds

> **Deferred to deployment — recorded as blocking.** Verified: nothing in the
> framework throttles `/api/mcp` or API endpoints; rate limiting exists only
> under `auth` (better-auth's own window/max on the login endpoints). What
> fronts a production app is not known, so the design now carries this as an
> explicit open question that **must be answered before the `mcp` block is
> enabled in any real app** — alongside the version-bump gate, not folded into
> it. Deliberately not assumed to be the platform's concern.

Everything the open-query-engine design does to bound cost is **per query**:
`maxTimeMS` (30s default), the structural and expression-tree caps,
`PIPELINE_RESULT_CAP`. It also sets `allowDiskUse: true`, accepting that
high-cardinality work spills to disk. Those bounds were sized against a browser
caller — human-paced, one report open at a time.

An agent calling `get_report_data` in a loop is not human-paced, and a report
with a dozen query-backed sections is a dozen pipelines per call. The design does
not say whether anything rate-limits `/api/mcp`, per caller or per token.

**Proposed fix:** answer it explicitly, even if the answer is "the platform's
concern, accepted" — but check first, because if nothing throttles it, an
OAuth-authorized agent is a cheaper way to load the analytics database than
anything the UI can do.

### 9. The friendly tool names in the Goal are not the names a client will see

> **Resolved (auto).** Factual fix, no decision needed. The Goal now uses the
> derived names (`ai-reporting__list-reports` etc.) and records that the module
> entry id becomes part of every tool name — so a tool `description` can never
> hardcode a sibling tool's name.

The Goal lists `list_reports`, `get_report`, `get_report_data`. The actual tool
names are derived mechanically: `createMcpServer.js:21` is
`id.replaceAll('/', '__')`, so the entry-scoped ids in the design's own config
example surface as `ai-reporting__list-reports`,
`ai-reporting__get-report`, `ai-reporting__get-report-data` — hyphens intact,
entry prefix included.

That is not cosmetic for this design specifically, because the whole premise is
an agent discovering and choosing these tools by name. It also means the tool
names carry the consuming app's module entry id, so an app that mounts the
module as `reporting` gets different tool names than one that mounts it as
`ai-reporting` — worth knowing before writing tool descriptions that reference
sibling tools by name.

**Proposed fix:** use the real derived names in the Goal, and note that a
description referring to another tool cannot hardcode that tool's name.

### 10. `scope: deleted` would be exposed to external agents by default

> **Resolved.** The MCP schema declares `[mine, shared, favourites, all]` and
> omits `deleted` — the recycle bin is a UI affordance. This also settles the
> design's earlier "either annotate `list-reports` or add a sibling" hedge in
> favour of a **dedicated sibling**: a schema can only be narrower than its
> endpoint if it is its own endpoint.

`list-reports.yaml:34-44` validates its `scope` payload against
`[mine, shared, favourites, all, deleted]`. The design correctly says the
`payloadSchema` should declare that enum so the agent picks a valid value — but
declaring it verbatim hands external agents a soft-deleted-reports listing,
which is a recycle-bin UI affordance rather than something a report-data
consumer needs.

**Proposed fix:** decide the MCP enum deliberately rather than inheriting it —
most likely `[mine, shared, favourites, all]`. Note this is a case where the
MCP-facing endpoint's schema wants to be narrower than the endpoint's, which is
itself an argument for a dedicated sibling over annotating `list-reports` in
place (a choice the design currently leaves as "either").
