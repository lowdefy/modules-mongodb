# Auth testing — environments

Infrastructure for testing the BetterAuth flows (login, signup, email
verification, password reset, magic-link, 2FA, passkeys, invitations) end-to-end.

Two environments, and they drive **different apps** — the deployment policy is
the whole reason there are two:

| Environment           | App                | Policy   | Use it for                                                                                          | Database                                 | Email                         |
| --------------------- | ------------------ | -------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------- |
| **Local rig** (§1–§7) | `apps/demo`        | `pinned` | Dev iteration — fast resets, scripted link extraction, throwaway data                               | local container `demo-auth-test`         | Mailpit sink (never forwards) |
| **QA** (§8)           | `apps/tenant-demo` | `tenant` | Tester-facing passes ([`qa-test-plan.md`](../../designs/auth-tenancy-verification/qa-test-plan.md)) | Atlas `modules-mongodb-demo-tenant-test` | SendGrid → real inboxes       |

The local rig's tools are pinned-shape by construction: `bootstrap-admin` grants
a `userAdminRole` that `tenant` forbids, and `reset-db` refuses a non-local host.
The workspace surface (organization switcher, members, settings) only exists in
`apps/tenant-demo`. Neither app can serve both passes — see
[`docs/shared/org-scoping.md`](../../docs/shared/org-scoping.md).

**The local rig touches nothing real** — a fresh local container plus a mail sink.
That's the whole reason it exists. **The QA environment is different:** it sends
real email and lives on a shared Atlas cluster. Read §8 before pointing anything
at it.

Each is driven entirely by its app's `.env` — the apps are env-driven end to end,
so switching database or mail provider never means editing config.

---

# Local rig — `apps/demo` (`pinned`)

## 1. Install Docker (macOS)

If `docker --version` already prints a version, skip this.

**Option A — Docker Desktop (simplest, has a GUI):**

```sh
brew install --cask docker
open -a Docker            # launch it once; wait for the whale icon in the menu bar
docker --version         # verify
```

**Option B — Colima (lightweight, no Docker Desktop):**

```sh
brew install colima docker docker-compose
colima start
docker --version         # verify
```

Either gives you the `docker` CLI. **The Compose command name differs:** Docker
Desktop provides `docker compose` (v2 subcommand); Colima installs the standalone
`docker-compose` (hyphenated). Commands below are written `docker compose` — on
Colima, substitute `docker-compose`.

---

## 2. Start the infrastructure

From this directory (`scripts/auth-testing/`):

```sh
docker compose up -d       # start MongoDB + Mailpit in the background
docker compose ps          # both should show "running"/"healthy"
```

Verify each is reachable:

```sh
# Mongo — should print { ok: 1 }
docker exec demo-auth-mongo mongosh --quiet --eval 'db.runCommand({ ping: 1 })'

# Mailpit — should return JSON (an empty inbox to start)
curl -s http://localhost:8025/api/v1/messages | head -c 200
```

Open the Mailpit inbox in a browser: **http://localhost:8025**

---

## 3. Point the app at this infra

The demo app is fully env-driven — database _and_ email come from `_secret`, so
pointing it at local infra is entirely a matter of `apps/demo/.env`. No config
edits.

### 3a. Secrets (`apps/demo/.env`)

The app resolves secrets via Lowdefy's `_secret` operator, which reads env vars
prefixed **`LOWDEFY_SECRET_`** (so `_secret: MONGODB_URI` → `LOWDEFY_SECRET_MONGODB_URI`).
The CLI auto-loads `apps/demo/.env` (dotenv) when you run `pnpm ldf:d` / `pnpm ldf:b`
from there, so the local values live in that **gitignored** file — already created
with:

```sh
LOWDEFY_SECRET_MONGODB_URI="mongodb://localhost:27017/demo-auth-test"
LOWDEFY_SECRET_AUTH_SECRET="<random>"           # regenerate: openssl rand -base64 32
LOWDEFY_SECRET_AUTH_FROM_ADDRESS="no-reply@demo.test"
LOWDEFY_SECRET_GITHUB_CLIENT_ID="dummy-..."     # dummy unless testing the GitHub button
LOWDEFY_SECRET_GITHUB_CLIENT_SECRET="dummy-..."
LOWDEFY_SECRET_SMTP_HOST="localhost"            # → Mailpit
LOWDEFY_SECRET_SMTP_PORT="1025"
LOWDEFY_SECRET_SMTP_SECURE="false"
LOWDEFY_SECRET_SMTP_USER="mailpit"              # any value — Mailpit accepts any creds
LOWDEFY_SECRET_SMTP_PASS="mailpit"
```

> `MONGODB_URI` is the single secret every connection resolves — the auth
> adapter, `demo-contacts`, and all the module read connections. Pointing it at
> one local database satisfies the **co-location precondition** (user-admin
> Decision 1) automatically. Never split it across databases, or `$lookup` joins
> to `user-contacts` silently return blank.
>
> Note the helper scripts read plain **`MONGODB_URI`** (no prefix) from their own
> shell — that's the Node `mongodb` driver, not the `_secret` operator. Only the
> app config uses the `LOWDEFY_SECRET_` prefix.

### 3b. Email → Mailpit (already env-driven)

Nothing to edit. `auth.email.provider` in `lowdefy.yaml` reads host/port/secure and
user/pass from `_secret`, so the `SMTP_*` values in §3a's `.env` point it at Mailpit
locally, while Infisical supplies SendGrid values in prod — same config, different
environment.

Two details worth knowing:

- **`secure` is derived, not read raw.** `_secret` yields strings, and nodemailer
  treats the string `"false"` as truthy — so the config computes `secure` as
  `SMTP_SECURE == "true"` (a real boolean). Set `LOWDEFY_SECRET_SMTP_SECURE="true"`
  only for an implicit-TLS server (SendGrid :465); Mailpit is `"false"`.
- **Dummy creds locally — do not leave them unset.** Mailpit advertises `AUTH`, and
  nodemailer throws `EAUTH "Missing credentials"` if the `auth` block resolves to
  null user/pass — so `SMTP_USER` / `SMTP_PASS` must carry _some_ value. Mailpit
  accepts any credentials, so any dummy string works; prod uses the real SendGrid
  `apikey` / key. (The provider schema fixes `auth` to `{user, pass}`, so the config
  can't omit it conditionally — hence dummy values rather than an absent block.)

---

## 4. Inspect data with MongoDB Compass

Install Compass (if you don't have it):

```sh
brew install --cask mongodb-compass
```

Connect with this string (no username/password — the local container has auth
disabled):

```
mongodb://localhost:27017
```

Then open the **`demo-auth-test`** database. The collections you'll watch during
testing:

| Collection           | What's in it                                                     |
| -------------------- | ---------------------------------------------------------------- |
| `user-contacts`      | The person record (profile, `organizationId`, `lowercase_email`) |
| `users`              | Auth identity (email, `emailVerified`, `banned`, profile)        |
| `user-members`       | This app's access (org membership, roles)                        |
| `user-invitations`   | Pending / accepted / cancelled invites                           |
| `user-sessions`      | Active sessions (has the bearer `token` — never surfaced)        |
| `user-accounts`      | Credential + linked-provider rows                                |
| `user-passkeys`      | Registered passkeys                                              |
| `user-organizations` | The pinned `demo` org row                                        |

Compass has a live-refresh toggle per collection — handy for watching a document
change as you click through a flow in the app.

---

## 5. Run the app against it

Local infra up + env exported + `auth.email` repointed, then from `apps/demo/`:

```sh
pnpm ldf:d      # dev server (NOT the :i Infisical variant — we're using local env)
```

Wait for it to come up, then open the app. The dev server is long-running — leave
it in its own terminal. (A plain `ldf:b` build check does **not** need any of this
infra; the infra is only for exercising live flows.)

---

## 6. Reset & teardown

```sh
docker compose down          # stop containers, keep the mongo data volume
docker compose down -v       # stop AND wipe the database (fresh slate)
docker compose restart mailpit   # clear the inbox without touching the DB
```

Between test runs you'll often want a clean database (unconsumed invitations,
verification tokens, and enrolled 2FA all persist). The helper scripts (§7) give
you a targeted data reset that keeps the container and indexes, plus a first-admin
bootstrap and a Mailpit link-extractor.

---

## 7. Helper scripts

No install step — the scripts need only the `mongodb` driver, which is already a
repo-root dependency and resolves via the root `node_modules`. (This directory
isn't a pnpm workspace member, so a local `pnpm install` here just re-installs the
root workspace and is a no-op for these scripts.)

All three read `MONGODB_URI` (default `mongodb://localhost:27017/demo-auth-test`)
and `MAILPIT_URL` (default `http://localhost:8025`) from the environment.

**All three are local-rig tools.** `mail-link` speaks Mailpit's API, `reset-db`
refuses a non-local host, and `bootstrap-admin` grants a role the QA environment's
tenant policy doesn't use. §8 covers the QA equivalents.

### `bootstrap-admin` — make the first user an admin

Solves the chicken-and-egg: under `pinned` + invite-only there's no admin to grant
the first membership. Sign up + verify email through the UI first (that creates the
auth identity — the script never touches credentials), then:

```sh
pnpm bootstrap-admin sam@example.com          # grants app role user-admin in the demo org
pnpm bootstrap-admin sam@example.com admin    # grant a different catalog app role
```

It inserts the `user-members` row (UUID-string ids, snake_case columns) linking the
user to the `slug: "demo"` org. The granted role goes in the **`app_roles` array** —
the field the console page gate and `UpdateMemberRoles` read — with the org-authority
`role` tier set to `member` (a separate axis). Idempotent — re-running merges the app
role rather than duplicating the row. Needs the dev server to have started once (so the
engine has ensured the pinned org).

### `reset-db` — clean data slate between runs

Clears every collection's documents in the test database (keeps collections and
indexes, so you don't have to recreate the partial-unique indexes). **Guarded:**
refuses to run unless the URI host is local _and_ the database name is the test DB —
it structurally cannot touch a remote cluster.

```sh
pnpm reset-db            # clear all data in demo-auth-test
pnpm reset-db --dry-run  # show what would be cleared, change nothing
```

After a reset, restart the dev server so the engine re-ensures the pinned org, then
re-run `bootstrap-admin`.

### `mail-link` — pull the action link out of the latest email

Reads the Mailpit inbox via its JSON API and prints the actionable URL (verify,
reset, invite/accept, magic-link) from the most recent message — so you can script
email-gated flows instead of clicking through the web UI.

```sh
pnpm mail-link                          # link from the newest message
pnpm mail-link --to alice@example.com   # newest message to that recipient
pnpm mail-link --json                   # raw message metadata + all links found
```

---

## Troubleshooting (local rig)

- **Port already in use (27017 / 1025 / 8025):** another Mongo/mail service is
  running. Stop it, or remap the host port in `docker-compose.yml` (e.g.
  `"27018:27017"`) and update `MONGODB_URI` to match.
- **`Transaction numbers are only allowed on a replica set` (or change-stream
  errors):** a flow wants a replica set. Switch the mongo service to a single-node
  RS: add `command: ["--replSet", "rs0"]`, then once up run
  `docker exec demo-auth-mongo mongosh --quiet --eval 'rs.initiate()'` and append
  `?directConnection=true` to `MONGODB_URI`. Standalone is the default because the
  design doesn't need transactions.
- **Emails not showing in Mailpit:** confirm the `auth.email` repoint (§3b) is in
  place and the dev server was restarted after the edit; check the dev-server log
  for SMTP connection errors.
- **Blank contact data everywhere in the app:** the co-location precondition is
  broken — some connection is resolving a different `MONGODB_URI`/database. Check
  §3a.

---

# QA environment — `apps/tenant-demo` (`tenant`)

## 8. Atlas + SendGrid — tester-facing passes

The environment [`qa-test-plan.md`](../../designs/auth-tenancy-verification/qa-test-plan.md)
runs against. It differs from the local rig in the three ways that matter:

- **A different app.** `apps/tenant-demo`, not `apps/demo` — the workspace surface
  the plan's §2–§5 exercise exists only there, and its `slug` is `tenant-demo`, so
  it writes its own `created.app_name` / workflow `access` axis.
- **Real email.** SendGrid delivers to real inboxes, so a tester can click links
  from their own mail client. The plan's "4 email addresses you can actually read"
  precondition depends on this.
- **A shared Atlas cluster.** The database is `modules-mongodb-demo-tenant-test`.
  It is not a container you can throw away, and the cluster hosts other databases.

### 8a. Secrets (`apps/tenant-demo/.env`)

Same `LOWDEFY_SECRET_` mechanism as §3a — only the values differ:

```sh
LOWDEFY_SECRET_MONGODB_URI="mongodb://…/modules-mongodb-demo-tenant-test?…"
LOWDEFY_SECRET_SMTP_HOST="smtp.sendgrid.net"
LOWDEFY_SECRET_SMTP_PORT="465"
LOWDEFY_SECRET_SMTP_SECURE="true"      # implicit TLS on :465 — see §3b on why this is a string
LOWDEFY_SECRET_SMTP_USER="apikey"      # literal "apikey" for SendGrid
LOWDEFY_SECRET_SMTP_PASS="<sendgrid key>"
```

`AUTH_FROM_ADDRESS` must be an address SendGrid will send as (a verified sender or
a domain you've authenticated), or every auth email silently fails to deliver.

### 8b. Tenant policy

`apps/tenant-demo` runs `auth.organizations.policy: tenant` — a fresh signup mints
its own organization and invited users join the inviter's. That's the mode the QA
plan's workspace sections exercise; nothing needs enabling.

Two consequences for the helper scripts:

- **`bootstrap-admin` is not needed.** `userAdminRole` is forbidden under `tenant`,
  and there's no pinned org to join. Grant roles from `/organizations/members`
  instead — that's what the plan's §6.1 tells the tester to ask for.
- **The user-admin console's writes refuse at runtime** by design (no engine
  step-floor under `tenant`). The plan's §6 treats every refusal as a pass.

### 8c. Indexes

Already created on `modules-mongodb-demo-tenant-test`:

| Collection      | Index                                                                            |
| --------------- | -------------------------------------------------------------------------------- |
| `user-contacts` | `{organization_id, lowercase_email}` unique, partial on `lowercase_email` exists |
| `user-contacts` | `{organization_id, user_id}` unique, partial on `user_id` exists                 |

They enforce per-workspace contact uniqueness — the invariant behind the plan's
§3.4 (no duplicate pending row) and §5.4 (the same email in two workspaces). The
`createIndex` command in the campaign's
[Phase 0](../../designs/users/auth-testing/tasks/00-environment-bootstrap.md)
targets the local container and is not part of this environment's setup.
(Indexes created before the snake_case data-plane flip used the `organizationId`
/ `userId` spellings — a fresh environment needs the snake_case shapes.)

### 8d. Reading the data

Connect Compass with the Atlas URI from `.env` and open
`modules-mongodb-demo-tenant-test`. The collection guide in §4 applies, with one
correction: `user-organizations` holds **one row per workspace**, not a single
pinned `demo` row.

### 8e. Serving it

Serve a production build, not the dev server:

```sh
pnpm ldf:b && pnpm ldf:s      # from apps/tenant-demo/ — serves on port 3003
```

`ldf:d` intermittently leaves a page stuck on a "building page" screen — a
dev-server artifact that reads as an app bug to a tester (logged as K3 in the QA
plan). A production build removes it.

### 8f. Resetting between passes

There is no guarded script for this. `reset-db` structurally cannot reach a remote
host, and that guard stays — it's the only thing standing between a stray
`MONGODB_URI` and a wiped cluster.

Clearing the QA database is therefore a deliberate, explicit act. It keeps
collections and indexes:

```sh
mongosh "<the Atlas URI from .env>" --quiet --eval '
  db.getCollectionNames().forEach((n) => {
    print(`${n}: cleared ${db[n].deleteMany({}).deletedCount}`);
  });
'
```

Sign every tester out first — clearing `user-sessions` invalidates live sessions
mid-flow, which surfaces as confusing errors rather than a clean sign-out.

A tester-facing pass wants a clean slate: unconsumed invitations, verification
tokens, enrolled 2FA and stale workspaces all persist, and leftovers make the
plan's §5 data-separation checks unreadable — you can't tell a leak from a
left-over row.
