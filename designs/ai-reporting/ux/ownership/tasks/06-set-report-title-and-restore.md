# Task 6: `set-report-title` and `restore-report` — two owner-only writes, one stamped and one not

## Context

Two small endpoints, paired because they share an authorization posture (owner-only, matched server-side in the update filter) and differ on exactly one thing worth seeing side by side: whether they stamp `updated`.

**The repo rule is a change stamp on every write, and reporting is the one place it is narrowed** — because the list sorts on `updated.timestamp`, so the stamp is not just an audit record, it is the list's order.

- **`set-report-title` stamps `updated`.** A rename changes what the report is.
- **`restore-report` does not.** Publishing and restoring change who may see a report, not what it is.

**Restore is the case worth defending, because not stamping it has a visible cost:** the list orders by `updated.timestamp`, so a report last edited in March and restored today returns to its March position rather than the top. Stamping it would fix the position and break something better — `report-page`'s provenance line states **when the spec last changed**, and a restore changes nothing about the spec, so the stamp would make that line assert an edit that never happened. A truthful provenance line is worth more than a sort position, particularly on a report published to other people. The cost is paid where it arises instead: the recovery page hands the user the restored report rather than returning them to a list to find it, which is `reports-list`'s to build.

**Restore always writes `visibility: "private"`** in the same update that clears the marker. Silently re-publishing something deleted months ago would hand it back to the whole app before anyone re-read the numbers. Republishing is one deliberate click afterwards. (Reversing this — restoring the previous audience exactly — is a one-line change if a real case argues for it, and there is no field recording the previous audience precisely because nothing needs one yet.)

**There is no purge endpoint**, and adding one would be the single irreversible act in an otherwise recoverable system. Nothing in this module hard-deletes.

`delete-report` already exists and is correct — owner-scoped, writes the `deleted` change stamp, and excludes already-deleted documents so a repeat delete reports 0 modified rather than overwriting the original who/when. **Do not touch it.** `restore-report` is its inverse and should read as one.

## Interfaces

- **Consumes:** the document shape from task 3; `defaults/change_stamp.yaml`.
- **Produces:** `set-report-title` (`{ report_id, title }`) and `restore-report` (`{ report_id }`). `reports-list` consumes both — the rename inline on a row, the restore from the recovery page.

## Task

### `modules/ai-reporting/api/set-report-title.yaml`

`type: Api`. Reject an unauthenticated caller. Validate `title` is a non-empty string within the same cap the validator applies to a spec title (`MAX_LABEL_LENGTH`, from `plugins/modules-mongodb-plugins/src/analytics/constants.js`) — the two must agree, because a title that a rename accepts and the validator would reject is a report whose next spec write fails. `MongoDBUpdateOne`:

```yaml
filter:
  _id:
    _payload: report_id
  owner.user_id:
    _user: id
  deleted.timestamp:
    $exists: false
update:
  $set:
    title:
      _payload: title
    updated:
      _ref: defaults/change_stamp.yaml
```

`title` is a **document field**, so this endpoint writes one field and never touches the spec — which is the whole reason the parent design moved `title` out of `spec`. Do not write `spec.title`.

### `modules/ai-reporting/api/restore-report.yaml`

`type: Api`. Reject an unauthenticated caller. `MongoDBUpdateOne`, owner-matched, and the inverse stamp predicate — only a report that _is_ deleted can be restored:

```yaml
filter:
  _id:
    _payload: report_id
  owner.user_id:
    _user: id
  deleted.timestamp:
    $exists: true
update:
  $set:
    deleted: null
    visibility: private
```

`deleted: null` rather than `$unset` — the field is initialised `null` on insert so live documents have a consistent shape, and `docs/shared/soft-delete.md`'s predicate treats a document as live whether `deleted` is absent, null, or an object without a timestamp. Both work; `null` matches what `generate-report` writes.

**No change stamp** — carry a comment saying so and why, because the repo rule is the opposite and the next reader will assume an omission. Point at `report-page`'s provenance line as the reason.

Register both endpoints in `modules/ai-reporting/module.lowdefy.yaml` — a `_ref` under `api:` and an `exports.api` entry each.

## Acceptance Criteria

`apps/demo/e2e/ai-reporting/report-title-restore.spec.js`:

- **Owner renames** — `title` changes and `updated.timestamp` moves forward.
- **Non-owner cannot rename** a report they can nonetheless read (seed it `visibility: "shared"`, act as the second user) — rejected or zero modified, and `title` unchanged. Asserting this against a _shared_ report is the point: it proves readability is not writability.
- An empty or over-cap `title` is rejected.
- **Renaming does not touch the spec** — assert `spec` is byte-identical before and after.
- **Owner restores** — `deleted` becomes `null` and the report reappears in the `mine` scope.
- **Restore forces `visibility: "private"`** — seed a report that was `shared` when deleted, restore it, assert `private`.
- **Restore does not stamp `updated`** — assert `updated` is byte-identical before and after. This is the assertion that stops someone "fixing" the sort position later without reading why.
- **Non-owner cannot restore**, including a `share_roles` holder — restore is owner-only; the role's only extra power is unpublish.
- **Restoring a live report is a no-op** — zero modified, because the filter requires the stamp to be present.

Plus: `pnpm ldf:b` from `apps/demo` succeeds. Specs are written and reviewable; running them is task 11's step.

## Files

- `modules/ai-reporting/api/set-report-title.yaml` — create
- `modules/ai-reporting/api/restore-report.yaml` — create
- `modules/ai-reporting/module.lowdefy.yaml` — modify — two `_ref`s under `api:` and two `exports.api` entries
- `apps/demo/e2e/ai-reporting/report-title-restore.spec.js` — create

## Notes

- **The recovery surface is not this task's.** `list-reports` with `scope: deleted` is the read (task 4), and whether that is a quiet page or a fourth list tab is `reports-list`'s decision. What belongs here is that the read is **still owner-matched**: you never see anyone else's deleted reports, including ones that were published to you.
- **Do not add a `set-report-description` endpoint.** The design gives the owner rename, drop-a-section and duplicate, and nothing else — editing a report's sections outside chat is a non-goal, and description editing has no caller.
- Both endpoints are single `MongoDBUpdateOne` calls with the owner match **in the filter**, not in an `:if` before it. That is the pattern `delete-report` already uses: one round trip, and the authorization is structurally inseparable from the write.
