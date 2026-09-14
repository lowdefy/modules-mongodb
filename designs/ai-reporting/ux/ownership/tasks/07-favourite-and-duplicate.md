# Task 7: `set-report-favourite` and `duplicate-report` — the readable-report check

## Context

Non-owners get **read-plus-duplicate**: open, favourite, download a section, duplicate — and the edit actions are _absent_, not disabled. These two endpoints are the write half of that, and they are paired because they share the one authorization posture that is neither owner-only nor role-gated.

**"Readable-report check" means the same predicate `resolve-report` uses** (task 3): not deleted, and owned by the caller **or** `visibility: "shared"`. Favourite and duplicate use it because both are read-side acts on something you are already entitled to see. Spell it identically in all three places — a reader that disagreed with another would not error, it would silently return nothing.

**Favourites are per-user.** A ★ on a shared report must not be everyone's ★, so they are stored as `favourite_of: [user_id]` on the report document and projected to a boolean for the caller. They are a read-side marker, so they work on reports you do not own, and they drive both the Favourites scope and the default sort. The array is the right shape at module scale — the Favourites query is a single `favourite_of: <user_id>` match. If an app ever has hundreds of users favouriting one report the array becomes a hot document and the answer is a `report_favourites` join collection; that is a mechanical swap behind these same two endpoints, and it is **known but unbuilt** — do not build it.

**A favourite is not a grant.** Because a non-owner may favourite a shared report, the marker outlives the sharing that allowed it — which is why the Favourites scope is a `favourite_of` match **and** the readable predicate, never the match alone (task 4). Nothing `$pull`s on unpublish or delete: the read filters instead, so the marker sits dormant and works again if the report is republished.

**Duplicate is the escape hatch that makes read-only comfortable.** Rather than a request-access dance, copy a shared report into your own and change it freely. The copy is always private and owned by the copier, with `favourite_of` reset; the original is untouched.

**Neither endpoint stamps `updated`.** A favourite is one user's read-side marker, and stamping it would jump the report to the top of _every_ user's list each time anyone starred it. `duplicate-report` writes a new document, which gets its own `created` and `updated` on insert.

## Interfaces

- **Consumes:** the readable-report predicate as spelled in `modules/ai-reporting/api/resolve-report.yaml` (task 3); the document shape from task 3; `defaults/owner.yaml` and `defaults/change_stamp.yaml`.
- **Produces:** `set-report-favourite` (`{ report_id, favourite }`) and `duplicate-report` (`{ report_id }` → `{ ok, report_id, url }`). `reports-list` and `report-page` consume both.

## Task

### `modules/ai-reporting/api/set-report-favourite.yaml`

`type: Api`. Reject an unauthenticated caller. Validate `favourite` is a boolean — reject anything else rather than coercing, since a truthy string would silently star a report the caller meant to unstar.

`MongoDBUpdateOne`, filter = the readable predicate:

```yaml
filter:
  _id:
    _payload: report_id
  deleted.timestamp:
    $exists: false
  $or:
    - owner.user_id:
        _user: id
    - visibility: shared
```

Update is `$addToSet` when `favourite: true`, `$pull` when false — chosen with `_if` between two static updates, **never `$set` on the whole array**, so two users starring the same report concurrently cannot clobber each other. `$addToSet` also makes a repeat star idempotent for free.

**No change stamp.** Carry the comment saying why, and name the failure it prevents: a stamp here would reorder every user's list whenever anyone starred anything.

### `modules/ai-reporting/api/duplicate-report.yaml`

`type: Api`. Reject an unauthenticated caller. Read the source with `MongoDBFindOne` under the **same readable predicate**, reject when not found, then `MongoDBInsertOne`:

```yaml
doc:
  _id:
    _uuid: true
  owner:
    _ref: defaults/owner.yaml # the COPIER, not the original owner
  title:
    _step: load_source.title
  description:
    _step: load_source.description
  spec:
    _step: load_source.spec # copied verbatim, sections and ids included
  spec_version:
    _step: load_source.spec_version # COPIED, not re-stamped — see below
  visibility: private
  favourite_of: []
  conversation_id: null # never inherited — see below
  deleted: null
  created:
    _ref: defaults/change_stamp.yaml
  updated:
    _ref: defaults/change_stamp.yaml
```

Return `{ ok: true, report_id, url }` in the same shape `generate-report` returns, so a caller can navigate straight to the copy.

Two of those lines are decisions, and both need a comment in the file:

**`spec_version` is copied rather than written as `1`.** The copy carries the original's spec verbatim, so stamping it with the current constant would mislabel an older spec as the current grammar — reintroducing, at the one endpoint that clones a spec instead of authoring one, exactly the "an existing document gives no way to tell which grammar it was written against" problem the field exists to prevent.

**`conversation_id` is written `null`, and this is a confidentiality requirement rather than tidiness.** The copier owns the copy, so `report-page`'s owner-only "Continue in chat" would render and point at the **original author's conversation** — the transcript that page is explicit about not exposing. The copy gets its own `created` stamp for the same reason in reverse: inheriting one would put the original author's name on the copier's provenance line.

Register both endpoints in `modules/ai-reporting/module.lowdefy.yaml`.

## Acceptance Criteria

`apps/demo/e2e/ai-reporting/report-favourite-duplicate.spec.js`:

- **Owner favourites and unfavourites** — `favourite_of` gains then loses the caller's id.
- **Non-owner favourites a shared report** — succeeds; `favourite_of` holds the non-owner's id and the owner's is untouched. This is the per-user half.
- **Non-owner cannot favourite a private report** — zero modified; `favourite_of` unchanged.
- **Nobody can favourite a deleted report** — zero modified.
- **A repeat favourite is idempotent** — `favourite_of` holds the id once, not twice.
- **Favouriting does not stamp `updated`** — byte-identical before and after.
- **Unpublishing does not clear the marker** — favourite a shared report as a non-owner, unpublish it, assert the id is still in `favourite_of` and the report is absent from that user's `favourites` scope (task 4 asserts the scope side; assert the document side here).
- **Non-owner duplicates a shared report** — a new document exists with: the copier as `owner`, `visibility: "private"`, `favourite_of: []`, `conversation_id: null`, its own `created`/`updated` naming the copier, `spec` deep-equal to the original's, and `spec_version` equal to the **original's** value. Seed the original with a `spec_version` other than `1` so "copied" and "re-stamped" are distinguishable — a spec_version of `1` on both would pass either implementation.
- **The original is untouched** by the duplicate — assert the source document byte-identical before and after.
- **Non-owner cannot duplicate a private report**, and nobody can duplicate a deleted one — rejected.
- **The copy resolves** — the new report opens for its new owner, which is what proves the copied spec is valid input to the validator (task 1's idempotency property, exercised through the write path).

Plus: `pnpm ldf:b` from `apps/demo` succeeds. Specs are written and reviewable; running them is task 11's step.

## Files

- `modules/ai-reporting/api/set-report-favourite.yaml` — create
- `modules/ai-reporting/api/duplicate-report.yaml` — create
- `modules/ai-reporting/module.lowdefy.yaml` — modify — two `_ref`s under `api:` and two `exports.api` entries
- `apps/demo/e2e/ai-reporting/report-favourite-duplicate.spec.js` — create

## Notes

- **The readable predicate is now spelled in three files** (`resolve-report`, these two). The design describes it as "the same predicate `resolve-report` uses" and does not ask for a shared fragment. Extracting one — `defaults/readable_report.yaml`, since the predicate needs nothing from the payload — would make "the same" mechanical rather than remembered, which is what this repo's "one correct way" principle argues for. It is **not** mandated by the design; if you extract it, do all three sites in this task so no site is left spelling it inline, and say so in the PR.
- **Do not re-run `validateReportSpec` in `duplicate-report`.** The source document already holds validated output, and re-validating on the copy path would make an unrelated catalog change able to block a duplicate — the same argument that keeps the catalog out of `remove-report-section` (task 8). The copy's spec is proven valid by the copy _resolving_, which is what the last acceptance criterion asserts.
- **`favourite_of` must never appear in a response.** Task 4 projects it out of the list; make sure neither endpoint here returns the array or a count of it. A caller learning who else favourited a report is exactly what "projected to a boolean for the caller" exists to prevent.
