# Review 1

Scope verified against source: `planEventDispatch.js`, `resolveEntityData.js`,
`StartWorkflow.js`, `planTrackerLevel.js`, `planWorkflowRecompute.js`,
`renderEventDisplay.js` / `parseNunjucks.js`, `EventsTimeline.js`, the four `Get*`
read handlers, and `module.lowdefy.yaml`. Most of the design's factual claims
check out: the six call sites exist, `entity.ref_key` is already mandatory at
dispatch (so `entity_link` really is always non-null on the event path),
`planWorkflowRecompute` spreads `...workflow` and carries `entity` (incl. a
snapshotted `name`) through unchanged, `context.callApi` is on the engine
context, `page_id`/`title` are both required config, and `@lowdefy/nunjucks`
autoescape defaults on (`autoescape = null == t.autoescape || t.autoescape`).
The findings below are the gaps.

## Consistency

### 1. `entity_link` collides with the existing read-side `entity_link` — same name, different shape

> **Resolved.** Renamed the render-context object to `entity_ref` throughout the design (steps, decisions, the object section, template shorthand, and files-changed). The read-side `entity_link` on `Get*` responses is untouched. Added a note under "The `entity_ref` context object" recording why the name is deliberately distinct.

There is already an `entity_link` object in this subsystem, built by every
`Get*` read handler and consumed by the client breadcrumb / back-link. Its shape
is `{ pageId, urlQuery, title, name, list_page_id, list_title }`
(`GetWorkflowOverview.js:225-237`, and identically in `GetWorkflowAction.js`,
`GetWorkflowActionGroupOverview.js`, `GetEntityWorkflows.js`). The design
introduces a _second_ object also called `entity_link`, exposed on the event
render context and to `event_overrides` authors, with a different shape
`{ label, name, text, href, phrase }` (design §"The `entity_link` context
object"). Both are consumer-observable — the read one rides API responses, the
new one is documented for override authors — so two incompatible things share
one name in one module. That is exactly the "one correct way" hazard: an author
who has seen `entity_link.urlQuery` on a response will reasonably expect it in an
override template and get `undefined`.

Recommend renaming the render-context helper so it doesn't shadow the read-side
object — e.g. `entity_ref`, or fold it under the already-present
`workflow.entity` handle (the render context already exposes `workflow.entity`,
so `workflow.entity_link` / a sibling reads naturally). Whatever the name, it
should be distinct from the API-response `entity_link`.

## Accuracy

### 2. The "mirrors Part 33" rationale is backwards — the phrase _does_ go through the Nunjucks compile

> **Resolved.** Rewrote the "Autoescape is on" rationale to describe the actual safety mechanism (context value interpolated `| safe`, not template source → no injection; JS-side HTML-escape + DOMPurify for markup) and reframed Part 33 as a _contrasting_ path (fold-after-render), not a precedent. Also corrected the Part 33 line in "Related".

The §"Autoescape is on" decision says the approach "mirrors how Part 33 handles
comment HTML — stored verbatim and folded in _after_ render, never passed
through the Nunjucks compile." That is the opposite of what the design actually
does. Part 33's `foldCommentIntoEvent` runs strictly _after_ `renderEventDisplay`
precisely so comment HTML never reaches the compiler
(`planEventDispatch.js:294-308`, comment: "the comment is raw user-typed HTML
stored verbatim — it must never pass through the Nunjucks compile"). The entity
phrase, by contrast, is injected _during_ render via
`{{ entity_link.phrase | safe }}` — it goes straight through
`parseNunjucks` → `nunjucksFunction`.

The technique is still sound (a context _value_ interpolated with `| safe` is
emitted, not re-parsed as template source, so a `{{ }}` inside an entity name
can't trigger template injection; JS-side HTML-escaping + DOMPurify cover the
markup concern). But the safety argument rests on _that_ mechanism, not on the
Part 33 precedent. Rewrite the rationale to describe the actual mechanism
(value-not-source + JS-escape + DOMPurify) and drop the Part 33 analogy, which
points readers at the wrong mental model. Part 33 remains the correct precedent
for the _comment_ path only.

## Correctness edges

### 3. Hardcoded `href` bypasses the Lowdefy routing the read-side deliberately uses — breaks under `basePath`

> **Accepted (option a).** The event title is stored as rendered HTML (`EventsTimeline` uses `dangerouslySetInnerHTML`), so there's no `Link` block on this path and the URL must be frozen at write time — the read-side's delegate-to-framework approach isn't available. Recorded an explicit constraint in the design (under "Build the phrase …" and Non-goals): host apps serve at the domain root with no `basePath`, and the entity page is not the app home page. Accepted for a best-effort audit link; a `basePath` host is the concrete trigger to revisit, not built for speculatively.

The read-side `entity_link` hands `pageId` + `urlQuery` to a Lowdefy `Link` so
the framework resolves the final URL (`GetWorkflowOverview.js:227-228`, etc.).
The design instead bakes a literal string `href: "/{page_id}?{id_query_key}={id}"`
(design §"The `entity_link` context object"). That is a deliberate choice for an
audit link (non-goal: "no client-side routing"), and full navigation is fine —
but the non-goal only addresses SPA routing, not URL _resolution_. A raw
`/{page_id}` href is wrong if the app is served under a Next.js `basePath`, and
ambiguous if the entity page is the app's designated home page (served at `/`).
The read-side avoids both by never constructing the path itself.

Resolve it now rather than at code time: either (a) confirm the target host apps
run with no `basePath` and that entity pages are never the home page, and record
that assumption as an explicit constraint in the design; or (b) prefix the href
with the app's configured base path if one is reachable at dispatch. Given this
is a best-effort audit link, (a) is likely acceptable — but it should be stated,
not left implicit.

### 4. No backfill — every workflow already in flight loses the name for the rest of its life

> **Accepted.** No in-flight population exists — the workflows module is not yet consumed in production, so pre-release breaking changes are acceptable and no backfill is warranted. Added an explicit Non-goal recording this as a "no population" decision (not "too hard"): were it already live, the snapshot semantics make a one-shot backfill trivial.

`entity.name` is written only at `StartWorkflow` (design step 1;
`StartWorkflow.js:172-176` is where the `entity` object is composed). Workflows
that are already `active` when this ships have no `entity.name`, so _every_
subsequent event on them — submit, tracker-mirror, cancel, close — resolves
`name` to `null` and falls to the type-label branch ("… on <a>Lead</a>") for the
entire remaining life of the workflow. The fallback keeps the link working, so
nothing breaks, but the headline benefit (the name on the unified timeline,
Part 50) is silently absent for the whole in-flight population until each
workflow closes. The design's "Files changed" / "Non-goals" say nothing about
this transition.

Because the value is a snapshot, a one-shot backfill is trivial and correct:
for each open workflow with no `entity.name`, run the workflow-type's
`entity.data` routine once and set `entity.name`. Either add that as a migration
task or explicitly accept the degradation in a Non-goal so the omission is a
decision, not an oversight.

### 5. `entity_link.label` flips casing between the name-present and name-absent branches

> **Resolved.** `entity_ref.label` is now always `entity.title` as-authored (`"Lead"`) in both branches, so the exposed field is stable and predictable. Lowercasing is confined to `phrase` composition; override authors who want the lowercased form use `{{ entity_ref.label | lower }}`. Updated the object section and the "Type label" decision. (No second field added — `| lower` covers it.)

Per §"The `entity_link` context object", `label` is `entity.title` **lowercased**
when a name resolves (`"lead"`) but `entity.title` **as authored** when it does
not (`"Lead"`). An `event_overrides` author who composes with
`{{ entity_link.label }}` therefore gets different casing depending on whether a
name happened to resolve at Start — a value they can't predict and that can
differ across two events on the same workflow. The lowercasing is only needed
for the mid-sentence `phrase`; the exposed `label` field should be stable.
Recommend: keep `label` always as-authored (`"Lead"`) and lowercase only inside
`phrase` composition, or expose both (`label` as-authored + a separate lowercased
form) so authors get a predictable field.

## Minor

### 6. The cascade cost argument is slightly overstated

> **Resolved.** Reworded the Cost bullet so it no longer implies the _same_ entity's routine is re-run repeatedly: a cascade fans mirror events across several _parent_ workflows (each resolving its own target), so a per-event approach is one aggregation per parent per request. The purity argument (unchanged) remains the primary justification.

§"Snapshot the name at Start" justifies snapshotting partly on cost: "a tracker
cascade fans out several mirror events in one request, each of which would
re-run the routine." Each mirror level fires on a _different_ parent workflow
(`planTrackerLevel` resolves its target from the parent's own `loadedState`,
`planTrackerLevel.js:73-92`), so a per-event approach would run each parent's
routine once — not the same routine repeatedly for one entity. The real,
airtight justification is the _purity_ one (keeping `planEventDispatch` and the
planners I/O-free), which the design already makes and which fully stands. Trim
or reword the cost half so it doesn't imply redundant same-entity fetches; the
decision itself is correct.
