# Task 10: Document ownership and the expected indexes; fix the changeset record

## Context

Two pieces of paperwork, both describing behaviour that exists by the time this task runs.

**Docs.** `docs/` is the source of truth for consumer-observable authoring behaviour. `docs/ai-reporting/` currently holds `index.md`, two concepts pages (`open-query-engine.md`, `implementation-walkthrough.md`), two how-to guides, and three reference pages (`catalog.md`, `presentation-contract.md`, the generated `vars.md`). Nothing there tells a consumer that reports have an audience, a life cycle, or a set of indexes the host app must create.

**Indexes are the host app's to create, and this module's to document.** Reporting owns these two collections rather than querying the app's, so it is the only party in a position to say what they need indexing on — and after task 4's rewrite `list-reports` carries the authorization boundary, so an unindexed collection scan with a blocking in-memory sort is the cost of every list open. Nothing in this repo creates an index and this design does not change that. The precedent is `modules/contacts/requests/search_contacts.yaml`, which documents the Atlas Search index its `$search` stage needs field by field and notes that an app without Atlas can drop the stage and keep a working pipeline. Same shape: the module documents, the host app creates.

**Changesets.** `.changeset/` holds five pending entries. Two things are wrong with the record:

- The identity-key change **shipped as a breaking commit without a changeset** — `a22b1468`, `refactor(reporting)!: key ownership on _user.id, the repo-wide identity key`.
- The unreleased `reporting-owner-reference.md` still introduces `defaults/user_id.yaml` and defends the `sub ?? id` derivation — and the same unreleased batch **deletes** that file. Both entries release together, so as it stands the published CHANGELOG would add a file the same release removes.

## Interfaces

- **Consumes:** every behaviour tasks 1–9 implemented. This task describes; it changes no behaviour.

## Task

### 1. `docs/ai-reporting/concepts/ownership.md`

A concepts page covering ownership, visibility and retirement, with the front-matter schema every file in `docs/` requires:

```yaml
---
title: Report ownership, visibility and retirement
module: ai-reporting
type: concept
concepts: [ownership, visibility, favourites, soft-delete, share-roles]
---
```

What it must tell a consumer, in their terms rather than the design's:

- **Reports are private to their author until deliberately published.** `visibility` defaults `private`; absent reads as `private`, so no migration is needed.
- **`share_roles` is the publish privilege**, and the two directions are gated differently: publish needs owner **and** role, unpublish owner **or** role — so a report stays retractable after a role is revoked, after the author leaves, or after the var is removed. Say plainly that this hands `share_roles` holders a moderation power over reports they do not own, and that there is no equivalent power to publish, rename, delete or edit someone else's.
- **What `shared` does and does not promise.** This is the one thing a consumer will get wrong. `visibility: "shared"` means the report is listed in everyone's Shared scope and openable by everyone. It does **not** promise every viewer sees numbers: the catalog's per-collection `roles` are enforced by `AnalyticsPipeline` against the **viewing** user on every resolve, section by section, and nothing checks the two role concepts against each other. A `share_roles` holder can publish a report over a role-gated collection to an app where few others hold that role, and those viewers get the report with its gated sections failing. In the common case there is nothing to explain — role-gating is opt-in, and a collection with an absent or empty `roles` list is queryable by any authenticated user.
- **Favourites are per-user**, stored as user ids on the report and projected to a boolean for the caller, so a caller never learns who else favourited a report. They work on reports you do not own, and a favourite is not a grant — the marker outlives the sharing that allowed it and goes dormant rather than being cleared.
- **The five list scopes** and what each returns, including that `deleted` is owner-only and never anyone else's.
- **Soft delete is the only retirement.** No archive state, no purge endpoint, nothing hard-deletes — and the delete confirmation says so truthfully, because the module never writes to the source collections at all. Restore returns a report to **private**.
- **Non-owners get read-plus-duplicate**, with duplicate as the path to a version you control: private, owned by you, favourites reset, no conversation link inherited.
- **`spec_version` and the compatibility rule** — the validator may loosen for persisted shapes and never tighten, because nothing in this repo can migrate a module-owned collection.

### 2. The expected indexes

Either a section of the concepts page or a short `docs/ai-reporting/reference/indexes.md` — a reference page is the better home, since a consumer looks this up rather than reads it once. Field order follows **equality, then sort, then range**: a non-point predicate ahead of the sort key means the index scan is not ordered by it.

| Index                                                     | Serves                                  |
| --------------------------------------------------------- | --------------------------------------- |
| `owner.user_id`, `updated.timestamp`, `deleted.timestamp` | Mine and the deleted scope              |
| `visibility`, `updated.timestamp`, `deleted.timestamp`    | Shared and `all` — the unbounded scopes |
| `favourite_of`                                            | The Favourites scope                    |
| `conversation_id`                                         | The report ↔ chat link                  |
| `owner.user_id`, `updated.timestamp` (conversations)      | The chat rail                           |

And the honest caveat, which matters more than the table: **these serve the `$match`, not the default sort, and the default sort cannot be indexed at all.** `is_favourite` is not a stored field — it is `$in` over `favourite_of`, computed in `$addFields` — and a `$sort` on a field produced by `$addFields` can never use an index; `$skip` / `$limit` inside `$facet` cannot use one either. So favourite-first ordering is a blocking in-memory sort in every scope. On `mine`, `favourites` and `deleted` the `$match` narrows to one user's reports first, so that costs nothing. The scopes where it is unbounded are `shared` and `all`, which match on a property of the report rather than on the viewer — hence their own index row, and hence the warning that a blocking sort has a memory ceiling above which it **errors rather than slows**. A caller-supplied sort replaces the default outright and _is_ indexable.

Also state that **`search` is `$regex` over `title` and `description`, not Atlas Search**, and why: the set is already scoped and paged, so ranking buys little while an Atlas requirement costs every consumer. Atlas remains available on the contacts pattern if a real case appears — the fields searched do not change either way.

### 3. Wire the new pages in and regenerate

- Link the new page(s) from `docs/ai-reporting/index.md`.
- `pnpm docs:gen`, then confirm `pnpm docs:check` passes. `docs/llms.txt` is generated and lints front-matter across all of `docs/`.

### 4. `.changeset/` — the two corrections

**A new entry for the identity-key change**, `@lowdefy/modules-mongodb-ai-reporting` **major** (or whatever this repo's convention is for a `!` commit — check the other entries). It must state the **breaking condition** even though no consumer is in that state today: an app whose `userFields.id` is not the auth subject loses its existing reports and conversations, because every stored key is the provider subject and after the change its owner matches nobody. That sentence is what makes the `!` legible to whoever reads the changelog next. Include what the design records for whoever hits it later: a correct migration cannot ship from this module, because rewriting the old key needs a per-user subject→id mapping that lives only in the host app's user records; it would have to cover both collections and four fields each (`owner.user_id`, `created.user.id`, `updated.user.id`, `deleted.user.id`); and a consumer can detect exposure in one query — reports whose `owner.user_id` matches no current user id.

**Correct `reporting-owner-reference.md`.** Remove the `user_id.yaml` bullet and the paragraph defending the `sub ?? id` derivation, since the same unreleased batch deletes that file. Keep everything about `owner: { user_id, name }`, why it is not the `created` stamp, and the verified upsert-path-conflict probe — that content is still true and still worth publishing.

**One changeset for the ownership feature as a whole, not one per commit.** Check whether a pending entry already covers reporting's ownership work before writing a new one; if the feature has no covering entry, write one placeholder saying what it covers and that no more are to be added for this area. A changelog assembled from intermediate states documents reversions that never shipped.

## Acceptance Criteria

- `docs/ai-reporting/concepts/ownership.md` exists with valid front-matter and covers all nine bullets above.
- The index table and its caveat are documented, and `docs/ai-reporting/index.md` links to the new page(s).
- `pnpm docs:gen` produces no further diff and `pnpm docs:check` passes.
- `.changeset/` carries an entry for the identity-key breaking change stating the breaking condition, and `reporting-owner-reference.md` no longer introduces a file the same release deletes.
- Grep confirms no doc says reports are "readable only by their author", that the spec is stored raw, or that section ids are positional.

## Files

- `docs/ai-reporting/concepts/ownership.md` — create
- `docs/ai-reporting/reference/indexes.md` — create — the expected indexes and the unindexable-sort caveat
- `docs/ai-reporting/index.md` — modify — link the new pages
- `docs/llms.txt` — modify — regenerated
- `.changeset/reporting-identity-key.md` — create — the breaking entry `a22b1468` shipped without
- `.changeset/reporting-owner-reference.md` — modify — drop the `user_id.yaml` and `sub ?? id` content

## Notes

- **Do not create indexes.** Nothing in this repo does, and the design does not change that. The deliverable is the documentation a host app acts on.
- **Do not hand-edit `docs/ai-reporting/reference/vars.md` or `docs/llms.txt`.** Both are generated; `pnpm docs:check` fails on drift and runs on every PR.
- Source-side READMEs (`modules/ai-reporting/README.md`) are stubs that point into `docs/` — do not add content to them.
- The `reports_collection` naming note is already in the manifest from task 2 and flows into the generated `vars.md`; don't restate it as prose in the concepts page.
