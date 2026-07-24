---
type: shared
module: shared
title: Secrets
concepts:
  - secrets
  - environment variables
  - MONGODB_URI
  - S3
  - read-only principal
---

# Secrets

Master list of every secret read by modules in this repo. Bucket names, keys, and connection strings live in secrets so they stay out of version control.

| Secret                       | Modules      | Used for                                                       |
| ---------------------------- | ------------ | -------------------------------------------------------------- |
| `MONGODB_URI`                | every module | MongoDB connection string                                      |
| `FILES_S3_ACCESS_KEY_ID`     | `files`      | AWS access key for the file storage bucket                     |
| `FILES_S3_SECRET_ACCESS_KEY` | `files`      | AWS secret access key for the file storage bucket              |
| `FILES_S3_BUCKET`            | `files`      | Private S3 bucket for file uploads                             |
| `FILES_S3_BUCKET_PUB`        | `files`      | Public S3 bucket for files served without auth                 |
| `REPORTING_MONGODB_URI`      | `reporting`  | MongoDB URI for saved reports and chat conversations           |
| `REPORTING_DATA_MONGODB_URI` | `reporting`  | MongoDB URI the reporting engine queries — **read-only user**  |
| `AI_GATEWAY_API_KEY`         | `reporting`  | AI gateway API key (skip when the `ai` connection is remapped) |

Email/SMTP and other transport secrets are not used by any module here — `notifications.send_routine` is a configurable routine on the consuming app and uses whatever secrets that routine requires.

## By category

**MongoDB.** Every module declares `MONGODB_URI`. A single connection serves the whole app — modules don't need separate URIs. The `reporting` module is the exception: it keeps its storage (`REPORTING_MONGODB_URI`) separate from the data it queries (`REPORTING_DATA_MONGODB_URI`) so the latter can be provisioned as a **read-only principal** — see below.

**File storage (S3).** Used by `files`. Two buckets: a private one (signed URLs, default for new uploads) and a public one (for assets served without auth).

## Region

`files.s3_region` is a **required** var — set it on the module entry. There's no default; the build will fail if it is missing.

## Read-only reporting principal (`REPORTING_DATA_MONGODB_URI`)

<!-- TODO(reporting task 8): the reporting security-model concept page should link here from its "read-only principal" section rather than duplicate this provisioning. -->

The reporting module's query engine executes AI-authored MongoDB aggregation pipelines. Its **second, independent safety layer** (the first is the pipeline validator) is the database principal it connects as: `REPORTING_DATA_MONGODB_URI` must point at a MongoDB user granted **only** the `read` role on the reporting database. This is a **deployment change, not a code change** — the `ReportingData` connection (`modules/reporting/connections/reporting-data.yaml`) resolves its `databaseUri` from this secret via `_secret`, so repointing the secret at a read-only user is all that is required.

The secret name is declared in `modules/reporting/module.lowdefy.yaml`.

### Provisioning the principal

All the reporting engine's collections live in a single database (the one the catalog's collections are read from). Grant a user `read` on exactly that database.

**Self-managed / on-prem (mongosh):**

```javascript
// Connect as an admin, then:
use admin;
db.createUser({
  user: "reporting_ro",
  pwd: passwordPrompt(), // never inline the password
  roles: [{ role: "read", db: "appdata" }], // <- the reporting database
});
```

**MongoDB Atlas:** under **Database Access → Add New Database User**, create a user whose only privilege is the built-in **Only read any database** role — or, more tightly, a **Specific Privilege** of `read` scoped to the reporting database. Do not grant `readWrite`, `dbAdmin`, or any admin role.

### Wiring

Build the read-only user's connection string and set it as the secret the engine reads:

```
REPORTING_DATA_MONGODB_URI=mongodb+srv://reporting_ro:<password>@<cluster>/appdata?retryWrites=true&w=majority
```

`REPORTING_MONGODB_URI` (saved reports and conversations) is a **separate** secret and stays a normal read-write user — the engine writes report specs and chat history there. Only `REPORTING_DATA_MONGODB_URI` is the read-only principal.

### What the principal stops

Regardless of whether the validator is perfectly correct, a `read`-only user cannot:

- perform `$out` or `$merge` writes, or any other mutation;
- run privileged or introspection commands.

A validator gap or a mis-classified operator therefore still cannot mutate data or run privileged commands.

### What it does NOT stop

The principal is one of two layers, not the whole security model. It does **not** stop:

- **Server-side JavaScript.** `$where` and `$function` execute fine under a read-only user. The pipeline **validator is the sole defense** against JS/eval — the principal does nothing here.
- **CPU / denial-of-service.** An expensive but read-only pipeline runs to completion (bounded only by the engine's `maxTimeMS`); the principal does not limit resource use.
- **Reading any collection the user has `read` on.** A DB-wide `read` grant can read every collection in the database. **The catalog — not the principal — is the confidentiality boundary:** the engine rejects any pipeline that touches a collection not declared in the catalog. Narrowing the principal to per-collection grants is possible as extra depth, but it is ops-heavy and not required.

Do not mistake the read-only principal for the complete security model: confidentiality and JS/eval defense come from the validator and the catalog, not from the principal.

### View-leak audit responsibility

A cataloged collection may be a **MongoDB view** whose own definition `$lookup`s into a collection that is **not** declared in the catalog. The engine sees only the view name and never inspects the view's underlying pipeline, and a DB-wide `read` principal can read the view's targets — so such a view leaks data past the catalog boundary.

When you declare a view in the catalog, **audit its definition**: every collection it reaches must be one you intend to expose. Deployments that cannot audit their views should narrow the principal to per-collection grants instead.

### Minimum server version

Persisting raw pipelines stores nested `$`-prefixed field names (`$match`, `$lookup`, …) inside saved-report documents. MongoDB permits `$`-prefixed field names in stored documents only from **5.0 onward**, so the **app database that holds saved reports — the one behind `REPORTING_MONGODB_URI` — must be MongoDB ≥ 5.0.**

The reporting-data database (`REPORTING_DATA_MONGODB_URI`) only reads and is unaffected by this particular constraint.
