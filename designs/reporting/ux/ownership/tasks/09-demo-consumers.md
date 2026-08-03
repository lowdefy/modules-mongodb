# Task 9: Demo consumers — `share_roles`, two demo users, and seeded reports for every scope

## Context

This sub-design ships no page, so its demo consumer is not a screen — it is the **shared fixture set the four UI sub-designs all build on**, which is why the design seeds it here once rather than letting each surface invent its own. `reports-list`, `report-page` and `save-as-report` are all built against this substrate.

Three things are needed, and each exists to make a specific behaviour observable rather than merely present:

- **Seeded reports covering private, shared and favourited, with at least one owned by a second user** — so the non-owner view (read-plus-duplicate, absent edit actions, "Published by") is actually exercised. A demo where every report belongs to the signed-in user cannot show any of it.
- **`share_roles` set on the demo module entry, and a demo user holding the role plus one who does not** — so the publish gate is demonstrable in both directions. This is also what task 5's e2e role matrix seeds against.
- **At least one soft-deleted report** — so the recovery page renders with a real stamp rather than an empty state.

The demo's existing reporting seed is `apps/demo/api/reporting-seed-example-report.yaml`, driven by a button on `apps/demo/pages/reporting/reporting-demo.yaml`. It is idempotent — a deterministic per-user `_id` is cleared then reinserted, so the report keeps a stable URL across re-seeds and never duplicates — and it currently writes the spec **raw**, with a comment saying it does not need to run `validateReportSpec` because resolve-time revalidation is the guarantee. **That comment is now wrong**: the store holds the validator's output, so a raw-seeded report is a document in the old shape.

The demo module entry lives at `apps/demo/modules.yaml:68-80`, with its vars in `apps/demo/modules/reporting/vars.yaml`.

## Interfaces

- **Consumes:** `share_roles` declared in the manifest (task 2); the document shape from task 3; `set-report-visibility` (task 5) as the thing the role holder exercises.
- **Produces:** a seeded fixture set every later UI sub-design and task 11's life-cycle spec build against.

## Task

### 1. `share_roles` on the demo module entry

Add it to `apps/demo/modules/reporting/vars.yaml`, set to a role the demo's auth config can actually grant. Check what roles the demo already issues (`apps/demo/lowdefy.yaml`'s `auth` section and any `userFields` mapping) and reuse one rather than inventing a role nothing grants — a `share_roles` naming a role no demo user holds makes publishing untestable by hand, which defeats the point.

If the demo has no role machinery to hand, add the minimum: two demo users, one whose `roles` includes the publishing role and one whose does not. The e2e specs set their own users through `ldf.user(userObj)`, so this is for **manual** exploration of the demo, which is the half e2e cannot cover.

### 2. Bring the existing seed onto the new shape

Update `apps/demo/api/reporting-seed-example-report.yaml` so the document it writes matches what `generate-report` now writes:

- Run the payload through `_analytics.validateReportSpec` into routine state and store `spec: { sections: … }` from the output, with `title` and `description` as document fields. This also makes the seed a **working reference** for the new insert shape rather than a second, divergent one.
- Add `spec_version: 1`, `visibility: "private"`, `favourite_of: []`.
- **Rewrite the header comment.** The "Stored raw — … the seed does not (need to) run `validateReportSpec` here" paragraph is now false in both halves: the seed does run it, and the reason is not safety but that the store holds normalized output.

Keep everything else about the seed as it is — the deterministic per-user `_id`, the idempotent clear-then-insert, and the long comment cataloguing which capability each section exercises. That comment is the most useful thing in the file.

### 3. Seed the ownership fixture set

Extend the demo's reporting seed surface so one action produces the whole substrate. Either extend `reporting-seed-example-report.yaml` or add a sibling seed endpoint alongside it — a sibling is cleaner, since the example report is about the _presentation contract_ and this is about _ownership_, and mixing them makes both comments harder to read. Register it in `apps/demo/lowdefy.yaml`'s `api:` list and give it a button on `apps/demo/pages/reporting/reporting-demo.yaml` beside the existing seed buttons.

The set, all with deterministic ids so re-seeding is idempotent:

| Fixture                                                    | Why it exists                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Private, owned by the signed-in user                       | The `mine`-only baseline                                                     |
| Shared, owned by the signed-in user                        | Proves publishing does not remove a report from Mine                         |
| Shared, owned by a **second user**                         | The non-owner view: read-plus-duplicate, absent edit actions, "Published by" |
| Private, owned by a second user                            | The `all` scope's negative case — must never be visible                      |
| Favourited by the signed-in user, owned by the second user | Favourites working on a report you do not own                                |
| Soft-deleted, owned by the signed-in user                  | The recovery page with a real `deleted` stamp                                |

Give every fixture a real `spec` — reuse the example report's sections, or a trimmed version — so each one **opens**. A fixture that lists but 404s on open is worse than no fixture, because it looks like a module bug.

The second user needs a stable identity: a fixed `user_id` and `name` in `owner`, and the same values in `created.user` so the provenance line reads coherently. It does not need to be a user the demo can sign in as — for the non-owner _view_ what matters is that the signed-in user is not the owner.

## Acceptance Criteria

- `pnpm ldf:b` from `apps/demo` succeeds.
- The seed endpoint(s) are registered in `apps/demo/lowdefy.yaml` under `api:` and reachable from a button on the reporting demo page. An API file that isn't referenced there won't be loaded.
- Every seeded fixture is a document in the current shape: `spec: { sections }` with ids on every section, `title` / `description` as document fields, `spec_version`, `visibility`, `favourite_of`, `deleted`, both change stamps, `owner: { user_id, name }`.
- Re-running the seed twice produces the same document count — the clear-then-insert is per-fixture idempotent, not append-only.
- Every fixture resolves: opening each one renders rather than falling back to "Report not found".
- The rewritten seed comment no longer claims the spec is stored raw.

## Files

- `apps/demo/modules/reporting/vars.yaml` — modify — `share_roles`
- `apps/demo/api/reporting-seed-example-report.yaml` — modify — validated output, the three new fields, rewritten header comment
- `apps/demo/api/reporting-seed-ownership.yaml` — create — the six-fixture ownership substrate (or fold into the file above, if you take that route)
- `apps/demo/lowdefy.yaml` — modify — register the new seed under `api:`
- `apps/demo/pages/reporting/reporting-demo.yaml` — modify — a button for the new seed
- `apps/demo/modules/reporting/vars.yaml` and any demo auth config touched for the two-user role setup — modify

## Notes

- **Seeding writes documents, but it does not close the "before reports exist" window.** The e2e fixture clears every non-system collection after each test (`@lowdefy/community-plugin-e2e-mdb`'s `mdb` fixture), and the demo's own seed is clear-then-insert, so nothing here creates a population that would need migrating. The window closes when a real consumer app generates its first report.
- **Do not seed through the endpoints.** The seed writes documents directly, which is what makes it independent of the endpoints' authorization — a seed that had to publish through `set-report-visibility` could not create a report owned by a second user.
- **Do not add pages.** This sub-design ships no UI; the list and report pages exist already and stay as they are until `reports-list` and `report-page` are built. The fixtures are for those tasks to build against.
