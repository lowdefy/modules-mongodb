# Review 1

The design is unusually well-argued at the decision level — the export-belongs-to-a-section
reasoning, the withheld-vs-broken distinction, and the `Dynamic` types-list failure mode are
all correct and well-defended. The findings below are mostly about the seam between what the
design _decides_ and what its **Files changed** section will actually _deliver_: three of them
are resolver/compiler plumbing the design either omits or explicitly disclaims, and one is a
premise that a sibling sub-design has since falsified. None challenges the page's product shape.

### 1. The "agent-tool path has no `conversation_id`" premise is now false — the passages built on it are stale

> **Resolved (auto).** A premise falsified by shipped work, with only doc consequences — no decision to make. The four passages (§"Continue in chat", §"broken section", Deviation 2, and the §"Provenance" free-timestamp aside) now describe a linked conversation as the normal case on **both** creation routes, with absence — never-linked / legacy / the sub-second in-flight window — as the exception. The "only populator / only consumer" line is corrected: the `emit-data-parts` backfill is a second populator, the chat panel a second consumer.

The design repeatedly treats a report created through the agent tool path as permanently
link-less, and derives UI behaviour from it:

- "conditional on `conversation_id` being present: reports created through the agent tool path
  have none, and the affordance is then **absent**" (Continue-in-chat, §"Continue in chat is
  owner-only, and conditional").
- "`conversation_id` is populated only by [save-as-report]'s `create-report`; this page is its
  only consumer" (same section).
- "so a report created through the agent tool path has no fix-in-chat affordance either"
  (§"A broken section gets two ways out").
- Deviation 2: "it is absent on reports created through the agent tool path."

All four are contradicted by shipped work. [reports-from-chat](../../reports-from-chat/design.md)
(marked Implemented, PR #170) added an `emit-data-parts` turn-end backfill that sets
`conversation_id` on exactly those agent-authored reports —
`modules/reporting/api/emit-data-parts.yaml:269-292` does the owner-guarded `$set`. The parent
[`design.md`](../design.md) data-model was updated to match ("it is no longer always `null`
there", line 58); the parent even lists the chat panel as a **second consumer** of
`conversation_id`, so "this page is its only consumer" is wrong on that count too.

The design's _mechanism_ is unaffected and still correct — the page should key Continue-in-chat
and fix-in-chat on `conversation_id` being present, and treat absence as no-affordance. What is
stale is the _rationale_: absence is now the rare case (a report never linked, a legacy row, or
the sub-second in-flight window before the turn-end hook fires), not the agent-path default.
Fix: rewrite those four passages so they describe presence as the normal case on both routes and
absence as the exception, and correct the "only populator / only consumer" line. This matters
because the next reader (implementer or `reconcile`) will otherwise gate a now-common affordance
off as if it were exotic.

### 2. `compileReport` needs new inputs the design says it doesn't, and `resolve-report` must return data it doesn't today

> **Resolved (auto).** No fork — the plumbing sourcing is forced. `resolve-report.yaml` is added to Files changed as **this page's own** resolver change (distinct from ownership's shipped read-open + `is_owner`): it returns `created` / `updated` / `owner` / `visibility` plus a resolve-time `_date: now`. `compileReport`'s bullet now names its real new inputs (those document fields + `is_owner`), with "no new inputs" narrowed to what it was ever true of — the catalog/roles the withheld pre-check uses. The §"Provenance" "free" claim is softened to "nearly free: a resolve-time timestamp, not a query."

The **Files changed** entry for `compileReport.js` asserts the change carries "**no new
inputs** — it already takes the catalog and the viewer's roles" (line 107). That parenthetical is
true only of the withheld role pre-check. Two other features on this page need inputs that are
neither in `spec` nor currently passed:

- **The provenance line.** "Who made it, when the spec last changed, when these numbers were
  computed" plus the publisher name come from `created`, `updated`, `owner.name` and
  `visibility` — all **document fields**, and `spec` now holds `{ sections }` only
  ([ownership](../ownership/design.md#the-stored-spec-is-the-validators-output)). `resolve-report`
  today returns only `{ is_owner, blocks }` (`modules/reporting/api/resolve-report.yaml`, final
  `:return`) and passes `compileReport` only `{ spec, results, catalog, roles, endpointId }`
  (`compileReport.js:418`). None of the provenance facts reaches the compiler. And "when these
  numbers were computed" is _not_ on the document at all — it is a resolve-time stamp nothing
  currently produces (no `_date: now` in the resolver), so "it is free, because the page …
  already knows" (§"Provenance is three facts") is not free: it needs the resolver to emit a
  timestamp into the return.
- **Owner-only actions.** The design's own Risks section says "`compileReport` gains an is-owner
  input" (line 142) — a direct contradiction of the "no new inputs" claim in Files changed. The
  non-owner "names who can fix it" copy likewise needs `owner.name` in the compiler.

The gap is that `resolve-report.yaml` is **not in the Files changed list** — line 110 attributes
its only change to [ownership](../ownership/design.md#endpoints), which has already shipped
(read-open + `is_owner`) and did none of the above. So this design owns a `resolve-report`
change it doesn't record: return `created` / `updated` / `owner` / `visibility` / a resolve
timestamp (or a composed provenance object), and thread `is_owner` and the provenance facts into
`compileReport`. Fix: add `resolve-report.yaml` to Files changed with that scope, and correct the
"no new inputs" line to name the ones it does need.

### 3. The invalid-spec whole-report Alert cannot be produced by the file changes listed

> **Resolved.** The owner chose to **collapse the feature, not build the plumbing.** The gap was real, but it exposed that the elaborate recovery (cause-naming Alert + ask-the-assistant + resolver restructure) was being built for a state ownership's loosen-only rule + zero existing data make a **code-bug-only** path — grammar failures only, since catalog drift fails a section, not the spec. So the section is rewritten to the honest minimum: fix the fallback message (_"This report couldn't be loaded"_, a `report.yaml` one-liner) and **log** the failure (a bounded pre-validate `:try`) so we catch the regression. No Alert, no repair loop — a repair loop would blame the user's data for our bug. The richer recovery is explicitly deferred to the day a `spec_version` migration makes stale-but-valid specs a real user-facing state. This shrank finding 2's resolver work too.

§"A spec that no longer validates is not a missing report" correctly diagnoses the mechanism: a
re-validation failure happens in `querySections` inside the resolver's `:for … :in`, which
`controlFor` evaluates before iteration and outside the per-section `:try`, so it **rejects the
whole routine** and the `Dynamic` renders its fallback. The design then wants, instead, a
"whole-report Alert naming the cause … rather than as the missing-report fallback", plus the
resolver logging it.

But a rejected routine reaches no `:return`, so `compileReport` never runs and cannot render that
Alert — and the fallback slot is static and shared with genuine missing/forbidden reports, so it
can't name the cause either. Delivering this needs the resolver **restructured** so the
`validateReportSpec` failure is caught (a `:try` around a pre-validate step, branching the
`:return` to a "spec invalid" marker) and a `:log` added — and then `compileReport` (or the page)
needs a branch that renders the marker as the Alert. Neither the `resolve-report.yaml` change
(finding 2) nor the `compileReport.js` bullet mentions an invalid-spec path; the compiler bullet
lists only section recoveries, the withheld variant, and filter placement. This is the sharpest
gap in the design because it is the exact bug the section exists to kill — an owner told "not
found" about their own broken report — and the change set as written wouldn't move it. Fix: fold
the resolver restructure + log and the compiler's invalid-spec Alert branch into Files changed,
and state where the boundary sits (does the resolver return a typed marker, or does the page's
fallback slot gain a second variant?).

### 4. The withheld-section role pre-check re-implements the engine's gate and can drift into the confusion it exists to remove

> **Resolved (auto).** "One correct way" — no fork. §"A section the viewer's roles deny" now says the pre-check **reuses `validatePipeline`'s `checkCollectionAccess`** (extracting a `requiredRoles(pipeline, catalog)` helper) rather than a hand-rolled base + `$lookup.from` scan, and names the exact drift the scan would cause — missing `$unionWith` / nested `$lookup` in `$facet` / `$graphLookup`, and so classifying a withheld section as broken and dropping the owner into the repair loop the distinction exists to prevent.

§"A section the viewer's roles deny is not a broken section" proposes that `compileReport`, "for
each query section, take the union of catalog `roles` across the base collection and every
`$lookup.from`, compare it against the viewer's roles." That predicate already exists and is the
actual gate: `validatePipeline.js:210-225` (`checkCollectionAccess`) enforces exactly the
union-of-roles rule, and its own comment (`:204-209`) describes it in the same words — but it
runs as the pipeline **walk** encounters each collection, so it covers every collection-bearing
stage, not just top-level `$lookup.from`.

A hand-rolled "base collection + `$lookup.from`" scan in `compileReport` is a second, thinner
implementation of a security-derived classification. If the walk ever touches a collection the
scan misses — `$unionWith`, a `$lookup` nested inside `$facet`, `$graphLookup` — the pre-check
under-counts the required roles, decides the viewer is fine, and the section renders as
**broken** with the owner's two recoveries. That drops the owner into the ask-the-assistant
repair loop over a section that is working-but-withheld — precisely the outcome this whole
decision is written to prevent, now failing silently in the mixed case that is hardest to notice.
This is a "one correct way" problem: the broken/withheld split should be decided by the same code
that decides access. Fix: extract `checkCollectionAccess`'s collection-enumeration (or a
`requiredRoles(pipeline, catalog)` helper beside it) and have the pre-check consume it, so the
two can't diverge — and add a compiler test per stage kind that can hide a `$lookup`.

### 5. Filter placement is the page's one stated defect, yet left fully open — pick the floor now

> **Resolved.** The owner went past the floor to **candidate 3: render each filter beside the sections it drives**, abandoning the single top row. The section is rewritten from open to decided, and Open Questions drops to none. The one sub-question co-location opens — a filter bound to **non-contiguous** sections — is resolved in the design rather than deferred: a filter renders once, above the **first** subscribing section in spec order, and keeps a scope label (the demoted candidate-1 mechanism) only where its binding is split. So the common single-group report needs no label; the rare split report stays honest through one. Files changed gains the `compileReport` co-location work.

§"The filter row says nothing about what it scopes" is, by the design's own account, "the one UX
problem the report page currently has", and it argues "a decision should not wait for a complaint
— by construction the complaint reads as a bug report about filters, not about layout." It then
leaves all three candidates open (Open question 1), on the grounds that the plates don't draw a
multi-group report and the answer "depends on what the rest of this page becomes."

That reasoning justifies not committing to the _large_ fix (candidate 3, filters beside their
sections) — but not leaving the failure in place. Candidate 1 (name the bound sections in the
control's title, `Companies (activities)`) is described as "one line in `compileReport`, no
layout change"; it removes the "looks broken" failure immediately and is forward-compatible with
either richer option. Recommend deciding candidate 1 as the **floor** that ships with this design,
with 2/3 as a later refinement if a real multi-group report argues for it — or, if even that
should wait, saying explicitly that the page ships with the known "looks-broken" failure until the
multi-group demo exists, so the deferral is a recorded choice rather than an open question. Either
is a decision; the current state is neither. (This one is genuinely the author's call — the
finding is that it should be _made_, not which way.)
