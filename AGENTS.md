<!-- BEGIN:lowdefy-agent-rules version=7.0.0 -->
## Lowdefy

This project contains a [Lowdefy](https://lowdefy.com) app, or several: a web app defined in YAML config files
rather than hand-written code. Pages compose **blocks** (UI components), **operators** (logic
like `_if`, `_get`, `_state`), **actions** (event handlers), and **connections/requests**
(databases and APIs).

### The dev server

Your Lowdefy tools come from the `lowdefy` MCP server (`lowdefy mcp`, see `.mcp.json`). It routes every
`lowdefy_` tool to the dev server of the app and git checkout you are working in, and starts that server when needed.

- Never run `lowdefy dev` yourself, never choose a port, and never kill processes by port or name. Use
  `lowdefy_dev_start`, `lowdefy_dev_stop`, `lowdefy_dev_status` and `lowdefy_dev_logs`.
- Restart (`lowdefy_dev_start` with `restart: true`) only when the server seems stuck or build status looks
  stale, or after secrets a wrapper (for example infisical) injects have changed. `.env` edits and local
  plugin code are picked up without a restart.
- Working in a different git worktree from the session (for example as a subagent)? Pass your working
  directory as `directory` on every `lowdefy_` call.
- A Lowdefy app is a folder containing `lowdefy.yaml`. `lowdefy_` tools pick the app themselves: the app
  folder the session started in, else the repository's only app; otherwise they fail and list the apps. When
  the developer named an app, or a call listed several, pass its folder as `directory`.
- Shell commands (`lowdefy test`, `lowdefy journeys …`) choose the app the same way and pass its folder as
  `--config-directory <app>`. Paths in their arguments are relative to where you run them, so start them
  with the app folder (`<app>/tests/journeys/…`).
- After every config edit, call `lowdefy_build_status` with `wait: true` and fix what it reports.
- When you finish work in a git worktree you created for the task, call `lowdefy_dev_stop` with that
  `directory` before you report back. Do not stop a server in a checkout you share with another agent. A server
  left running stops once it has been idle for 15 minutes.
- Every result starts with the app and checkout it came from. Check it.

### Looking up types, schemas, and docs

The dev server serves documentation for every block, operator, action, connection, and request type
installed in this project (including local plugins).

**Never guess type names or properties.** Before writing or editing Lowdefy config:

1. List available types: call `lowdefy_list_types` — this includes this project's local plugins.
2. Get the exact schema: call `lowdefy_get_schema`.
3. See real usage: call `lowdefy_get_examples`.
4. Read concept docs or search: call `lowdefy_get_doc` or `lowdefy_search_docs`.

### Icons and interactive HTML

- Icons: use a semantic name (`icon: edit`, `delete`, `warning`). Otherwise use a Lucide name in
  PascalCase (`Receipt`), found with `lowdefy_search_icons`. Never invent a name, and never use emoji.
  Do not write old react-icons names (`AiOutlineUser`). Add app-specific semantic names under
  `theme.icons.aliases` in lowdefy.yaml.
- In any HTML string (Html, ClickableHtml, DangerousHtml, and html properties like Tooltip titles)
  write `<i data-icon="edit"></i>` — never paste inline SVG. Add `data-tooltip="Text"` for hover
  help and `data-popover="id"` with a hidden `data-popover-content="id"` element for a popover.
- For clicks inside HTML use ClickableHtml: `data-event="onEdit"` fires that block event, with the
  element's other `data-*` attributes as the event object, when the block lists it in
  `properties.dataEvents` (unlisted events do nothing). Escape data in HTML built from requests or
  users: `_nunjucks` escapes `{{ values }}`; `_string.concat` and `_js` do not.
- Links in HTML: `<a data-page-id="contacts" data-url-query="_id=42">` — never a hard-coded
  `href="/contacts?..."` (it reloads the app and ignores basePath). `data-new-tab` instead of
  `target="_blank"` (sanitising strips `target`).
- Statuses in HTML: `<span data-tag="success">Approved</span>` or `<span data-status="warning">…</span>`
  — never inline-styled pills or hex status colours.
- Dates, numbers, people and copyable values in HTML: `<time datetime="{{ iso }}" data-time="relative">`
  (or `date`, `datetime`, `time`), `data-format="currency" data-currency="USD"` (or `number`,
  `percent`, `compact`, `bytes`) on the raw number, `data-avatar="{{ name }}"` (never an avatar image
  service), and `data-copy` for a copy button.
- `data-truncate="2"` clamps block text (full text in a tooltip when cut off), `data-tone="secondary"`
  mutes text (never inline grey hex colours), and in ClickableHtml a destructive event is listed as
  `{ name: onDelete, confirm: "Delete this row?" }` in `dataEvents` so every click asks first. See the `concepts/html-attributes` doc.

### Testing a change

Verify a change by running the app's journeys (`tests/journeys/`) with `lowdefy_run_tests`:

- Run `tier: common` first: the most-used journeys, ranked by production use, a quick check of the
  happy paths.
- Widen to `tier: edge` before you call the change done: the edge cases real users still reach.
  Journeys with no production counts for their current steps run in every tier.
- In a terminal the same runs are `lowdefy test --config-directory <app> --tier common` and
  `lowdefy test --config-directory <app> --tier edge`.
- A tier is refused when the app has too little production use pulled; then run without `tier`.

### Visual feedback

While the dev server is running, developers can press `Cmd/Ctrl+/` in the browser to point at,
draw on, and comment on the running app; the annotation helper copies an agent-readable feedback
block to their clipboard, which they paste into the agent session. Pasted blocks start with
"Feedback:" and include the config file and line each annotation refers to — treat them as
precise UI feedback.

### Agent skills

These skills are installed in `.agents/skills/` and `.claude/skills/`:

- `lowdefy-config`: writing or editing Lowdefy config with exact types, schemas and examples from the dev server.
- `journeys-from-dev`: turning what the developer tried in the dev server into proven journeys.
- `journeys-from-production`: reading what real users do in production with the app config and turning the routines that matter into proven journeys, failures first.
- `journeys-from-pr`: exploring a pull request, or a bug bash goal, page by page as each role: a proven journey for every path a user can take, failures reported as findings with their journey.
- `journeys-harden`: proving journeys catch a broken feature: replay, lint, config mutants and edge-case variants, never deleting a journey.
- `journeys-autopilot`: one unattended agent that builds an app's journeys from nothing and keeps hardening them from a committed ledger, in its own worktree, shipping pull requests and findings.
<!-- END:lowdefy-agent-rules -->

# Modules MongoDB

A public monorepo of reusable Lowdefy modules backed by MongoDB, and the plugin package they need. Production apps in other repositories pin its releases. Work is tracked in Pelican's `MMDB` space; `designs/` holds earlier designs.

## Clients

This repository is public, and the apps that use it belong to confidential clients. In code, docs, designs, commits, pull requests, changesets and issues, write "a production app" in place of a client's name. When a design needs one app's configuration, name that app once, anonymously, at the top and use that name throughout.

## Sources of truth

- `docs/` says how a module behaves and how to configure it. When a design and `docs/` disagree about behaviour, `docs/` wins.
- A module's `module.lowdefy.yaml` is the source of every var's schema. Give each var `description`, `type`, and `default`, `required` or `enum` where they apply.
- Module and plugin READMEs are stubs that point into `docs/`. Put content in `docs/`.
- The production callers live in other repositories, so decide an API on its own merits, whether or not the demo calls it.

## Docs

- Layout: `docs/index.md`; per module `docs/<module>/index.md` (required), with `concepts/`, `how-to/` and `reference/` only where needed; cross-module idioms in `docs/shared/`; plugin blocks in `docs/plugins/`.
- Open every file in `docs/` with front matter: `title`, `module` (a module name, `root`, `shared` or `plugins`), `type` (`index`, `concept`, `how-to`, `reference` or `shared`), and optional `concepts`. `docs/CONTRIBUTING.md` defines them.
- `docs/<module>/reference/vars.md` and `docs/llms.txt` are generated. Change the manifest, then run `pnpm docs:gen`. CI fails on drift (`pnpm docs:check`).
- Modules create no indexes. List the indexes a module needs in `docs/<module>/reference/indexes.md`, so apps can declare them.

## Demo apps

- `apps/demo/` imports every module under `auth.organizations.policy: pinned`. Wire new capability here.
- `apps/tenant-demo/` runs the same modules under `policy: tenant`, plus the organizations module. The two policies can't share one app.
- The two apps duplicate their module vars. Change a shared vars file in both.
- Ship every new consumer-facing capability (component, export, var, slot, block behaviour) with a real consumer in `apps/demo/`, or `apps/tenant-demo/` when it only resolves under `tenant`. Prefer an existing page to a throwaway one.

## Lowdefy conventions

### Naming

- Request IDs: `snake_case` with a verb prefix: `get_`, `insert_`, `update_`, `set_`, `event_`, `selector_`.
- Block and action IDs: `snake_case`.
- Page IDs: kebab-case, since they are the URL. Module pages are `all`, `view`, `edit` and `new`.
- API endpoint IDs: kebab-case, entity first: `tickets-close-ticket`.
- Files: kebab-case for pages, APIs and directories; `snake_case` for components, requests, actions and enums.
- Enum files: `enums/options_<field>.yaml`.

### Files

- Write Lowdefy config in YAML, never JSON.
- One page per directory, with `components/`, `requests/` and `actions/` beside it.
- Put reusable pipeline stages in `requests/stages/` and multi-step action sequences in `actions/`.
- Split a file with `_ref` when it gets hard to read or a block is reused. Pass data with `vars`. Use `.yaml.njk` only when a var lands inside a string or an ID.

### Config

- Pass data to a request through `payload:`, never `_state` inside the pipeline.
- In an upsert, wrap insert-only fields in `$ifNull: [$field, value]`.
- Send a form's state subtree as it is and merge it onto the stored document. Use `_object.assign` with the stored document as the base, so arrays other routines own survive.
- Prefer a static branch per case over building a dot-notation key at runtime.
- Prefer Lowdefy operators to `_js`. Use `_js` when operators nest too deep to read.
- Skip an action with `skip:` rather than wrapping it in `_if`.

### Lowdefy behaviour to watch

- A key or string starting with `_` is read as an operator. Never start a field name, `$lookup` alias, var, state key or block ID with `_`.
- An input block's ID is its state path. Renaming an input silently breaks every reference to the old path.
- `SetState: { ns: {} }` does not clear an input that was hidden in the last render. Reset each leaf to `null`, a boolean to `false`.
- `Validate` matches exact block IDs and does not cascade, so a container's ID validates nothing and reports success. Match the inputs: `params: { regex: '^ns\.' }`.
- In `_js`, read globals with `lowdefyGlobal('key')` and state with `state('key')`.
- `_date` creates dates. Format with `_dayjs`.

### UI

- Tables are `AgGridBalham`.
- Prefer a Lowdefy block to `Html`. Prefer `_nunjucks` to `Html` built with `_js`.
- Space siblings with the parent's `layout.gap` before adding margins.
- Write `_eq`, `_ne`, `_or` and the like as block sequences, one item per line.
- Put a map keyed by a fixed set (status colours, labels) in an enum file loaded under `global.enums`. Keep plain selector options inline.

## Data

- Every connection that writes sets `changeLog: { collection: log-changes }`, so every change is audited.
- Every write stamps `created` on insert, `updated` on update and `deleted` on soft delete, using the events module's change stamp. Stamp every operation of a multi-step routine.
- `deleted` is an object, so select live documents with `deleted.timestamp: { $exists: false }`.
- `log-events` is an append-only audit trail: insert events, and leave existing ones as they are.
- Name collections in kebab-case (`user-contacts`, `log-events`).
- Read any database freely. Change data only when the person asked for that specific change, including by running an existing script that writes, since a `MONGODB_URI` can point anywhere. When work needs a data change, finish the rest and say what needs changing and why.

## Checks

- Build: `pnpm ldf:b` in `apps/demo`. It needs no secrets or Infisical. Build `apps/tenant-demo` too when a change touches the organizations module, the tenant wall or a vars file both apps carry.
- `pnpm build` at the root builds the module and plugin bundles, not the demo.
- Use the plain scripts. The `:i` ones fetch secrets from Infisical, which the sandbox blocks.
- `pnpm e2e` builds the app, starts it on port 3101 against an in-memory MongoDB, runs the suite and exits. It takes minutes: run it in the background. It is the only check that runs routines, so use it for authorization filters and rejection paths.

## Secrets

Run any command that needs secrets as `infisical run -- <command>`, which passes them into that command's environment without showing them to you. When a task needs an actual value, ask the person for it.

Anything you read ends up in transcripts and logs, so leave secret values unread by every route: no `infisical secrets` or `infisical export`, no `.env` files, and no `infisical run` around a command that prints values, such as `printenv` or `echo $SECRET`.

## How we build

- Build what the task needs now. A var, slot, flag or abstraction for a case nobody has asked for is maintained forever, and three similar modules are easier to follow than one module with variants.
- Add a guard, a validation or a rejected input only when it prevents a real, harmful mistake. Allowing the unusual-but-harmless uniformly is simpler for every consumer than a special case.
- When something must always hold, enforce it in a shared component or a CI check, so nobody has to remember it.
- Let failures show. When a failure could have more than one cause, stop with a message that says what to check and how to recover. A fallback or a default that turns an error into plausible output hides the cause.

## Code comments

Name variables and functions so the code explains itself, and add a comment only for what a reader can't learn from the code: a constraint from outside it, a rule that must hold that the code doesn't show, or why the obvious alternative is wrong.

Write comments about the code as it is now. What it used to do, what a task removed or renamed, and which approach it replaced belong in the commit or the design. A comment that says "used to", "no longer", "previously" or "replaces the old", or cites a task key, reads as an open question and invites the next reader to reopen a settled decision. Delete a comment that is only history. When one wraps a real constraint in history, rewrite it to state just the constraint.

## Git and releases

- The base branch is `main`. Branch from it and open a pull request into it. A person reviews and merges it.
- Other people and agents may have uncommitted work in this checkout, so stage your own files by path (`git add <paths>`).
- Install with `pnpm install --frozen-lockfile` unless your change edits a `package.json`. When a build or install changes `pnpm-lock.yaml` without one, restore it.
- Write conventional commits with a lowercase subject: `fix(<scope>): <what changed>`. The body says why, which calls you made, and ends with the task key.
- Title a pull request as a plain sentence.
- Add a changeset (`pnpm changeset`) to a pull request that changes a module or the plugin. The modules and the plugin share one version, and the release notes are made from changesets, so write it for an app developer upgrading: what changed, and anything they must change.
- Merging the "Publish new release" pull request is the release: it publishes the plugin to npm and tags `vX.Y.Z`, which apps pin.

## Worktrees

Do each piece of work in a new worktree, so parallel agents and the person's own checkout don't edit the same files. Its branch starts from the latest `origin/main`, or the branch the person names. A new worktree has no `node_modules`: run `pnpm install --frozen-lockfile` in it first.

## Writing for people

Pull requests, commits, changesets, task comments and your reports are read by people who weren't in your session.

- Lead with the point: what happened, what changed or what you need.
- Name things by what they are. Give a task key, ID or file path together with what it is, and use only names the reader already knows.

## Sandbox

Sandboxed `npm` fails on its cache with a misleading "run sudo chown" error. Pass `--cache "$TMPDIR/npm-cache"` instead.

## Repository skills

`/lowdefy-mock` (an HTML mockup in the app's Ant Design look), `/mock-to-lowdefy` (a mockup into Lowdefy page config) and `/design-tasks-ui` (a mockup-driven design into ordered tasks).
