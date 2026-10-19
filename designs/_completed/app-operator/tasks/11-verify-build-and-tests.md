# Task 11: Verify the build and tests

## Context

The migration is a single breaking PR; intermediate task states may not build. This task is the
final gate: it confirms both apps compile, the plugin tests pass, the resolver `_build.app`
form resolves correctly, the docs generators are in sync, and no stray `app_name` slug
reference survives.

## Task

Run and confirm green:

1. **Plugin tests** — `pnpm --filter @lowdefy/modules-mongodb-plugins test` (WorkflowAPI /
   EventsTimeline schema + engine renames from task 1).
2. **Workflows resolver tests** — the test target covering `modules/workflows/resolvers/`
   (`makeActionPages.test.js` etc.).
3. **Demo build** — `pnpm ldf:b` from `apps/demo` (or `pnpm --filter @lowdefy/modules-demo
   ldf:b` from root). Must pass. Inspect the generated per-action pages under
   `apps/demo/.lowdefy/server/build/pages/**` to confirm the `makeActionPages.js` resolver
   emitted per-action pages (the `_build.app: slug` resolver-var form resolved to a string, not
   an unevaluated object — design §Upstream status).
4. **Workflows-test build** — `pnpm ldf:b` for `apps/workflows-test`. Must pass.
5. **Docs sync** — `pnpm docs:check` (fails if `vars.md` or `llms.txt` are stale or
   front-matter is invalid).

**Final grep sweeps** — confirm no slug-valued `app_name` remains:

```
git grep -n '_module.var: app_name' modules/          # expect: none
git grep -n 'app_name\|appName' plugins/modules-mongodb-plugins/src/   # only stored-field refs, if any
git grep -rn 'app_config' apps/                        # expect: none
```

## Acceptance Criteria

- Plugin and resolver test suites pass.
- `pnpm ldf:b` passes for **both** `apps/demo` and `apps/workflows-test`.
- Demo build artifacts show per-action workflow pages present (resolver emitted them).
- `pnpm docs:check` passes.
- No `_module.var: app_name` anywhere in `modules/`; no `app_config.yaml` referenced in any app;
  no slug-valued `app_name`/`appName` in the plugin `src/`.

## Files

- (no source changes) — verification only; fix-forward any failures in the owning task's files

## Notes

- Depends on all prior tasks.
- `ldf:b` needs no secrets/Infisical/network beyond npm — use the plain `ldf:b`, not the `:i`
  variant (per CLAUDE.md). A build check is not a smoke test; running the app is out of scope
  for this gate.
- If a resolver page-emission check fails, the likely cause is the resolver var arriving as an
  unevaluated `{ _app: slug }` object — confirm task 2 used `_build.app: slug` and the guard
  rejects non-strings.
