# Task 8: `remove-report-section` — the one spec write, and it has to cascade

## Context

`report-page` gives a report's owner two ways out of a failing section: ask the assistant to fix it, or drop it. **Only the second is a write.** Asking the assistant is navigation — it opens the source conversation with the failing section named — so it is gated exactly like continue-in-chat and writes nothing. What the assistant then produces is a **new** report, because re-deriving a spec is the assistant's job and editing a report's sections outside chat is a non-goal in both the parent design and `report-page`. There is no update-in-place path for a spec and none is wanted.

Dropping a section is therefore **the only spec write in the module**. Four things force this endpoint's shape.

**It cannot be a `$pull`.** `validateReportSpec` enforces filter bindings in both directions (`validateReportSpec.js:456-512`): every filter section must be bound by at least one section, and no section may name a filter field the report does not have. So removing a section can invalidate the spec two ways — drop a filter and every remaining section still listing its field fails (`:473-478`); drop the last section bound to a filter and that filter fails (`:491-494`). A naive removal produces a document its own validator rejects, which then breaks the report on the **next resolve** rather than at the moment of the edit.

**It cascades silently, rather than refusing.** The alternative is rejecting the drop with "unbind the filter first", and the person clicking Remove has never seen a spec, has no concept of a binding, and no way to act on that message.

**It refuses one thing: emptying the report.** `validateReportSpec` requires a non-empty `sections` array (`:149-151`), and the cascade makes zero sections easy to reach rather than obscure — a report of one chart plus the filter that drives it collapses in a single click, because dropping the chart orphans the filter and the cascade takes it too. Relaxing the validator to accept an empty report is the alternative and it is worse: it loosens an invariant every spec writer shares so that one endpoint can skip a guard, and it would need an empty state on the report page that nothing else asks for.

**It has to be server-side, because the client never holds the spec.** `resolve-report` returns compiled blocks, not the spec — the pipelines stay server-side deliberately — so "post the spec minus one section" is not available without shipping the spec to the browser, which would be a widening for one edit action. This is also why the endpoint is narrow rather than a general `set-report-spec`: nothing else needs one, and a general spec writer would add a third author of report specs beside the agent and the save sheet.

**Section ids are durable, so the call needs no guard.** Task 1 made `validateReportSpec` assign each section an id and the writers persist it, so a `section_id` names one section for the life of the report rather than the position it happened to occupy when the caller last read it. That makes the payload `{ report_id, section_id }` and removes the whole class of stale-position bug rather than guarding it: a double-click sends the same id twice, the first call removes that section, the second finds nothing to remove and is rejected. Nothing slides into a slot, because there are no slots. **No document predates this** — no app has a saved report yet, so every report that will ever exist is written by the new insert path and there is no population carrying positional ids.

This replaces a guard an earlier revision carried — `{ report_id, section_id, expected_type, expected_label }`, rejecting when the section at that position was not the one described. Dropped with it: the two `expected_*` fields, the guard-mismatch rejection, and its e2e case. **Do not implement them.**

## Interfaces

- **Consumes:** durable section ids and the idempotency property from task 1; the document shape and the composed-spec pattern from task 3 (`{ title, description, sections }` assembled from document fields before validating).
- **Produces:** `remove-report-section` with payload `{ report_id, section_id }`. `report-page` is the only consumer.

## Task

Create `modules/ai-reporting/api/remove-report-section.yaml`, `type: Api`. Owner-only. The routine is read → remove → cascade → revalidate → write.

1. Reject an unauthenticated caller.
2. `MongoDBFindOne` the report, **owner-matched** and not-deleted. Reject when not found.
3. Reject when `section_id` names no section on the report. This is the double-click case and the not-found case in one, and its message should say the section is no longer on the report.
4. **Remove and cascade.** Two rules, and both must run:
   - Removing a **filter** section strips its `field` from every remaining section's `filterBy`.
   - Removing the last section bound to a filter removes **that filter section too**. Compute this after the primary removal, over the surviving sections: any filter section whose `field` appears in no surviving section's `filterBy` goes.
     The cascade is not recursive beyond that — a filter section carries no `filterBy` of its own (it is not on the filter branch's allowed-key list, `validateReportSpec.js:288-305`), so removing a filter can never orphan another filter.
5. **Reject when the post-cascade result is empty**, naming the act the user actually wants: _this is the report's only section — delete the report instead_, with the path to `delete-report`. This is the one rejection the endpoint has, and unlike "unbind the filter first" it names a choice the user can act on.
6. **Revalidate, without the catalog:**

   ```yaml
   - :set_state:
       validated:
         _analytics.validateReportSpec:
           spec:
             title:
               _step: load_report.title
             description:
               _step: load_report.description
             sections: … the cascaded sections …
           roles:
             _user: roles
   ```

   No `catalog`, and the reasoning only runs one way. With it, every pipeline goes through `validatePipeline` **and** a select/multiselect filter must have an options source (`validateReportSpec.js:496-511`) — so a filter whose only options source was catalog enum `values` for a field the app has since stopped declaring would make the drop fail with `filter "region" has no options`, a refusal about something other than the section being dropped. `AnalyticsPipeline` gates every pipeline per viewer at resolve regardless, so the catalog buys this endpoint nothing it does not already have. Same posture `resolve-report` takes, for the same reason.

   Revalidating at all is not belt-and-braces: it is what turns a cascade bug into a rejected call instead of a report that breaks on next open.

7. `MongoDBUpdateOne`, owner-matched and not-deleted, `$set: { spec: { sections: <validated sections> }, updated: <change stamp> }`. **This one stamps** — it is a spec change.
8. Return `{ ok: true }`.

The cascade itself is list manipulation over `sections`. Prefer operators; a `_js` step is acceptable here if operator chaining gets deeply nested, since the two-rule cascade over an array of objects is exactly the case the repo's guidance carves out — but keep the embedded JS as simple as possible and keep the two rules visibly separate.

Register the endpoint in `modules/ai-reporting/module.lowdefy.yaml`.

## Acceptance Criteria

`apps/demo/e2e/ai-reporting/report-remove-section.spec.js`. **The two cascade cases are the point — a test that only drops a standalone KPI proves nothing:**

- **Dropping a filter section** — every remaining section's `filterBy` no longer names its field, and **the report still resolves afterwards**.
- **Dropping the last section bound to a filter** — that filter section is gone too, and the report still resolves.
- **Dropping a standalone section** (a markdown or a KPI bound to nothing) — only it is removed; every other section byte-identical.
- **Refusal: a one-chart-one-filter report** — dropping the chart would empty the spec after the cascade, so the call is rejected and the document is unchanged. Assert the message names deleting the report.
- **Refusal: a repeated removal** — two calls carrying the same `section_id`; the second is rejected because that id is no longer on the report, and the report is untouched. (Under positional ids this was a "stale position" case where the second call would remove whatever had slid into the slot; durable ids make it a plain not-found.)
- **Non-owner cannot remove a section** from a report they can read — seed it `visibility: "shared"`, act as the second user, assert rejected and the spec unchanged.
- **Nobody can remove a section from a deleted report.**
- **The write stamps `updated`** — `updated.timestamp` moves forward, unlike favourite / visibility / restore.
- **Surviving sections keep their ids** — assert the removed section's id is gone and every other id is exactly what it was. This is the durable-id property, and it is what makes a second removal address the section the caller meant.

Plus: `pnpm ldf:b` from `apps/demo` succeeds. Specs are written and reviewable; running them is task 11's step.

## Files

- `modules/ai-reporting/api/remove-report-section.yaml` — create
- `modules/ai-reporting/module.lowdefy.yaml` — modify — `_ref` under `api:` and an `exports.api` entry
- `apps/demo/e2e/ai-reporting/report-remove-section.spec.js` — create

## Notes

- **Do not add an `expected_type` / `expected_label` guard**, and do not add a positional fallback for a section without an id. Every report is written by the new insert path, so every section has one; a fallback would be dead code guarding a population that does not exist.
- **Do not add a general `set-report-spec` endpoint**, an add-section endpoint, or a reorder endpoint. This is the only spec write, deliberately.
- **Do not relax `validateReportSpec`'s non-empty `sections` requirement.** The refusal in step 5 exists precisely so that invariant can stay.
- **"Ask the assistant to fix a section" is not an endpoint.** It is navigation into the author's conversation with the section named, gated like continue-in-chat, and it belongs to `report-page`. Nothing to build here.
