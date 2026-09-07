# Review 2

A full read of the design after review 1's copy findings were resolved. The block-feasibility
work holds up under checking — every claim in it verified true, listed at the end. The findings
are in the endpoints, the data model and the scope of the table part.

### 1. Telling both conversation writers to `$setOnInsert` the same fields they `$set` makes every save throw

> **Resolved (auto).** Accepted as stated — the probe settles it, so there was nothing to decide. The
> design now states the invariant as the **union** of both writers' `$set` and `$setOnInsert` covering
> the live shape, with a per-writer table: `save-conversation` inserts `created`, the derived `title`,
> `data_parts: []` and `deleted: null` beside the `messages` / `owner` / `updated` it already `$set`s;
> `set-conversation-title` inserts the rest. The probe's three facts are recorded in the design's
> resolved questions (conflict on every call, nested overlaps conflict too, `$setOnInsert` does not
> fire on a match), so the shared-shape phrasing cannot come back.

The decision that both writers must initialise the same live document shape ("Both writers must
`$setOnInsert` the same live shape", Data model) prescribes `owner`, `created`, `updated`,
`messages: []`, `data_parts: []` and `deleted: null` for each. But
`modules/ai-reporting/api/save-conversation.yaml:39-47` already `$set`s `messages`, `owner` and
`updated` on every call. MongoDB rejects the same path appearing in both operators.

Probed against a real server rather than reasoned about — `mongodb-memory-server`, driver 6.21:

```
$set owner + $setOnInsert owner      → THROW 40: Updating the path 'owner' would create a conflict at 'owner'
$set owner.name + $setOnInsert owner → THROW 40: same
$set owner + $setOnInsert data_parts → OK, upserted
```

It throws on **every** call, not only inserts, and not only on the overlapping insert path. So
`save-conversation` would stop persisting conversations entirely — and it would do it silently, in
exactly the way this design already documents elsewhere: the write is inside an `onFinish` hook
whose errors `handleAgentChat` only `console.warn`s (`@lowdefy/ai-utils/dist/handleAgentChat.js:201`,
verified). Every turn would vanish.

`set-conversation-title.yaml:33-40` has no such overlap — it `$set`s only `title` — so the
prescription is safe there and only `save-conversation` breaks.

**Fix:** state the invariant as _the union of both writers' `$set` and `$setOnInsert` covers the
full live shape_, and let each writer `$setOnInsert` only the fields it does not `$set`.
`save-conversation` adds `data_parts: []` and `deleted: null` to the `created`/`title` it already
inserts; `set-conversation-title` carries the full set. Worth writing the per-writer split into the
design explicitly, because the shared-shape phrasing is what produced the conflict.

The probe also confirms the mechanism the design relies on: `$setOnInsert` does not fire on a
match, so a second call leaves the initialised arrays untouched.

### 2. The table part is a new agent tool, an endpoint and a validator — not "no new machinery"

> **Accepted as a re-pricing.** The feature stays — the design's own argument holds, and a report of
> charts only would be a report of the minority case. What changed is the honesty of the price:
> "Tables are results" now splits the free consumption half (same route, same panel, same selection,
> `AgGridBalham` already renders it) from the production half that does not exist, and names all four
> pieces — `render-table`, a standalone `validateTableSpec`, the `tools:` registration with its prompt
> contract, and the third branch and third per-turn budget in `buildDataParts`. All four are in the
> endpoints table and the files list, and the section says outright that this is the largest item in
> the sub-design, so a decomposition reading the first paragraph alone cannot size it as "one more
> part type".

"Tables are results" says a `data-report-table` part "fixes it with no new machinery: the same
`onDataPart` route, the same panel, the same selection." The routing and panel half is right. The
production half does not exist.

`emit-data-parts.yaml:17-51` builds its parts by filtering the turn's `toolResults` on
`toolName` — `render_chart` for charts, `export_data` for downloads. There is no table tool:
`render_table`, `data-report-table` and `validateTableSpec` return nothing anywhere in `modules/`
or `plugins/`. So a table part has no source. Producing one needs, at minimum:

- a new `modules/ai-reporting/api/render-table.yaml` mirroring `render-chart.yaml` — a `payloadSchema`,
  a validate-before-ack call, and a return of the small validated spec (that file's header comment
  explains why it returns the spec and not the rows: tool results are model context, re-sent every
  later step and turn);
- a `validateTableSpec` in `plugins/modules-mongodb-plugins/src/analytics/` — the column contract
  (`key`, optional `label`, optional `format`) exists today only inside `validateReportSpec` for
  report sections, not as a standalone spec validator;
- registration in `modules/ai-reporting/agents/reporting-assistant.yaml:179-191`'s `tools:` list, plus
  the prompt contract the design already anticipates;
- a third branch and a third budget in `buildDataParts.js`, which currently hard-codes two
  (`chartBudget` / `downloadBudget`, both `MAX_DATA_PARTS_SPECS`).

The `Files changed` list names only `emit-data-parts.yaml`, `buildDataParts.js` and the agent
prompt — the new endpoint and the new validator are missing from it.

This is a re-pricing, not an argument against the feature: save-as-report is explicit that a report
of charts only would be a report of the minority case. But it is the largest single item in this
sub-design and currently reads as the smallest, which will distort the decomposition.

### 3. The 16 MB argument bounds the smaller half of the document

> **Resolved — the agent's read path gets its own 200 KB budget on a new `query-data-tool` endpoint.**
> The finding holds and the fix went further than "cap what is persisted", because a tool result is
> not only persisted: it is model context re-sent on every later step and turn, which is the reason
> `render-chart` returns a spec and not rows in the first place. And with the `display` summary this
> design already adds, `MessageBubble` takes the `toolOutput.display` branch and never renders the raw
> output — so those rows would be stored and re-sent forever while being shown to nobody. One number
> fixes document size, context window and token cost together.
>
> **200 KB, chosen to sit on the discriminating line rather than as a round guess.** `PIPELINE_RESULT_CAP`
> already bounds the row count at 1000; a typical aggregation row is under a hundred bytes, so the full
> 1000 rows cost well under the budget, while a `$push: "$$ROOT"` dump of wide documents breaks it at
> once. Exceeding it throws the engine's existing _"narrow the query — project fewer fields, or
> aggregate instead of returning raw documents"_ mid-stream, which is the right instruction to an
> analytics agent and one it can act on inside the turn.
>
> **Why a second endpoint rather than a payload field.** The agent authors the payload, so a
> payload-supplied budget is a budget the agent can raise — and the browser-side download path is no
> better. The only trustworthy discriminator is which endpoint was called. `query-data` keeps its 8 MB
> budget and its bare-array return (which is what `DownloadCsv` consumes, so adding `display` to it
> would have broken the download); `query-data-tool` carries the tighter budget and the summary. The
> security boundary does not move — both run the same guard and the same `AnalyticsPipeline` request
> against the same catalog. The AnalyticsPipeline request gains an endpoint-authored budget property
> with `connection.maxResultBytes` as the fallback.
>
> **Consequence for `$slice: -50`:** its stated reason is gone, and the design now says so. The cap is
> kept and re-justified as a panel-length bound — two hundred cards is not a panel — rather than as
> protection against a ceiling it never reached.

The decision to bound the parts array (`$slice: -50`) rests on "A part's payload is the largest
object this module persists, and `save-conversation` rewrites the whole document every turn
regardless — so a long analytical conversation walks toward the 16 MB ceiling". The ceiling risk is
real and the reasoning about `save-conversation` rewriting everything is correct. The premise about
which field is largest is not.

`messages` is the other half of that document and it is unbounded:

- `query-data.yaml:76-77` returns `_step: run_query` — the raw rows.
- Row volume is capped only by `MAX_RESULT_BYTES = 8000000` in
  `plugins/modules-mongodb-plugins/src/analytics/constants.js:121`, enforced in
  `AnalyticsPipeline.js:133`. **8 MB per `query_data` call.**
- That output lands on the tool part (`messageParts.js:24` reads `part.output`), so it is in the UI
  message array `handleAgentChat.js:180` hands the hooks as `messages`, which
  `save-conversation.yaml:40` `$set`s wholesale.

Two large queries in one conversation exceeds 16 MB on `messages` alone, with `data_parts` dutifully
capped at 50. The failure mode is the one the design describes — a throw inside a `console.warn`-only
hook, turn lost, nothing shown — so the mitigation as written does not remove it.

Note the codebase already holds the principle this violates: `render-chart.yaml`'s header explains it
returns only the validated spec because "Tool results are model context (re-sent every later step and
turn)". `query_data` is the one tool that returns bulk rows, and it pays for that twice — model
context and document size.

**Fix:** either bound what `query_data` persists (a row/byte cap on the tool result, well under
`MAX_RESULT_BYTES`, is the direct answer and also cuts model context), or say explicitly that
`messages` is out of scope and that `$slice: -50` bounds parts growth only — not the ceiling. The
first is a real fix; the second at least stops the design claiming a protection it does not provide.

### 4. The rail's search and its "Older" group can only see the 30 most recent conversations

> **Resolved — cap raised to 200, filtering stays client-side.** The finding holds; the design now
> names the cap in Current state (it was missing from the gaps list) and carries the decision. Reasons
> for the cheap answer over the correct-sounding one: the endpoint already projects `messages` and
> `data_parts` away, so 200 title-and-timestamp documents is a small payload and the cap keeps doing
> the job its header comment gives it. Server-side search needs a debounced round trip per keystroke
> and a second code path for the unsearched list, bought on a guess about a conversation count nobody
> has yet; if a real complaint appears it is additive behind the same `Search` block, exactly like the
> collapse-state fallback. What the design owes meanwhile is honest copy: the rail is the 200 most
> recent conversations, and an empty search says so rather than implying nothing matched.

Proposal 4 sets out to make the rail "usable at more than a handful of conversations", and the
block-feasibility section resolves search as "a `Search` block above the rail filtering the array
_is_ the feature". Mechanically true. Functionally it searches a window:
`list-conversations.yaml:29` sets `limit: 30` on a `updated.timestamp: -1` sort.

So for a user with 200 conversations, searching for one from last month returns nothing, with no
indication that the search was scoped rather than unsuccessful — the worst shape of empty result.
Recency grouping has a milder version of the same problem: Today / Previous 7 days / Older
partitions the newest 30, so "Older" shows whatever is left over from a month of activity rather
than the archive it implies.

This is the design's stated goal colliding with a cap it does not mention — the Current state bullet
lists the rail's gaps as "titles only: no search, no timestamps, no rename, no delete" and omits the
limit.

**Fix:** decide it explicitly, either way. Server-side search (pass the term to `list-conversations`
and `$match` on title before the sort and limit) makes the feature mean what it says and costs one
payload field; keeping client-side filtering means raising or removing the cap, and stating the
retention story the rail actually offers. Worth noting the cap has a second job — the header comment
ties the projection and the cap to keeping the payload bounded — so removing it is not free.

### 5. Table results would not survive reopening a conversation

> **Resolved (auto).** Both halves accepted; they are consequences of the table part, not decisions.
> `get-conversation-results` is now a `change` row in the endpoints table for the third
> `data-report-table` branch as well as the projected fields, and the `chat.yaml` files-changed entry
> says the table state array is cleared in all three places the panel arrays are cleared
> (`onInit`, `onNew`, `onSelect`) and repopulated in `set_results` — the leak the existing skip-guard
> comment already warns about for transcripts.

`get-conversation-results.yaml:51-76` splits the persisted parts into exactly two arrays by type,
`data-report-chart` and `data-report-download`, and returns `{ messages, charts, downloads }`. A
`data-report-table` part would be persisted by `emit-data-parts` and accumulated live by
`onDataPart`, then silently dropped on reopen — charts and exports return, tables do not.

The `Files changed` entry for this endpoint mentions only projecting the new `id`/`created`/`spec`
fields through, not the third type branch.

The state side needs the matching care: `chat.yaml` clears the panel arrays in three places —
`onInit` (line 17-18), `onNew` (79-80) and `onSelect` (95-96) — and `set_results` repopulates them
(123-132). A `tables` key missed in any one of those leaks the previous conversation's tables into
the next, which is the same class of bug the `set_results` skip-guard comment already documents for
transcripts.

### 6. Nothing says where a part's `id` and `created` come from, and the one hint points at a pure function

> **Resolved — minted in `emit-data-parts`; `created` is a bare timestamp.** Both accepted as
> proposed. `buildDataParts` stays pure, so the routine maps over its return and adds the fields:
> `__uuid: true` per part, and one turn timestamp shared across that turn's parts, which is what they
> genuinely share. Verified rather than assumed — the `_uuid` operator is declared `dynamic`, so it is
> re-evaluated per callback invocation and yields a distinct v4 per item; that fact is in the design's
> resolved questions.
>
> **`created` is a bare timestamp, not a change stamp**, and the design now argues it rather than
> leaving it to the implementer: a part is not a document and has no author of its own — the
> conversation's `owner` answers who, one level up — so repeating a user id and display name on fifty
> array elements buys nothing and goes stale independently. The report page's provenance line reads who
> from the report and the conversation, not from the part.

The artefact-store decision makes both fields load-bearing — `id` is what selection binds to, and
`created` is "the only thing that can date a frozen chart". Neither has a stated source. The only
hint is the `Files changed` line for `buildDataParts.js` ("carries the validated spec and the new
fields onto each part"), which is the wrong home for two reasons:

- `buildDataParts` is a pure function over its arguments with a unit-test file beside it
  (`buildDataParts.test.js`). Minting a uuid and reading the clock inside it makes it
  non-deterministic and its tests unpinnable without injection.
- The repo's precedent is the opposite: ids are minted by the `_uuid` operator in the routine —
  `generate-report.yaml:86-87` does exactly this for a report `_id` — and where the plugin does
  assign ids it derives them deterministically, as `validateReportSpec.js:85` does with `s${index}`
  for sections.

`created`'s **shape** is also undecided. Every other "when" this module persists is a change stamp
`_ref`'d from `defaults/change_stamp.yaml` (`docs/shared/change-stamps.md`), and the design says the
part stamp is what the report page treats as a provenance fact. A bare ISO date may well be right
for a panel card — but it should be a stated choice rather than an implementer's guess, since a card
reading "as of 14 July" and a provenance line elsewhere reading who-and-when want different amounts
of it.

**Fix:** mint both in `emit-data-parts.yaml` alongside the existing operator work and pass them in,
keeping `buildDataParts` pure; and say which shape `created` takes.

### 7. The `setInput` patch is three edits, and the third one is where the regression hides

> **Resolved (auto).** Accepted and written into the block-feasibility section: the clear that empties
> the composer after a send sits deliberately downstream of the `onBeforeSend` cancellation return and
> the file-upload await, so a cancelled or failed send keeps the user's text. The controlled conversion
> must move it to a state reset at the same point in the flow; clearing in `onSubmit` instead loses
> typed input on every rejected send. The "it is small" claim stands — one hunk, 17 lines.

The patch is specified as "the `setInput` method on `AgentChat` (controlled `Sender` plus
`registerMethod`)". Reading `AgentChat.js`, there is a third touch point: line 400,
`senderRef.current?.clear()`, which is how the composer is emptied after a send today. A controlled
`Sender` has to replace that with a state reset, and **where** it sits matters — it is currently
downstream of the `onBeforeSend` cancellation return at line 357 and of the file-upload await, so a
cancelled or failed send deliberately leaves the user's text in the box. A controlled conversion
that clears in `onSubmit` instead loses typed input on every rejected send.

Worth naming in the design, since the patch is the design's one hard block dependency and its risk
section already anticipates re-doing it after a version bump. The claim that it is small still
holds — the existing patch is 17 lines and one hunk.

## What holds up

Checked and true, so nothing to do about them: the eight registered block methods, exactly as
listed, with no input setter among them (`AgentChat.js:192-227`); the `Sender` mounted uncontrolled
via ref with no `value` prop (595-596); `handlePromptClick` calling `sendMessage({ text })` directly
(411-415); `WelcomeScreen` flattening `prompts` to `key`/`label`/`description` and dropping
`children` (`WelcomeScreen.js:19-23`), and returning `null` for an unset config, which is what makes
"leave it unset" work; `AgentConversations` exposing `menu` with `onMenuClick` and a `groupable`
config (`AgentConversations.js:19-48`); mermaid at 11.16.0 with `renderMermaid` defaulting true
(`MessageBubble.js:184`); `handleAgentChat` only `console.warn`ing a failed hook (line 201); and the
soft-delete predicate cited from `docs/shared/soft-delete.md` — `deleted.timestamp: { $exists:
false }`, with absent treated as live, which correctly covers conversation documents written before
the field existed.

Every block the design names is installed: `Splitter`, `SegmentedSelector`, `CheckboxSwitch`,
`Search`, `Tabs`, `Title`, `Paragraph`, `Card`, `Modal` in `blocks-antd`; `List`, `Box` in
`blocks-basic`; `EChart` in `blocks-echarts`; `AgGridBalham` in `blocks-aggrid`.
