# Task 9: Wire both apps to their real deployment mode, so both flag branches compile

## Context

Tasks 2–7 made all seven searchable requests honour `atlas_search`. Two apps in this repo consume the searchable modules, they run against different databases, and each should simply be wired for the database it actually uses. That also happens to give both branches of the flag permanent build coverage, without the demo pretending to be a test harness.

- **`apps/demo` — `atlas_search: true`.** The demo is the consumer-facing reference and the general deployment target; it runs against a real MongoDB with Atlas Search. It should show the production wiring, which is the default.
- **`apps/workflows-test` — `atlas_search: false`.** This app exists to exercise module config, and its e2e stack runs a plain (non-Atlas) MongoDB via `@lowdefy/community-plugin-e2e-mdb`. It already carries `contacts` and `companies` entries with no vars, present "solely to satisfy the build-time dependency graph", and its `field-render-sweep` spec renders `form.contact` / `form.stakeholders` (`e2e/workflows/field-render-sweep.spec.js:60-62`) — which wrap the contacts module's `contact-selector`, whose typeahead is the `$search`-leading `search_contacts`. So `false` is the correct setting there on its own merits, not a coverage device.

Because the two apps sit on opposite sides of the flag, a build of each compiles a different branch of the shared builder. That only gates anything if something builds them, and CI currently builds no app at all — `.github/workflows/ci.yaml` runs `pnpm install` and `pnpm docs:check` and nothing else. This task adds both builds.

Per the design's decision 4, each app holds the flag **once** in `app_config.yaml` and every searchable module entry `_ref`s it. That file was deleted by `designs/app-operator` because its only key (`app_name`) became obsolete when `_app: slug` replaced it — not because the pattern was rejected. This task reinstates it for a new app-level key.

## Task

**1. Reinstate `app_config.yaml` in both apps.**

```yaml
# apps/demo/app_config.yaml
# Deployment capability, read by every searchable module entry. This app runs
# against a MongoDB with Atlas Search — see docs/shared/search.md.
atlas_search: true
```

```yaml
# apps/workflows-test/app_config.yaml
# The e2e stack runs a plain mongod with no Atlas Search, so text search uses
# the regex fallback — see docs/shared/search.md.
atlas_search: false
```

One key each. Do not add other keys speculatively — the file earns its keys as app-level values appear.

**2. Read it from the demo's searchable entries.** In each of `apps/demo/modules/{contacts,companies,activities,deals}/vars.yaml`:

```yaml
atlas_search:
  _ref:
    path: app_config.yaml
    key: atlas_search
```

`_ref` paths in entry vars resolve from the app root — the pre-deletion files used exactly this shape (`path: app_config.yaml`, no `../`).

**3. Do the same on `workflows-test`, and give it the two missing modules.** Add the same `_ref` to its `contacts` and `companies` entries in `apps/workflows-test/modules.yaml`.

Then add `activities` and `deals` entries so those two modules also compile their fallback branches (`deals` depends on `activities`, so both must be listed). Follow the file's existing conventions: entries are order-sensitive — a module must be listed after every module it depends on — and the existing comment block explains why the dependency-only entries are there. Give both the same `_ref`, plus only whatever other vars the build requires; leave everything else on defaults, matching how `contacts`/`companies` are already wired there.

**4. Build-verify each branch in the app that owns it.**

Demo (Atlas branch) — `pnpm --filter @lowdefy/modules-demo ldf:b`, then inspect the built request artifacts under `apps/demo/.lowdefy/server/build/pages/**/requests/`:

| Request                      | Artifact path                                       |
| ---------------------------- | --------------------------------------------------- |
| `get_all_contacts`           | `pages/contacts/all/requests/get_all_contacts.json` |
| `get_contact_excel_data`     | contacts list page requests                         |
| `search_contacts` (per host) | any page hosting a `contact-selector`               |
| `get_all_companies`, excel   | companies list page requests                        |
| `get_activities`             | activities list page requests                       |
| `get_deals_list`             | deals list page requests                            |

For each, assert a `_if`-gated `$search` carrying text/wildcard `should` clauses only — no `filter`/`mustNot` inside the `$search` — `returnStoredSource: true` except on `get_activities`/`get_deals_list`, which must show `false`, and **no** `$or` regex clause anywhere.

`workflows-test` (fallback branch) — `pnpm --filter @lowdefy/modules-workflows-test ldf:b`, then assert the inverse:

```bash
grep -rl '"\$search"' apps/workflows-test/.lowdefy/server/build/pages   # expect no matches
grep -rl 'searchScore' apps/workflows-test/.lowdefy/server/build/pages  # expect no matches
```

plus a `$or` of `$regex` clauses inside the `$match` `$and`, and the `$sort` `_if` test collapsed to the literal `false` where applicable.

**5. Add both builds to CI.** In `.github/workflows/ci.yaml`, run `ldf:b` for `apps/demo` and `apps/workflows-test` after `pnpm install`. Neither needs secrets or network beyond npm — the build scripts supply a build-only `NEXTAUTH_SECRET` placeholder. This is what makes the two-app coverage a gate rather than a convention: without it, a wrong operator name in either half of the shared builder ships unnoticed.

**6. Confirm the apps run.** A build check is not a smoke test. On a deployment with Atlas Search reachable, load the demo's contacts, companies, activities, and deals list pages and confirm each lists rows, that typing in the search box narrows results by substring (`joh` → `John`), and that the contact-selector typeahead returns matches. For the fallback path, the same via `workflows-test`'s e2e run. If neither environment is available here, stop and report the smoke test as outstanding rather than claiming it passed.

## Acceptance Criteria

- `apps/demo/app_config.yaml` (`atlas_search: true`) and `apps/workflows-test/app_config.yaml` (`atlas_search: false`) exist, one key each, each with a one-line reason.
- Every searchable module entry in both apps reads the flag via `_ref` to its app's `app_config.yaml` — no literal `true`/`false` on any entry.
- `workflows-test` has entries for all four searchable modules.
- Both `ldf:b` runs succeed.
- No artifact under `apps/workflows-test/.lowdefy/server/build/pages` contains `$search` or `searchScore`; every one of the seven requests in the demo build carries the gated text-only `$search`, with `returnStoredSource: false` on `get_activities` and `get_deals_list`.
- `.github/workflows/ci.yaml` builds both apps.
- Search works on the demo's four list pages plus the contact selector against Atlas, and in `workflows-test`'s fallback path — or the smoke test is explicitly reported as not run, with the reason.

## Files

- `apps/demo/app_config.yaml` — create — `atlas_search: true`.
- `apps/workflows-test/app_config.yaml` — create — `atlas_search: false`.
- `apps/demo/modules/{contacts,companies,activities,deals}/vars.yaml` — modify — `_ref` the app's `atlas_search`.
- `apps/workflows-test/modules.yaml` — modify — same `_ref` on `contacts`/`companies`, plus new `deals` and `activities` entries.
- `.github/workflows/ci.yaml` — modify — build both apps.

## Notes

- Never start `lowdefy dev` / `lowdefy start` / `pnpm e2e` in the foreground — they never exit. Use `pnpm ldf:b` for the build checks, and if a live server is genuinely needed, start it in the background and poll `/api/auth/session`.
- The `:i` (Infisical) script variants do not work in the sandbox; plain `ldf:b` needs no secrets.
- `user-admin` gets no flag in either app. Its members list already runs a plain-`$match` regex, so it works on any MongoDB unchanged.
- Adding `deals`/`activities` to `workflows-test` is for config coverage — no spec needs to exercise their pages, they only need to build. Do not add pages or e2e specs for them.
- `app_config.yaml` holds `atlas_search` only. Do not migrate anything else into it, and in particular do not reintroduce `app_name` — `_app: slug` supersedes it (`designs/app-operator`).
