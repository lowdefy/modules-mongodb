# Notifications: drain retry and Lambda-pipeline coexistence

## Problem

Production apps consume the notifications module at three levels: fully migrated (module owns dispatch and email), hybrid (module UI and trigger endpoint, `send_routine` hands events to the app's external Lambda pipeline for delivery), and not at all (external pipeline only, module dormant). Coexistence already works structurally, but an audit of existing apps surfaced two gaps:

1. **No retry.** A failed module send leaves the record `sent: false` with `send_attempts` bumped and a code comment promising "a drain retry" that didn't exist. External pipelines get retry for free from SQS redelivery, so an app that fully migrates silently loses retry robustness.
2. **The coexistence/migration story was undocumented** — and the demo guide actively claimed the Lambda pipeline "is retired", implying forced migration.

## Decision

Ship a drain (code) and a migration/coexistence how-to (`docs/notifications/how-to/lambda-pipeline-migration.md`). No compatibility flag or mode of any kind.

## Drain design

### Single send path (`send-notification-record`)

The send block (transport switch, `mark_sent` + `email_result` bookkeeping, failure `:catch`) is factored out of `dispatch-notification-item` into an internal `send-notification-record` endpoint that both the first send and the drain retry call. One correct way: the two send paths cannot drift. The endpoint's payload carries `notification_id` because the email connections resolve their recipient filter against `_payload.notification_id` (the `filter_exempt_types` exemption) — retries keep the same filter semantics as first sends.

Behavior change accepted in the refactor: the invalid-transport-var guard moved into the send path, so inbox-only dispatches no longer throw on a bogus `transport` var (the guard now lives where the transport is used).

### Per-record endpoint (`retry-notification-record`)

Step results are index-keyed inside `:for` and `_step` cannot read the current iteration's result (verified against `@lowdefy/api` — the same constraint that makes `dispatch-notifications` delegate to `dispatch-notification-item`). The drain loop body is therefore a single `CallApi` to a per-record endpoint that gets fresh step context: claim → send → return `{ claimed, sent }`.

### Claim: optimistic lock on `last_attempt` equality

Each retry starts with a conditional update: `filter { _id, sent: false, last_attempt: <value the drain read> }`, `$set last_attempt: now`, `disableNoMatchError: true`, proceeding only when `matchedCount == 1`. The claim's own `$set` invalidates any concurrent claimant, so overlapping drain runs cannot double-send.

- **Rejected: `send_attempts` equality as the lock token.** The claim doesn't change `send_attempts` (it stays failures-only), so a concurrent claimant's filter would still match — no lock.
- Dates round-trip exactly through in-process `CallApi` payloads and the MongoDB plugin's serializer (verified), so the equality filter on a `Date` read from the find result is sound.
- Known noise: `notifications-collection` has a change log, so every claim (including no-match claims) writes a `log-changes` document.

### Drain scope: `send_attempts >= 1`

The drain query is `{ sent: false, send_attempts: { $gte: 1, $lt: max_attempts }, is_valid_email: true, send_email: { $ne: false }, created.app_name }`, sorted oldest `last_attempt` first, limited per run. `$gte: 1` does two jobs:

- **Never races a first send.** Insert happens before send, so a record mid-first-dispatch sits at `send_attempts: 0`; only records with at least one _failed_ attempt drain. The cost: a record orphaned by a hard crash between insert and send (attempts forever 0) is never drained — accepted as rare and out of scope.
- **Never touches legacy records.** Lambda-era records lack `send_attempts`, so they can never enter the module's send path regardless of shape differences.

Known edge (pre-existing, amplified by the drain, accepted): `mark_sent` sits inside the send `:try`, so "mail delivered but mark_sent failed" is recorded as a failure and will be re-sent. Not worth restructuring the bookkeeping over.

`max_attempts` (5) and `limit` (50) are payload knobs with `_if_none` defaults, not module vars — per-run tuning without permanent config surface.

### Scheduling: app-side cron

The module exports `drain-notifications` but ships no schedule. Apps wire a small cron-only `InternalApi` (`schedules: [{ cron }]`) that CallApis it — the demo's `apps/demo/api/notifications-drain.yaml` is the reference consumer.

- **Rejected: module-declared `schedules:` on the endpoint.** It works (module endpoints pass through the build with schedules intact), but it forces a cron entry into every consumer app's deployment manifest whether the app wants retries or not (cron slots are limited on some hosting plans), and the cadence would be fixed since it's not clear module vars fold inside `schedules:`.

## Rejected: any "loud failure" mechanism for critical sends

The scenario that motivated it: a hybrid app upgrades `user-admin`, invites silently shift from the app's Lambda to the module's (unconfigured) transport, and invite sends fail into retry bookkeeping while the invite API returns success. Three mechanisms were considered and all were rejected in favor of documentation (the upgrade warning in the how-to):

- **Per-item `send_required: true` flag** (failure re-throws after bookkeeping; user-admin sets it on invites) — the most precise option, but new item-contract surface for a scenario the docs can carry.
- **Var-based config guard** (throw when transport vars look unconfigured) — false-positives on the documented connection-remap configuration style, and misses non-config failures (bad credentials) anyway.
- **Coupling to `filter_exempt_types`** — overloads a recipient-filtering var with failure semantics, and apps couldn't flag their own critical mail per item.

## Rejected: a `legacy_mode` / backwards-compatibility flag

There is no behavior for it to toggle. The compatibility seams are per-concern and already exist: `send_routine` for delivery, connection remaps for transport, legacy field coalescing on reads (`event_type ?? type`, `description ?? preview`, top-level `links.button`), `filter_exempt_types` for auth mail. The one invariant coexistence needs — each notification type owned by exactly one pipeline — is unenforceable from inside the module (it cannot see an external pipeline's job registry) and is documented instead.
