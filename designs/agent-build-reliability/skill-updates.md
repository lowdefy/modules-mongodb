# Resonancy skill updates — agent build reliability

Handoff spec for editing the `resonancy` Claude plugin skills. Apply these in the
plugin's **source** repo (the skills published to
`~/.claude/plugins/marketplaces/resonancy/skills/...`), not the cache.

## Why

Agents "building the Lowdefy app" hang or get stuck. Investigation in
`modules-mongodb` found the causes are **not** a single bug but a set of
foot-guns where the easy thing an agent reaches for is wrong:

1. **`lowdefy build` has two failure phases.** Phase 1 parses YAML; phase 2
   validates auth config and **requires `NEXTAUTH_SECRET`**. A clean tree clears
   phase 1 and dies at the phase-2 env gate with a message
   (`[ConfigError] NEXTAUTH_SECRET environment variable is not set`) that says
   nothing about the agent's change. The agent then reaches for an inline dummy
   secret, which trips a permission prompt → stuck.
   *(Fixed in this repo: `apps/demo` `ldf:b` now supplies a build-only
   `NEXTAUTH_SECRET` placeholder. The skills must still handle the case for
   other repos / when the gate reappears.)*
2. **Long-running servers run in the foreground.** `lowdefy dev` / `lowdefy
   start` / `pnpm e2e` never exit; a plain foreground Bash call blocks until
   timeout and looks like a hang.
3. **Infisical (`:i`) variants can't run in the sandbox.** They fetch secrets
   from `app.infisical.com`, which the sandbox network blocks (TLS rejected).
4. **`fix-lowdefy-build` loops on unfixable failures.** Env gates, Infisical/TLS
   errors, and leftover `<<<<<<<` merge-conflict markers are not in its
   YAML-error table; it burns its fix budget and the controller keeps
   re-dispatching fix subagents against an unfixable build.
5. **The controller's `pnpm build` doesn't build the app.** Root `pnpm build` is
   `pnpm -r --filter '!@lowdefy/modules-demo' run build` — module/plugin bundles
   only. The app build is `pnpm ldf:b` in `apps/demo`. The build gate currently
   validates the wrong thing.

Guiding principle: **the default command an agent reaches for must Just Work in
a bare sandbox (no secrets, no Infisical, no network beyond npm), and the
never-exit commands must be impossible to reach by accident.**

---

## Skill 1 — `r:fix-lowdefy-build`

File: `skills/fix-lowdefy-build/SKILL.md`

### Change 1a — Add a "stop, don't loop" pre-check

Add a new step **before** Step 4 (Parse Build Output), or a prominent subsection
in Step 4. These three failure classes are **not YAML-fixable** — the skill must
detect them and **stop with a clear message** instead of consuming its 3-fix
budget or letting the caller re-loop:

| Detect in build output | Action |
|---|---|
| `NEXTAUTH_SECRET` (or any `… environment variable is not set` / missing-secret) | STOP. Report: build blocked by an **env gate**, not a config error. Tell the user the build needs `NEXTAUTH_SECRET` (and any other named var) in the environment. Do **not** invent or inline a value. Suggest the repo expose a build-only placeholder in its `ldf:b` script. |
| `infisical`, `app.infisical.com`, `tls: failed to verify certificate`, `x509`, connection refused/timeout to a non-npm host | STOP. Report: build blocked by **sandbox network / Infisical**, not a config error. Do not retry. Suggest plain `ldf:b` (no `:i`) or allowlisting the host. |
| `<<<<<<<`, `=======`, `>>>>>>>` in a config file / "Implicit keys need to be on a single line" near a conflict marker | STOP. Report: **unresolved merge conflict** in `{file}`. The build cannot parse until conflicts are resolved. Do not attempt YAML fixes. |

Each stop must clearly state "this is not something this skill can fix" so the
controller (design-implement) does not re-dispatch.

### Change 1b — State the loop bound explicitly

The skill already caps at 3 fix-types/run, but add to **Error Handling**:
> Never re-run the build more than once per fix batch. If the same error
> survives a fix attempt unchanged, stop and surface it — do not keep looping.

### Change 1c — Never run servers

Add to **Best Practices** / **Notes**:
> Only ever run `pnpm ldf:b` (or the project's build script). **Never** run
> `lowdefy dev`, `lowdefy start`, `pnpm ldf`, `pnpm ldf:d`, or `pnpm e2e` — these
> are long-running servers that never exit and will hang the agent.

---

## Skill 2 — `r:design-implement`

File: `skills/design-implement/SKILL.md`

### Change 2a — Build gate runs the app build, not root `pnpm build`

The build authority must run the **Lowdefy app build**, not root `pnpm build`
(which excludes the demo app). Update every "build" reference to the app build
command, and add a one-line note that root `pnpm build` does **not** build a
Lowdefy app.

- **Line 109** (Every-task cadence row): change `` `pnpm build` + `fix-lowdefy-build` ``
  to `` `pnpm ldf:b` (app build) via `fix-lowdefy-build` ``.
- **Line 138** (Build gate step 6): make explicit the build command is the
  app's `ldf:b` (e.g. `pnpm --filter <app> ldf:b` or `cd apps/<app> && pnpm
  ldf:b`), discovered from the app `package.json` — **not** root `pnpm build`.
- **Line 153** (Phase 4 final build): same — final build is `pnpm ldf:b`, not
  `pnpm build`.
- **Line 261** (example narration): change "`pnpm build` green" to
  "`pnpm ldf:b` green".

### Change 2b — Don't loop the build gate on unfixable failures

In step 6 (Build gate), after "run the `r:fix-lowdefy-build` loop … until
green", add:
> If `fix-lowdefy-build` reports a **non-fixable** failure (env gate such as
> `NEXTAUTH_SECRET`, Infisical/sandbox network, or unresolved merge conflict),
> **stop the loop and surface to the user** — do not re-dispatch fix subagents.
> These are environment/state problems, not config errors, and re-running will
> not make the build green.

### Change 2c — Implementer prompt already says "don't build" — keep, but fix wording

File: `skills/design-implement/implementer-prompt.md`, line ~40: the implementer
is told it does not run `pnpm build`. Change the wording to reference the **app
build (`ldf:b`)** so it's unambiguous that the controller owns `ldf:b`, not the
(irrelevant) root `pnpm build`.

---

## Skill 3 — `r:design-task`

File: `skills/design-task/SKILL.md`

The task template (Acceptance Criteria / Files sections, ~line 151) does not
prescribe build/run commands — but task *authors* write verification steps like
"Start the demo (`pnpm ldf:dev`) and exercise …" (see this repo's
`designs/app-operator/tasks/14-verify-build-and-tests.md`). Two problems: that
script name doesn't exist, and it's a foreground server that hangs an agent.

Add guidance to the **Acceptance Criteria** template notes (and/or the "Consider
testability" guideline near line 182):

> **Build vs run.** For an agent-executable build check, write `pnpm ldf:b` (the
> Lowdefy app build — it exits). **Do not** put `lowdefy dev` / `lowdefy start` /
> `pnpm e2e` / `pnpm ldf:d` in acceptance criteria as a foreground step — they
> never exit and hang the executing agent. App-running smoke tests belong to a
> human or `/r:dev-test`, not the autonomous build gate. If a task genuinely
> needs the running app, say so explicitly and mark it as a human/`dev-test`
> step, not a command for the implementing agent to run inline.

---

## Verification

After applying, the definitive check (on a **clean** tree — no merge conflicts):

1. `cd apps/demo && pnpm ldf:b` succeeds with no env gate (placeholder clears
   `NEXTAUTH_SECRET`). If a *second* env gate surfaces, add it to the same
   inline default in `apps/demo/package.json` and note it here.
2. Feed `fix-lowdefy-build` a build output containing `NEXTAUTH_SECRET … not
   set` / an Infisical TLS error / a `<<<<<<<` marker → it should **stop and
   report**, not loop or attempt YAML edits.
3. `design-implement`'s build gate runs `pnpm ldf:b` (app build), and stops the
   loop on a non-fixable failure rather than re-dispatching.

## Out of scope (handled elsewhere)

- `apps/demo/package.json` `ldf:b` placeholder — already applied in this repo.
- `CLAUDE.md` "Building & Running the App" section — already applied in this repo.
- Resolving the current merge conflicts in `modules/workflows/pages/` — separate task.
