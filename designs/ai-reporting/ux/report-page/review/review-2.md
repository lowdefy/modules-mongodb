# Review 2

Re-review after the round-1 resolutions. All five review-1 findings are settled and
not revisited here. The design is in good shape — the provenance/timestamp plumbing is
now sourced correctly, the invalid-spec recovery is collapsed to its honest minimum, and
filter placement is decided. Two findings remain, both in the resolution edits themselves:
one is a label that the code's own change-stamp discipline contradicts, the other is a trap
hiding inside the word "extract" in the withheld-section fix. One thing I went to check —
whether the pre-check's catalog could differ from the gate's — turned out fine and is noted
at the end so it isn't re-checked next round.

### 1. "When the spec last changed" is not what `updated` records — a rename bumps it too

> **Resolved.** Owner picked the cheap, honest branch: the middle provenance fact is **"last edited," not "spec changed."** §"Provenance is three facts" now labels it that way and reads it off `updated` as before — which is correct, because `updated` already means "what the report is changed" in the code: it bumps on spec writes (drop-a-section) and renames, and deliberately skips favourite / publish-unpublish / restore / the `conversation_id` backfill. So "last edited" is exactly what the field records; no second timestamp, no field split. One code follow-up noted in the design: `restore-report.yaml`'s no-stamp comment still says the line means "when the SPEC last changed" — the no-stamp decision holds (a restore isn't an edit), but the stated reason should reword to "last edited, which a restore does not touch." The rejected branch — keep "spec changed" literally — would have cost a second timestamp for a "renamed vs re-analysed" distinction a shared-report viewer doesn't want drawn.

§"Provenance is three facts" names the middle fact "**when the spec last changed**" (heading
and line 29: "when-the-spec-changed are document fields the resolver now returns"), and
[Files changed](../design.md) maps it to the document's `updated` field (line 104). But
`updated` is not a spec-change stamp — it is a "what the report is" stamp, and the module has
already drawn that line deliberately and inconsistently:

- `set-report-title.yaml` **stamps `updated` on a pure rename**, and its own comment says why:
  _"a rename changes what the report is, so it belongs at the top of the list **and on the
  report page's provenance line**."_ Yet the same file states plainly that `title` is a
  document field that _"never touches the spec — which is the whole reason title lives outside
  `spec`."_ So a rename bumps the field this design will render as "spec last changed", while
  changing no spec.
- `restore-report.yaml`'s comment describes the very same UI element the opposite way:
  _"the report page's provenance line states when the SPEC last changed, which a restore does
  not touch. Stamping here would make that line assert an edit that never happened."_
- `set-report-favourite.yaml`, `set-report-visibility.yaml`, and the `emit-data-parts`
  `conversation_id` backfill (`emit-data-parts.yaml:260`) all deliberately **don't** stamp.
- `remove-report-section.yaml:157` (drop-a-section) **does** — and that one genuinely is a
  spec write.

So two shipped comments disagree about what the line means: `set-report-title` treats a rename
as provenance-worthy and stamps for it; `restore-report` calls the same line "when the SPEC
last changed" and refuses to stamp on that ground. The design inherits both and asserts the
`restore-report` reading in its heading — which the `set-report-title` write already violates.
The root cause is that `updated` carries two jobs at once: it is the **reports-list sort key**
(every "no stamp" comment cites `updated.timestamp: -1`) _and_ the provenance timestamp this
page renders. A rename must bump the sort key (it belongs at the top of the list), but under
the design's label it then lies on the report page.

Fix — a real fork, and the author's call:

- **Relabel the fact** to "Updated" / "Last edited" (honest for rename + spec write + drop-
  section alike), and correct the heading and line 29 wording. Cheapest, and it makes
  `restore-report`'s comment the outlier to fix rather than the spec.
- **Or keep "spec last changed" literally** — then `set-report-title` must stop feeding this
  line, which means the provenance timestamp can no longer be `updated` (that field must keep
  bumping on rename for the list sort). That splits one field into two, or derives a spec-
  change time some other way. More surface, for a distinction ("you renamed it" vs "the spec
  changed") a viewer may not even want drawn.

Either is a decision; the current design states the strict reading while pointing at a field
that doesn't honour it.

### 2. There is no collection-enumeration to "extract" from `checkCollectionAccess` — the safe reuse is a shared walk, not a helper beside it

> **Resolved (auto).** No fork — a wording tightening inside the already-settled #4 decision. §"A section the viewer's roles deny" no longer says "extract the collection-enumeration (or a `requiredRoles` helper beside it)". It now specifies the one non-drifting mechanism: the validator's walk records each collection it checks into a `touchedCollections` set at its single call site, and the withheld pre-check reads its verdict off that one accumulated set. The `requiredRoles(...)` helper that re-walks is folded explicitly into the trap warning alongside the hand-rolled scan — a second walk drifts, and the stage it forgets (`$unionWith` / nested `$lookup` / `$graphLookup`) is exactly the misclassification #4 exists to prevent.

§"A section the viewer's roles deny" resolves review-1 #4 by reusing the engine's gate:
_"extract the collection-enumeration (**or a `requiredRoles(pipeline, catalog)` helper beside
it**) so the compiler decides withheld-vs-broken with the same code the gate enforces with."_
The intent is right and settled. The mechanism named in the parenthetical quietly reopens the
exact drift #4 was written to close.

`checkCollectionAccess` (`validatePipeline.js:210-225`) is not an enumerator. It is a
**pointwise, throwing** check — `checkCollectionAccess(name, ctx)`, and on a role miss it calls
`fail()`, which throws out of the walk. It is invoked once per collection-bearing stage _as the
walk reaches that stage_. The "every collection the pipeline walk touches" set (`$lookup.from`,
`$unionWith`, a `$lookup` nested in `$facet`, `$graphLookup`, sub-pipelines) exists only as the
sequence of call sites during the walk — there is no function that returns "the collections this
pipeline touches" to lift out and reuse. The role predicate itself is trivially pure
(`const required = ctx.catalog[name]?.roles ?? []; required.length > 0 && !required.some(...)`);
what carries the correctness is the enumeration, and that is the part that doesn't exist yet.

So "a `requiredRoles(pipeline, catalog)` helper beside it" is not an extraction — it is a
**second walk** that has to re-derive the touched-collection set, and any stage it forgets is
precisely the `$unionWith` / nested-`$lookup` / `$graphLookup` miss the design's own paragraph
warns produces a section misclassified as **broken**. The parenthetical grants the trap the rest
of the sentence forbids.

The non-drifting reuse is the first branch, made concrete: have the validator's walk
**accumulate** each collection it passes to `checkCollectionAccess` into `ctx` (a
`ctx.touchedCollections` set, populated at the one call site that already visits every stage),
and have the withheld pre-check read the required-roles verdict off that single accumulated set.
One enumeration, shared by construction, so the gate and the classifier cannot diverge — which
is the whole point of "one correct way." Fix: drop the "(or a helper beside it)" alternative and
state that the pre-check consumes the collections the validator's walk records, not a set it
re-computes. Then the per-stage test the design already asks for is guarding one walk, not
policing two for agreement.

---

**Checked, holds, not a finding — recorded so it isn't re-litigated:** I checked whether the
catalog `compileReport` uses for the withheld pre-check (`_module.var: catalog`, passed in the
resolver's `:return`) could differ from the catalog the real gate validates against — because
reusing the exact predicate over a different catalog would still misclassify. It can't:
`connections/reporting-data.yaml:13` binds the `AnalyticsPipeline` connection's catalog to the
same `_module.var: catalog`, and that file's comment states an app "cannot substitute a trimmed
or stale one." Same catalog, same var, one source. The pre-check and the gate see identical
role gates.
