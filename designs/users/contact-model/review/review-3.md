# Review 3

Reviews 1 and 2 are fully resolved and folded into the design, so this pass re-verifies the
revised material against the code — chiefly Decision 5's new `search_contacts` pipeline mechanics
and Decision 1's expanded plugin/cross-module blast radius. The five decisions still hold; the
findings below are all in the mechanics the last revision added, and one is a correctness bug on
the primary search path.

### 1. Decision 5's "prepend a `$lookup`" breaks Atlas `$search`, which must be the pipeline's first stage

Decision 5's Mechanics paragraph (and the `search_contacts` Changes row) say to "**prepend** a
`$lookup` to `search_contacts`' pipeline that fetches the caller's own contact." But
`search_contacts`' pipeline leads with the Atlas text stage: `properties.pipeline` is
`_build.array.concat: [ _ref text_lead.yaml, [ $match, $limit, $project ] ]`
(`modules/contacts/requests/search_contacts.yaml`), and `text_lead.yaml` resolves to a `$search`
stage whenever `atlas_search` is on and the term is non-empty
(`modules/shared/search/text_lead.yaml:26`). Atlas Search requires `$search` to be the **first**
stage of the pipeline — a `$search` in any later position makes MongoDB reject the aggregation
outright. So prepending a `$lookup` doesn't silently degrade the typeahead, it **errors** it, on
the main path (atlas on + a typed term is the normal ContactSelector case). The no-term / atlas-off
branches emit `[]` or `$match:{}` and would survive, which makes it worse — the failure appears only
once a user starts typing.

**Fix:** don't make the caller `$lookup` the first stage. Two workable shapes — the design should
pick one:

- Insert the `$lookup` + `$addFields`(scope) **after** the text-lead stage and before the structural
  `$match` (so order is `$search` → `$lookup` → `$match` → `$limit` → `$project`; `$search` stays
  first). Note the caller contact is a constant per request, so a correlated/pipeline `$lookup` here
  re-fetches the same single caller row for every candidate before `$limit` — acceptable but worth
  stating.
- Or resolve the caller's `company_ids` **outside** this pipeline (a small preceding read, injected
  as a `payload`/literal into the `$match`), keeping `$search` first and the scope a plain literal —
  which also matches the design's own "injected … exactly as the dead `_user:` reads were" framing,
  since those reads were literals in the `$match`, not a join.

### 2. The Decision 5 rewrite doesn't account for the `company_only_contacts` build gate that currently controls whether scoping applies at all

Today the entire company-scope clause is wrapped in a build-time opt-in:
`_build.if: { test: { _var: company_only_contacts }, then: <scope clause>, else: [] }`
(`modules/contacts/requests/search_contacts.yaml`). A consumer that doesn't set
`company_only_contacts` gets **no** scope stage — the pipeline is just text-lead + structural
`$match`. Decision 5's Mechanics and the Changes row describe the rewrite (remove the two dead
`_user:` reads, add the `$lookup`, rewrite the match to `$setIntersection`) without mentioning this
gate. Taken literally, an implementer would add the caller `$lookup` unconditionally, which (a)
compounds finding #1 by firing the illegal stage even for consumers that never asked for scoping,
and (b) changes behaviour for those consumers (an extra join + scope match where there was none).

**Fix:** state that the caller-contact `$lookup` and the `$setIntersection` match stay **inside the
`company_only_contacts` build gate** — only consumers that opt into company scoping get the extra
stage(s); everyone else keeps today's plain pipeline.

### 3. The plugin version bump omits the plugin test files, which hard-code `user-contacts` and rely on the old default

> **Resolved (auto).** Confirmed in source: both request tests seed/clean their contact fixture into a literal `user-contacts` collection and construct the connection without setting `contactsCollection`, so they ride the default (`GetEventsTimeline.test.js:37,117`, `GetWorkflowAction.test.js:215,1138`). Added both `*.test.js` files to the plugin-bump Changes row — their `collection("user-contacts")` seed/cleanup calls move to `contacts` in the same change, so the avatar-join assertions stay green.

Decision 1's plugin-bump row enumerates the source sites to change (`WorkflowAPI/schema.js`,
`GetEventsTimeline.js`, `GetWorkflowAction.js`, `EventsTimeline/schema.js`) but not the tests that
exercise them. Both request tests seed the contact fixture into a literal `user-contacts` collection
and construct the connection **without** setting `contactsCollection`, so they lean on the default:
`GetEventsTimeline.test.js:37,117` and `GetWorkflowAction.test.js:215,1138` all call
`mongo.db.collection("user-contacts")`. The moment the default flips to `contacts`, the code under
test queries `contacts` while the fixtures live in `user-contacts` — the avatar-join assertions go
empty and the suite goes red. The plugin can't ship green without updating these seeds in the same
change.

**Fix:** add the two `*.test.js` files (the `collection("user-contacts")` seed/cleanup calls) to the
plugin-bump scope in the Changes table, so the fixture collection tracks the new default.

### 4. The `EventsTimeline/schema.js` entry in the plugin-bump row is mischaracterized — there is no `default` to change there, and the field is unconsumed

> **Resolved (auto); open question answered.** The mechanical half holds: `EventsTimeline/schema.js:36` declares `contactsCollection` with only `type` + `description` and **no `default` key** — the sole `"user-contacts"` there is prose in the description (line 41). Corrected the Changes row to make `EventsTimeline/schema.js` a **doc-string-only** edit, not a `default` retarget. But the "vestigial" half resolves the **other** way: the field is **live**. `EventsTimeline.js` reuses `GetEventsTimeline` as its request, and `GetEventsTimeline.js:40` reads `connection.contactsCollection ?? "user-contacts"` — so an `EventsTimeline` connection's `contactsCollection` does drive the avatar `$lookup from`; its effective default is that runtime `??` fallback (already in scope), not a schema `default`. It stays a real bump site, doc-string-only in `schema.js`.

The plugin-bump row lists `EventsTimeline/schema.js:36,41` alongside the WorkflowAPI sites as a
`contactsCollection` schema `default: "user-contacts"` to change. Two things are off, verified in
source:

- `WorkflowAPI/schema.js:177` genuinely has `default: "user-contacts"` — correct. But
  `EventsTimeline/schema.js:36` declares `contactsCollection` with only `type` + `description` and
  **no `default` key**; the only `"user-contacts"` in that file is prose in the description string
  (line 41). There is nothing at line 36 to retarget.
- `EventsTimeline.js` never references `contactsCollection` at all (the sole hit for the field in the
  whole connection is the schema declaration). So unlike `GetEventsTimeline`/`GetWorkflowAction`,
  this connection has no runtime `?? "user-contacts"` fallback and no `$lookup` driven by the field —
  the schema field appears to be dead in `EventsTimeline`.

This undercuts the "all eight sites … drive the `$lookup from`" framing for one of the eight: for
`EventsTimeline` the only real edit is the stale doc string, and whether the field does anything at
all is worth confirming. **Fix:** correct the row to say `EventsTimeline/schema.js` needs only the
doc-string update (no `default` field exists there), and resolve the open question — does
`EventsTimeline` actually resolve contact avatars, or is its `contactsCollection` schema field
vestigial? If vestigial, it's out of scope for this design but shouldn't be counted as a functional
bump site.
