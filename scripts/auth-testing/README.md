# Auth testing — local infrastructure

Local, throwaway infrastructure for testing the demo app's BetterAuth flows
(login, signup, email verification, password reset, magic-link, 2FA, passkeys,
invitations) end-to-end, without touching any real database or sending real
email.

Two containers, defined in [`docker-compose.yml`](./docker-compose.yml):

| Service     | Purpose                                   | Reach it at                                             |
| ----------- | ----------------------------------------- | ------------------------------------------------------- |
| **MongoDB** | Isolated, ephemeral auth + contact data   | `mongodb://localhost:27017/demo-auth-test`              |
| **Mailpit** | Catches every auth email (SMTP sink + UI) | `http://localhost:8025` (web UI + API), SMTP on `:1025` |

> **Nothing here touches production.** The database is a fresh local container;
> email goes to a sink that never forwards. This is the whole reason we run local
> infra instead of pointing at a real cluster or SMTP provider.

---

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

Either gives you the `docker` CLI and `docker compose`. The rest of this guide is
identical for both.

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
LOWDEFY_SECRET_GOOGLE_CLIENT_ID="dummy-..."     # dummy unless testing the Google button
LOWDEFY_SECRET_GOOGLE_CLIENT_SECRET="dummy-..."
LOWDEFY_SECRET_SMTP_HOST="localhost"            # → Mailpit
LOWDEFY_SECRET_SMTP_PORT="1025"
LOWDEFY_SECRET_SMTP_SECURE="false"
# SMTP_USER / SMTP_PASS unset locally (Mailpit needs no auth)
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
optional user/pass from `_secret`, so the `SMTP_*` values in §3a's `.env` point it
at Mailpit locally, while Infisical supplies SendGrid values in prod — same config,
different environment.

Two details worth knowing:

- **`secure` is derived, not read raw.** `_secret` yields strings, and nodemailer
  treats the string `"false"` as truthy — so the config computes `secure` as
  `SMTP_SECURE == "true"` (a real boolean). Set `LOWDEFY_SECRET_SMTP_SECURE="true"`
  only for an implicit-TLS server (SendGrid :465); Mailpit is `"false"`.
- **No auth locally.** `SMTP_USER` / `SMTP_PASS` unset → nodemailer sends no AUTH,
  and Mailpit accepts it (`MP_SMTP_AUTH_*` in the compose file). Unset secrets
  resolve to `null`, which is fine here.

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

| Collection           | What's in it                                              |
| -------------------- | --------------------------------------------------------- |
| `user-contacts`      | The person record (profile, `lowercase_email`, contactId) |
| `users`              | Auth identity (email, `emailVerified`, `banned`, profile) |
| `user-members`       | This app's access (org membership, roles)                 |
| `user-invitations`   | Pending / accepted / cancelled invites                    |
| `user-sessions`      | Active sessions (has the bearer `token` — never surfaced) |
| `user-accounts`      | Credential + linked-provider rows                         |
| `user-passkeys`      | Registered passkeys                                       |
| `user-organizations` | The pinned `demo` org row                                 |

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

One-time setup (installs the single dependency, the `mongodb` driver):

```sh
cd scripts/auth-testing
pnpm install          # or: npm install
```

All three read `MONGODB_URI` (default `mongodb://localhost:27017/demo-auth-test`)
and `MAILPIT_URL` (default `http://localhost:8025`) from the environment.

### `bootstrap-admin` — make the first user an admin

Solves the chicken-and-egg: under `pinned` + invite-only there's no admin to grant
the first membership. Sign up + verify email through the UI first (that creates the
auth identity — the script never touches credentials), then:

```sh
pnpm bootstrap-admin sam@example.com          # grants role user-admin in the demo org
pnpm bootstrap-admin sam@example.com admin    # grant a different catalog role
```

It inserts the `user-members` row (native `ObjectId` ids, CSV `role`) linking the
user to the `slug: "demo"` org. Idempotent — re-running merges the role rather than
duplicating the row. Needs the dev server to have started once (so the engine has
ensured the pinned org).

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

## Troubleshooting

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
