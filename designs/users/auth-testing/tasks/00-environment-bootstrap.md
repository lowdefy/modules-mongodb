# Phase 0 — Environment & bootstrap

> **Depends on:** — (stands the rig up). · **Legend:** `[ ]` to do · `[x]` done · `[~]` partial · `[-]` N/A this run · **"Verify in Compass"** = check the rig DB. · Context: [`../design.md`](../design.md) · index: [`tasks.md`](./tasks.md).

- [x] Mongo + Mailpit up (dev's own setup, not the compose stack); mongo reachable at `mongodb://localhost:27017`
- [x] Compass connected; `demo-auth-test` DB visible (only this DB on local mongo — old cluster untouched)
- [x] `apps/demo/.env` present with `LOWDEFY_SECRET_*` values (README §3a)
- [x] Email → Mailpit via `.env` `SMTP_*` — config is env-driven (host `localhost`, port `1025`, secure `false`); live send verified in Phase 1
- [x] Partial-unique indexes present on `user-contacts.lowercase_email` and `users.profile.contactId` (both `unique` + `$exists` partial)
- [x] Build green — the `lowdefy-docs` dev server reports `build.status: ok`
- [x] `pnpm ldf:d` dev server up (it backs the MCP); pinned `demo` org row exists in `user-organizations` (UUID `_id`, engine-ensured at startup)
- [x] Script deps OK — `mongodb` resolves via the root dep (the local `pnpm install` is a no-op; see FINDINGS)
- [x] **First admin bootstrapped:** sign up + verify email (Phase 1), then `pnpm bootstrap-admin <email>`; log in and reach the user-admin console — bootstrap confirmed: `admin@demo.test`'s `user-members.role` is now `user-admin` (reaching the console verified in Phase 3)

Index creation (run once per fresh DB — survives `reset-db`, lost on `down -v`):

```sh
docker exec demo-auth-mongo mongosh mongodb://localhost:27017/demo-auth-test --quiet --eval '
  db["user-contacts"].createIndex({ lowercase_email: 1 }, { unique: true, partialFilterExpression: { lowercase_email: { $exists: true } } });
  db.users.createIndex({ "profile.contactId": 1 }, { unique: true, partialFilterExpression: { "profile.contactId": { $exists: true } } });
  print("indexes created");
'
```
