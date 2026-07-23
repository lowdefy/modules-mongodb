# Auth testing — design change requests

Bigger design / architecture changes surfaced while stepping through
[`CHECKLIST.md`](./CHECKLIST.md).

Small blockers and doc fixes are applied to the files directly (not tracked here).
Test-run bugs and unexpected states go in `CHECKLIST.md`'s "Notes / issues found".

**Legend:** `[ ]` open · `[x]` done · `[~]` deferred/needs discussion

---

- [x] **`auth.email` build schema and runtime engine disagreed — fixed upstream by
      bumping the `@lowdefy` engine.** In `…20260723122111` the build schema modelled
      `auth.email` as `{ from, provider }` (`additionalProperties: false`) while the
      runtime (`getBetterAuthConfig` → `createSendEmail` → `getConnectionConfig`) read
      only `auth.email.connectionId`. No config shape both built and sent mail: the
      inline shape built green then threw `ConfigError: Connection id is missing.` at
      send; the connectionId shape was rejected at build. The `~ignoreBuildChecks`
      escape hatch made it worse — it suppressed the schema error that aborts `buildAuth`
      mid-run, so `buildEntityAuth('pages')` never ran and **every page/menu link lost
      its `auth`**, crashing the runtime menu filter (`authorize` reads `auth.public` on
      `undefined`).

  **Root cause + fix:** `../lowdefy` commit `ef218d4a` ("fix(build): Align the
  auth.email schema with the connection-based runtime", PR #2285, on the
  `auth-upgrade` HEAD) rewrites the schema to **require `connectionId`** and allow an
  optional `templates` map (verifyEmail/resetPassword/magicLink/invitation →
  notification ids), dropping the inline `from`/`provider`. Resolution is to cut an
  experimental release including it and bump `modules-mongodb` to that version.

  **Config (final shape, in `apps/demo/lowdefy.yaml`):** an `SMTP` connection
  `auth-smtp` (owns `from`/transport/auth — dummy Mailpit creds locally) +
  `auth.email: { connectionId: auth-smtp }`. No `~ignoreBuildChecks`, no inline
  provider. **Design follow-up:** `config-schema/design.md:65` still documents the
  old inline-provider shape and needs updating to the connection-based shape.
