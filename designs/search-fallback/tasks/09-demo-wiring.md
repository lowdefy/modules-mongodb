# Task 9: Wire the demo to the fallback and build-verify both branches

## Context

Tasks 2–7 made all seven searchable requests honour `atlas_search`. The demo runs against a local MongoDB, which has no `mongot` process, so every `$search` pipeline hard-fails there today — the whole point of this design. This task flips the demo to the fallback so `pnpm ldf:b` plus a local MongoDB works end-to-end.

Per the design's decision 4, the flag is **repeated on each module entry**; there is no shared config file. `designs/app-operator` deleted `apps/demo/app_config.yaml` and there is no operator route (`_app` reads only app metadata — `slug`, `name`, `version`, `description`; `_secret` is server-runtime-only and would forfeit the build-time collapse). Drift here fails loudly on the first list-page load and touches nothing stored, so repetition is acceptable.

Because the demo pins `false`, the Atlas branch would otherwise never be built. This task therefore also owns verifying both branches compile.

## Task

**1. Set the flag on each searchable module entry.** Add `atlas_search: false` to:

- `apps/demo/modules/contacts/vars.yaml`
- `apps/demo/modules/companies/vars.yaml`
- `apps/demo/modules/activities/vars.yaml`
- `apps/demo/modules/deals/vars.yaml`

Put it near the top of each file with a short comment stating why — the demo targets a local MongoDB with no Atlas Search — and pointing at `docs/shared/search.md`. Write the comment once per file in a form that reads as current configuration, not as a change log.

**2. Build-verify the fallback branch.** Run `pnpm --filter @lowdefy/modules-mongodb-demo ldf:b` and inspect the built request artifacts under `apps/demo/.lowdefy/server/build/pages/**/requests/`:

| Request                      | Artifact path                                       |
| ---------------------------- | --------------------------------------------------- |
| `get_all_contacts`           | `pages/contacts/all/requests/get_all_contacts.json` |
| `get_contact_excel_data`     | contacts list page requests                         |
| `search_contacts` (per host) | any page hosting a `contact-selector`               |
| `get_all_companies`, excel   | companies list page requests                        |
| `get_activities`             | activities list page requests                       |
| `get_deals_list`             | deals list page requests                            |

For every one of them assert: **no `$search`**, **no `$meta: searchScore`**, a `$or` of `$regex` clauses inside the `$match` `$and`, and (where applicable) the `$sort` `_if` test collapsed to the literal `false`. A quick sweep:

```bash
grep -rl '"\$search"' apps/demo/.lowdefy/server/build/pages   # expect no matches
grep -rl 'searchScore' apps/demo/.lowdefy/server/build/pages  # expect no matches
```

**3. Build-verify the Atlas branch.** Temporarily flip all four entries to `atlas_search: true` (or comment the lines out to fall through to the manifest default), rebuild, and assert the inverse: each artifact carries a `_if`-gated `$search` with `returnStoredSource: true` and text/wildcard `should` clauses only — no `filter`/`mustNot` inside the `$search` — and no `$or` regex clause survives. Then restore `false` and rebuild once more so the committed state is the fallback.

**4. Confirm the demo runs.** A build check is not a smoke test. With a local MongoDB reachable, load the contacts, companies, activities, and deals list pages and confirm each lists rows, that typing in the search box narrows results by substring (`joh` → `John`), and that the contact-selector typeahead returns matches. If no local MongoDB is available in this environment, stop and report the smoke test as outstanding rather than claiming it passed — the build check alone does not cover it.

## Acceptance Criteria

- All four demo module entries set `atlas_search: false`, each with a one-line reason.
- `pnpm --filter @lowdefy/modules-mongodb-demo ldf:b` succeeds and no built artifact under `apps/demo/.lowdefy/server/build/pages` contains `$search` or `searchScore`.
- The temporary `true` build was run and confirmed to produce the gated `$search` (text-only) in every one of the seven requests; the committed state is back to `false`.
- Search on all four list pages plus the contact selector works against a local MongoDB — or the smoke test is explicitly reported as not run, with the reason.

## Files

- `apps/demo/modules/contacts/vars.yaml` — modify — add `atlas_search: false`.
- `apps/demo/modules/companies/vars.yaml` — modify — same.
- `apps/demo/modules/activities/vars.yaml` — modify — same.
- `apps/demo/modules/deals/vars.yaml` — modify — same.

## Notes

- Never start `lowdefy dev` / `lowdefy start` / `pnpm e2e` in the foreground — they never exit. Use `pnpm ldf:b` for the build checks, and if a live server is genuinely needed, start it in the background and poll `/api/auth/session`.
- The `:i` (Infisical) script variants do not work in the sandbox; plain `ldf:b` needs no secrets.
- `user-admin` gets no flag. Its members list already runs a plain-`$match` regex, so it works on local MongoDB unchanged.
- Do not add a shared config file or an `_ref`-ed helper to avoid the four-way repetition — that decision is settled in the design.
