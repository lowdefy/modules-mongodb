---
title: Bootstrap a catalog from a live database
module: reporting
type: how-to
concepts: [collections-catalog, bootstrap, cli]
---

# Bootstrap a catalog from a live database

The [collections catalog](../reference/catalog.md) is a trusted, human-owned artifact — it is simultaneously the agent's data dictionary and the engine's authorization boundary. Writing the first draft by hand across a few dozen collections is tedious, so the plugin package ships a CLI that drafts one by sampling a live database.

The draft is **scaffolding, never a runtime path.** The engine only ever reads the curated, committed `catalog` var. What the CLI produces is a starting point for a human to edit and check in.

## Running it

The CLI ships as a bin of `@lowdefy/modules-mongodb-plugins` — the plugin package the reporting module already requires — so there is nothing extra to install and nothing to copy out of this repo.

Lowdefy installs plugins under `.lowdefy/server`, not your app root, so add the package as a **devDependency of your app** to put the command on your path:

```bash
pnpm add -D @lowdefy/modules-mongodb-plugins
```

Then, from the app directory:

```bash
pnpm exec lowdefy-reporting-catalog --out modules/reporting/catalog.draft.yaml
```

Wiring it as an app script is worth doing, since a catalog is usually re-drafted whenever the schema moves:

```json
{
  "scripts": {
    "reporting:catalog": "lowdefy-reporting-catalog --out modules/reporting/catalog.draft.yaml"
  }
}
```

<details>
<summary>Running it without adding the devDependency</summary>

After at least one `lowdefy build`, the bin exists inside the built server:

```bash
pnpm --dir .lowdefy/server exec lowdefy-reporting-catalog --out ../../modules/reporting/catalog.draft.yaml
```

The devDependency is the better default: it works before the first build, and `--out` stays relative to your app rather than to `.lowdefy/server`.

</details>

Note that `npx @lowdefy/modules-mongodb-plugins` does **not** work. `mongodb` is a peer dependency of that package, and `npx` does not install peers.

## Credentials

The CLI reads the same secrets the module does, under the `LOWDEFY_SECRET_` prefix that standalone Lowdefy scripts use (each also accepts the bare name):

| Variable                                    | Required | Purpose                                                                                                                                                   |
| ------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOWDEFY_SECRET_REPORTING_DATA_MONGODB_URI` | yes      | The [read-only principal](../../shared/secrets.md#read-only-reporting-principal-reporting_data_mongodb_uri) — the same credential the engine queries with |
| `LOWDEFY_SECRET_AI_GATEWAY_API_KEY`         | no       | Drafts descriptions, enum confirmations, display hints and relationships                                                                                  |
| `AI_GATEWAY_BASE_URL`                       | no       | Override the gateway base URL                                                                                                                             |
| `REPORTING_MODEL`                           | no       | Gateway model id; defaults to the module's `model` default                                                                                                |

Use the read-only principal deliberately — the CLI should never hold a credential that can write. It only ever reads: `listCollections` plus a bounded `$sample` per collection.

Without a gateway key the CLI still produces a useful draft, just type-inference only (no descriptions or relationships) with a warning. `--no-model` forces that mode.

## Options

| Option         | Default                                  | Effect                                            |
| -------------- | ---------------------------------------- | ------------------------------------------------- |
| `--db <name>`  | the database in the URI                  | Database to sample                                |
| `--out <path>` | `reporting-catalog.draft.yaml`           | Output file                                       |
| `--sample <n>` | `100`                                    | Documents to `$sample` per collection             |
| `--depth <n>`  | `4`                                      | Levels to flatten sub-documents into dotted paths |
| `--model <id>` | `$REPORTING_MODEL` or the module default | Gateway model id                                  |
| `--no-model`   | off                                      | Skip the model call entirely                      |
| `--include <a,b>` | all non-system collections            | Catalog only these collections (exact names or `*`-globs, e.g. `demo_*`) |
| `--exclude <a,b>` | none                                  | Skip these collections (exact names or `*`-globs); applied after `--include` |
| `--help`       | —                                        | Print usage and exit                              |

### Scoping which collections are cataloged

By default the CLI samples every non-system collection in the database — including operational ones (sessions, tokens, change logs) that are noise for a reporting catalog and, on a large database, can make the model-drafting payload big enough to fail (the draft then falls back to type-inference only). Scope the run with `--include` to name the collections you want, or `--exclude` to drop the plumbing:

```bash
# Only the reporting-domain collections
lowdefy-reporting-catalog --include 'demo_*' --out modules/reporting/catalog.draft.yaml

# Everything except operational collections
lowdefy-reporting-catalog --exclude 'user-*,log-*,*-sessions' --out modules/reporting/catalog.draft.yaml
```

Both accept exact names or `*`-globs (anchored full-match, so `demo_*` selects `demo_orders` but not `demo-log-changes`). `--exclude` is applied after `--include`. An `--include` pattern that matches nothing is reported so a typo does not silently catalog nothing.

### Nested fields

Sub-documents are flattened into dotted paths (`global_attributes.billing.plan`) down to `--depth` levels, default 4. This matters more than it sounds: the catalog is the whole of what the agent knows, so a field too deep to be drafted is a field it cannot query. Raise `--depth` if your documents nest further; a sub-document sitting at the limit is still recorded as an `object` field, so you can see it exists and re-run deeper.

Arrays are never descended into — an array field is recorded as `array`. To report over array contents at a fixed grain, see [Reporting over complex data](complex-data.md).

## What it emits, and why it is commented out

Every collection entry in the draft is emitted **commented out**, and `roles` is emitted as an empty placeholder that the model is never asked to fill.

That is deliberate. Declaring a collection in the catalog _is_ the act of exposing it, and an active entry with empty `roles` is queryable by any authenticated user. So an unedited draft checked in declares nothing at all, and uncommenting an entry is the human decision to expose that collection.

Curation is therefore: read each entry, decide whether it should be exposed, uncomment it, fill in `roles` if it should be gated, and correct anything the model got wrong. Descriptions matter more than they look — the agent reasons from them, so a collection whose `description` states its grain ("one row per assignment, not per action") produces better queries.

## Re-running against a changed schema

Collections, fields, relationships and enum values are emitted in deterministic sorted order, so re-running produces a draft that diffs cleanly against your curated file. The diff doubles as schema-drift detection: new fields and collections show up as additions.

Two sources of harmless churn: model-written descriptions vary slightly between runs (the model is called at temperature 0 to keep this low), and `$sample` is random, so rarely-present fields and observed enum values can flicker. Raise `--sample` if a field you care about keeps disappearing.

Write re-runs to a scratch path (`--out catalog.draft.yaml`) and diff against the curated file rather than overwriting it — the curated file holds your `roles`, your edits, and your decisions about what stays commented out.

## Related

- [The collections catalog](../reference/catalog.md) — the shape, roles semantics, display hints, and the view-leak caveat
- [Reporting over complex data](complex-data.md) — relationships, grain and fan-out, and the MongoDB-view pattern
- [Secrets](../../shared/secrets.md) — provisioning the read-only principal
