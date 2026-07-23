# Lowdefy Modules MongoDB

Monorepo of reusable Lowdefy modules backed by MongoDB.

## Client Names

Never use client names in design documents, commits, or any content tracked in git. Use generic terms — "an existing app", "existing solutions", "production apps". If a design requires app-specific configuration details (e.g., extracting code from a specific app), add a single anonymous reference at the top of the design file and use that name throughout. Designs that don't need app-specific config (e.g., performance improvements) should not reference specific apps at all.

## Designs

**Designs are the source of truth for code decisions and rationale** — why it was built this way, which alternatives were rejected, constraints that shaped the implementation. Code implements designs; when they disagree, update the design first or flag the mismatch.

**`docs/` is the source of truth for consumer-observable authoring behavior** — how a module behaves, how to configure it, what vars it accepts. When a design and `docs/` disagree about **behavior**, `docs/` wins and the design gets a note. When they disagree about **rationale**, the design wins. Do not "fix" `docs/` to match a stale design — stale designs describe how something was planned, not how it works now.

Designs under `designs/_completed/` are already implemented — treat as read-only history. Add notes documenting deviations if helpful, but handle any changes in a new design/task.

Never move design folders into `_completed/` unless the user explicitly requests it.

**Resolve the open question; don't defer it.** When a design or review surfaces a verifiable factual question ("does this operator behave X or Y?", "what does the SDK do on conflict?", "is this block prop supported?"), answer it now — vendor docs, open-source source, a tiny probe — and bake the verified answer into the design/task. Don't punt with "verify at code time" or "spike during implementation" unless the answer genuinely requires running code in a real environment. Pushing the work down the line means the same question gets re-asked later by someone with less context, or the implementer guesses and the design ships on an unverified assumption.

## Principles

**One correct way.** Prefer APIs, manifests, and shared components that enforce the pattern mechanically over conventions that rely on each caller remembering to follow them. Opt-in correctness drifts; mandatory wrappers don't. Favour this even when it means a bit more scaffolding up front — understanding multiple implementations costs more than writing one.

**Check the docs before spiking.** If a question is "how does this operator behave?" or "what does this block prop do?", search the Lowdefy / AgGrid / MongoDB docs first — it's usually faster and more reliable than a code spike or a live probe. Spikes are for things the docs can't answer (real runtime behaviour, integration quirks).

**Build for concrete needs, not speculation.** A need is _concrete_ when you can point to it — a stated requirement, a design, a real production use. It's _speculative_ when it's a "what if": a `var`, slot, flag, `when:` branch, or "what if this fails?" wrapper added in case it's wanted later. Speculative surface is design surface you owe forever, so don't add it on a guess — wait until a concrete need actually surfaces. And don't generalize ahead of evidence: build for the cases you've seen, not the ones you've imagined — three identical modules beat one module with three variants, and a second variant earns its abstraction only when a second concrete case appears. This is where agent-driven changes go wrong most: "extra checks and features" added to look thorough are the top source of accidental complexity.

**Don't over-restrict.** A restriction — a guard, a validation, a rejected input, a special case — earns its place only when it prevents a _real, harmful_ mistake. Forbidding the unusual-but-harmless is not free: every restriction is more surface a consumer must learn and remember, and it can block a legitimate use case nobody anticipated. Unnecessary restriction is its own form of complexity — cognitive overhead paid by every consumer, in exchange for guarding against nothing. So when a behaviour would be harmless if simply allowed, prefer allowing it _uniformly_ over special-casing it away: consistent behaviour everywhere is easier to reason about, and more intuitive to build against, than a patchwork of bespoke prohibitions. This is the restriction-side mirror of "build for concrete needs" — just as you don't add features on a guess, don't add prohibitions on a guess.

**Absence of a caller is not absence of need.** The trap is concluding a need is _speculative_ just because you can't see it used — turning "I found no evidence for X" into "X isn't needed." It doesn't follow. Above all, don't read the demo as a census: `apps/demo/` exercises the modules; it does not represent production, which lives in other repos. "No caller does X" or "the demo only does Y" proves nothing about what's needed. A demo audit can confirm a pattern is _possible_ or _wired correctly_ — it can never prove a capability is _unneeded_. When you can't point to evidence either way, decide on the API's own merits (correctness, "one correct way", the cost of the surface), never on the demo's coverage.

**Comments describe the current code, not the story of writing it.** A comment earns its place by telling a future reader something the code can't tell them itself: an external constraint, a non-obvious invariant, or a "why this and not the obvious alternative" where the alternative is genuinely tempting and genuinely wrong. It does _not_ earn its place by narrating history — what the code used to be, what a task/part removed or renamed, what old file this replaces, or why some now-deleted approach was abandoned. That history belongs in the design doc, commit, or PR (per **Designs** above), never in source. A "we used to X / Part N dropped Y / replaces old Z" note reads to the next agent as an unsettled question and reopens a closed decision; it also depends on context (a part number, a deleted file, an old field name) the reader doesn't have. **Test:** does the comment describe the code, or the journey to it? If it only makes sense to someone who remembers the previous version — starts with "used to", "no longer", "previously", "Part N …", "replaces", "instead of the old" — it's journey. If the whole comment is journey, delete it. If it wraps a real constraint in history framing, rewrite it to state only the constraint. Never leave commentary that exists only as a reply to a problem you just solved.

## Project Structure

```
apps/demo/          — Demo app that imports all modules
modules/            — Reusable Lowdefy modules
plugins/            — Custom Lowdefy plugins
docs/               — Repo-level docs (shared idioms, per-module references)
```

## Building & Running the App

Agents almost always want to **verify config compiles**, not run a live server. Reach for the right command:

- **Build check (default):** `pnpm ldf:b` from `apps/demo` (or `pnpm --filter @lowdefy/modules-demo ldf:b` from the root). This is the only command needed to confirm YAML/config compiles. It needs **no secrets, no Infisical, and no network beyond npm** — the script supplies a build-only `NEXTAUTH_SECRET` placeholder (and respects a real `NEXTAUTH_SECRET` if one is exported). Build failures here are real config errors; act on them.
- **Never run servers in the foreground.** `lowdefy dev` (`pnpm ldf` / `pnpm ldf:d`), `lowdefy start`, and `pnpm e2e` are long-running processes that **never exit** — a plain foreground call blocks until timeout and looks like a hang. If you genuinely need one, start it in the background and poll its health URL (`/api/auth/session`); otherwise don't run it for a build check.
- **The `:i` (Infisical) variants don't work in the sandbox.** `ldf:b:i` / `ldf:d:i` / `ldf:i` fetch secrets from `app.infisical.com`, which the sandbox network blocks (TLS rejected). Use plain `ldf:b` for build checks.
- **A build check is not a smoke test.** Running the app (dev server, e2e) needs real secrets (`MONGODB_URI`, etc.) and a reachable MongoDB — that's a human or `/r:dev-test` step, not part of an autonomous build gate.
- **`pnpm build` at the repo root does _not_ build the demo.** It's `pnpm -r --filter '!@lowdefy/modules-demo' run build` — module/plugin bundles only. To build the app, use `ldf:b`.

**Always add a demo consumer when adding module functionality.** Any new consumer-facing capability — a component or export, a new var/slot, a new block behaviour — must ship with at least one real example consumer in `apps/demo/` that exercises it, in the same change. This gives every capability a build-verified reference and a worked example authors can copy, and it's how you validate the feature actually resolves end-to-end (`ldf:b`, then inspect the generated `.lowdefy/server/build/pages/**` artifacts). This does not contradict "absence of a caller is not absence of need" above: that rule forbids _deleting_ capability because the demo lacks a caller; this rule requires _adding_ a caller when you add capability. Prefer wiring the example into an existing demo page/flow over a throwaway page.

## Documentation

Consumer-facing documentation lives in `docs/`. Source-side READMEs (`modules/{name}/README.md`, `plugins/modules-mongodb-plugins/README.md`, block READMEs) are stubs that point into `docs/` — do not add content to them.

**`docs/` tree layout:**

- `docs/index.md` — Root landing page (module list, dependency graph, "what to use when", consumer basics).
- `docs/{module}/index.md` — Module landing page (required for every module).
- `docs/{module}/concepts/` — Concept pages (added only where the module needs them).
- `docs/{module}/how-to/` — Goal-oriented guides (added only where the module needs them).
- `docs/{module}/reference/` — Reference pages; `vars.md` is always generated (see below).
- `docs/shared/` — One file per consumer-facing cross-cutting idiom: `change-stamps.md`, `event-display.md`, `slots.md`, `app-name.md`, `avatar-colors.md`, `secrets.md`, `soft-delete.md`, `org-scoping.md`.
- `docs/plugins/` — Plugin package overview (`index.md`) and one reference page per block.

Most small modules are just `docs/{module}/index.md` + generated `docs/{module}/reference/vars.md`. Add `concepts/` or `how-to/` subdirectories only when the module genuinely needs them.

**Front-matter schema** — every file in `docs/` must open with a YAML front-matter block:

```yaml
---
title: Page Title # required
module: workflows # required — module name, "root", "shared", or "plugins"
type: index # required — index | concept | how-to | reference | shared
concepts: [foo, bar] # optional — key concepts; used by llms.txt
---
```

See `docs/CONTRIBUTING.md` for the canonical field definitions.

**Generated files** — do not hand-edit these:

- `docs/{module}/reference/vars.md` — generated by `scripts/gen-var-docs.mjs` from each module's `module.lowdefy.yaml`.
- `docs/llms.txt` — generated by `scripts/gen-llms-txt.mjs`; also lints front-matter across all docs. Run `pnpm docs:gen` to regenerate both.

Both files are committed. `pnpm docs:check` (`--check` mode for both generators) runs on every PR via `.github/workflows/ci.yaml` and fails if either is out of date or front-matter is invalid.

**Manifest is the source of truth for var schema.** Every var (top-level and nested) in `module.lowdefy.yaml` must carry `description:`, `type:`, and (where applicable) `default:` / `required:` / `enum:`. `docs/{module}/reference/vars.md` is **generated** from the manifest by `scripts/gen-var-docs.mjs` — when you add or change a var, update the manifest first, then run `pnpm docs:gen`. Do not hand-edit `vars.md`. (`pnpm docs:check` enforces no drift.)

## Lowdefy Module System

### Using Modules

Modules are added to the `modules` array in `lowdefy.yaml`:

```yaml
modules:
  - id: user-admin
    source: "github:lowdefy/modules-mongodb/modules/user-admin@v1.0.0"
    dependencies:
      layout: layout
    vars:
      collection: users
```

Module entry fields:

- `id` — Unique identifier, controls namespace for scoped IDs and page paths
- `source` — GitHub repo (`github:owner/repo@ref`) or local path (`file:./path`)
- `vars` — Values passed to module, accessible via `_module.var`
- `connections` — Remap module connection names to app connection IDs
- `dependencies` — Map abstract dependency names to concrete module entry IDs

### Module Manifest (module.lowdefy.yaml)

Each module has a manifest declaring its interface:

```yaml
name: User Admin
description: User administration

vars:
  collection:
    type: string
    default: users

dependencies:
  - id: layout
  - id: events

exports:
  pages:
    - id: all
    - id: view
  components:
    - id: user-avatar
  menus:
    - id: default

components:
  - id: user-avatar
    component:
      _ref: components/user-avatar.yaml

pages:
  - _ref: pages/all.yaml
  - _ref: pages/view.yaml

menus:
  - _ref: menus.yaml

plugins:
  - name: "@lowdefy/blocks-aggrid"
    version: "^4"

secrets:
  - name: MONGODB_URI
```

### Cross-Module Dependencies

Modules reference each other via dependencies declared in the manifest.

**Auto-wiring:** If a module declares a dependency and a module entry with the same `id` exists, the build wires them automatically. No `dependencies:` mapping needed in the app config.

**Explicit wiring:** Only needed when entry IDs don't match dependency names:

```yaml
- id: contacts
  source: "github:my-org/crm/contacts@v1"
  dependencies:
    layout: app-layout # declared "layout", entry is "app-layout"
```

### Consuming Module Resources

**Pages and APIs** — auto-included, auto-scoped with entry ID prefix. URLs: `/{entryId}/{pageId}`.

**Components** — reusable config fragments via `_ref`:

```yaml
- _ref:
    module: layout
    component: page
    vars:
      id: all
      title: Contacts
      blocks: [...]
```

Components can export any config — blocks, enum maps, config templates. Use `key` to extract nested values:

```yaml
icon:
  _ref:
    module: events
    component: event_types
    key: login.icon
```

**Menus** — included via `_ref` with `module` and `menu`:

```yaml
links:
  _ref:
    module: user-admin
    menu: default
```

### ID Scoping

The build auto-scopes page IDs, connection IDs, API endpoint IDs, and menu item IDs with the module entry ID prefix. Block IDs and request IDs are NOT scoped.

### Module Var Operators

- `_module.var: key` — access module entry vars (from app config)
- `_var: key` — access `_ref`-level vars (local composition between files)
- `_module.pageId: page-name` — resolve to scoped page ID
- `_module.connectionId: conn-name` — resolve to scoped connection ID
- `_module.endpointId: endpoint-name` — resolve to scoped endpoint ID
- Cross-module page reference: `_module.pageId: { id: page, module: dep-name }`

## Lowdefy Project Rules

Rules and patterns for working with Lowdefy projects. These are practical conventions learned from development — not documentation.

- **Snake case request IDs** — Use snake_case for all Lowdefy request IDs (e.g., `get_lot` not `get-lot`). This applies to the `id` field in request YAML files and all references to request IDs.
- **Enum files for config maps** — Extract hard-coded maps keyed by a pre-defined set (e.g. gate colors, discipline labels, status config) into enum files (e.g. `enums/gates.yaml`, `enums/disciplines.yaml`). Load these into global state nested under the `enums` key (e.g., `_global: enums.gates`, `_global: enums.disciplines`) instead of duplicating the maps inline in `_js` blocks. Do NOT extract plain selector `options` (label/value arrays) into enum files — the label/value schema is exclusive to selectors. Only create an enum for selector options when there are styling values (colors, icons) associated with the value, or the value needs to be prettified on a view page or filter.
- **JS operator globals** — In `_js` blocks, access global state with `lowdefyGlobal('key')` (not `global('key')`). Access page state with `state('key')` (not `state.key`). Outside `_js`, use the standard `_global` and `_state` operators.
- **File naming conventions** — Use kebab-case for page files, API files, and directory names (e.g., `lot-view.yaml`, `save-linked-document.yaml`). Use snake_case for component files, request files, action files, and enum files (e.g., `gate_modal_s0.yaml`, `get_lot.yaml`, `options_enum.yaml`).
- **Kebab-case page IDs** — Use kebab-case for app page IDs since they become URL paths (e.g., `my-tickets`, `ticket-view`). Module pages use semantic verbs instead: `all`, `view`, `edit`, `new` (URLs become `/{module-entry}/all`, `/{module-entry}/view`, etc.).
- **Request ID verb prefixes** — Prefix request IDs with the operation verb: `get_`, `insert_`, `update_`, `set_`, `event_`, `selector_` (e.g., `get_company`, `insert_company`, `event_insert_company`).
- **Change stamp on writes** — Include a change stamp (`_ref: change_stamp.yaml`) on all database write operations to track timestamp, user, and app context.
- **Extract deep blocks via \_ref** — Extract blocks into separate component files via `_ref` when nesting exceeds ~3-4 levels or when a block is reused across pages. Pass data via `vars`.
- **Conditional skip on actions** — Use the `skip` property with operators (`_eq`, `_ne`) to conditionally execute actions rather than wrapping in complex `_if` blocks.
- **Format dates with `_dayjs`** — Use `_dayjs.format` or `_dayjs` chain mode to format dates, not `_date.format`. The `_date` operator is only for creating date objects (e.g., `_date: now`), not for formatting display strings.
- **Kebab-case API IDs** — Use kebab-case for API endpoint IDs (e.g., `save-linked-document`, `remove-linked-document`). This matches the kebab-case file naming convention and applies to the `id` field in API YAML files.
- **AgGridBalham for all tables** — Always use `AgGridBalham` as the table block type, never `AgGridMaterial` or other AG Grid themes.
- **Prefer Lowdefy blocks over Html** — When adding a new UI element, first search Lowdefy's built-in blocks for an equivalent that can be styled to match the design. Only fall back to `Html` blocks when no suitable Lowdefy block exists.
- **Operators before `_js`** — Prefer Lowdefy operators (`_if`, `_eq`, `_array`, etc.) for data transformations. Only use `_js` when operator chaining becomes deeply nested or hard to read, and keep the embedded JS as simple as possible.
- **Input block IDs match data paths** — Set input block IDs to the exact state path where the data is stored (e.g., `id: lot.gates.s5.contractor` not `id: s5_contractor`). This ensures auto-binding reads and writes to the correct location, so form data can be sent as a subtree (e.g., `_state: lot.gates.s5`) without manual field mapping.
- **Register new APIs in lowdefy.yaml** — When adding a new API endpoint file, always add a corresponding `_ref` entry in the `apis` section of `lowdefy.yaml`. An API file that isn't referenced in `lowdefy.yaml` won't be loaded by the framework.
- **Snake_case block IDs** — Use snake_case for all block IDs (e.g., `gate_s0_title_row`, `s1_link_doc_btn`). Do not use kebab-case for block IDs; kebab-case is reserved for page IDs and API endpoint IDs.
- **Snake_case action IDs** — Use snake_case for action IDs in event handlers (`onOk`, `onClose`, etc.), e.g., `save_gate`, `reset_lot_state`, `refetch_lot`. The same snake_case convention that applies to block IDs and request IDs also applies to action IDs.
- **Operator dot notation and composition** — Most Lowdefy operators (`_state`, `_global`, `_request`, `_step`, `_payload`, etc.) support dot notation for nested access (e.g., `_step: get_lot.gates.s0`). Operator values can also be composed — any operator that evaluates to a string is valid as the value (e.g., `_request: { _string.concat: ['get_', 'lot'] }`). Prefer dot notation over `_get` with `from`/`key` for simple nested access.
- **Domain-driven page directories** — Organize pages into domain subdirectories with each page in its own directory containing `components/`, `requests/`, and `actions/` subdirs (e.g., `pages/tickets/ticket-view/ticket-view.yaml` with `components/`, `requests/`, `actions/` alongside). Do not place page files flat in the `pages/` directory.
- **Co-located API directories** — Place API endpoint files under the domain directory that owns them (e.g., `pages/tickets/api/tickets-close-ticket/tickets-close-ticket.yaml`), not in a top-level `api/` directory. Each API gets its own directory matching its ID.
- **Entity-prefixed API IDs** — Prefix API endpoint IDs with the entity name followed by the action (e.g., `tickets-close-ticket`, `companies-update-billing-config`, `tasks-update-priority`). This scopes the endpoint to its domain and avoids naming collisions.
- **Extract request pipeline stages** — Extract reusable or complex MongoDB pipeline stages (`$match`, `$lookup`, `$project`, etc.) into a `requests/stages/` subdirectory and reference them with `_ref` in the main request pipeline.
- **Extract action sequences to files** — Extract multi-step event action sequences into separate files under an `actions/` subdirectory within the page directory (e.g., `actions/filter_refetch.yaml`). Reference them with `_ref` in event handlers.
- **Shared domain directories** — Place cross-app resources (requests, components, enums, APIs) under `/apps/shared/{domain}/` organized by domain (e.g., `shared/tickets/`, `shared/contacts/`, `shared/enums/`). Reference from apps with `../shared/` paths.
- **YAML block sequences for operators** — Use YAML block sequences (one item per line) for logical/comparison operators like `_eq`, `_ne`, `_or`, etc. Do not use inline flow sequences like `_eq: [val1, val2]`.
- **Static branches over dynamic keys** — Prefer static per-case branches with hardcoded paths (e.g., `_if`/`_then` with `gates.s0.checklist`) over dynamically constructing MongoDB dot-notation keys at runtime via `_object.fromEntries` + `_string.concat`. Static branches are easier to read and debug.
- **No underscore-prefixed aggregation fields** — Do not prefix temporary field names or state keys in MongoDB aggregation pipelines with underscores (e.g., use `totalCount` not `_totalCount`). Lowdefy interprets underscore-prefixed strings as operators, which causes parsing errors.
- **Audit state refs when changing input blocks** — When adding, removing, or renaming an input block, audit all references to its `id` across the page (operators like `_state`, `_if`, `_eq`, requests, actions, and API payloads) since input block IDs are auto-bound state paths and any change silently breaks code that reads from or writes to that path.
- **Gap before margins** — When adjusting spacing between sibling components, first use the parent's `layout.gap` property to set uniform spacing between all direct children. Only add individual `margin` styles when the spacing needs to be non-uniform or when extra spacing is needed beyond the gap.
- **Modular component extraction** — Extract repeated block patterns into reusable component files and reference them via `_ref` with `vars`. Place cross-page components under `apps/shared/components/`. Use `.yaml.njk` when vars need string interpolation in IDs or inline values; use plain `.yaml` with `_var` when vars only appear in operator positions.
- **Nunjucks over Html+\_js** — Prefer the `_nunjucks` operator over `Html` blocks with `_js`-constructed HTML strings. Nunjucks templates are more readable and keep markup declarative.
- **Payload, not state**: requests receive state via `payload:` mapping, never inline `_state` in pipeline properties.
- **`_build.*`** operators for build-time logic; `_if`/`_eq`/etc. for runtime.

## Block & config knowledge — the `lowdefy-docs` MCP

Per-block schema, props, examples, and concept docs come from the **`lowdefy-docs` MCP**, served by the running dev server — release-exact for this project, including local plugins. It is the source of truth for anything block-, operator-, action-, or concept-specific; **never guess a type name or prop**. This MCP **supersedes the former per-topic guides and `r:lowdefy-*` skills** — reach for it for all Lowdefy lookups. Invoke the `/lowdefy-config` skill, or call the `lowdefy_*` tools directly:

- `lowdefy_overview` → `lowdefy_list_types` (blocks/operators/actions/connections/requests) — discover exact names first.
- `lowdefy_get_schema` / `lowdefy_get_examples` — the exact contract + real YAML for a type.
- `lowdefy_get_doc` / `lowdefy_search_docs` — concept docs.
- Feedback loop after every edit: `lowdefy_build_status` → `lowdefy_get_page_config` → `lowdefy_screenshot_page`; `lowdefy_find_config` locates an id; `lowdefy_scaffold_page` creates a canonical page.
- Live debugging: `lowdefy_inspect_state`, `lowdefy_eval_operator`, `lowdefy_run_request`.

The MCP's `concepts/modules` and `concepts/module-authoring` docs are the authoritative reference for the **module system** (manifest, `_module.*`, scoping, exports, cross-module deps, dynamic defaults, publishing). The "Lowdefy Module System" section above is this repo's specific layer on top of them.

> The `lowdefy-docs` MCP ships with the dev server. If it isn't reachable, ask the developer to start it (`pnpm ldf:d`). A build check (`pnpm ldf:b`) does not require it.
>
> **If the MCP server is down, STOP and ask the user to reconnect it — do not guess or work around it.** The server runs on localhost, so it may simply be off or disconnected. Don't proceed with Lowdefy lookups until it's back up.

## Repo-specific conventions

Repo conventions the MCP does not cover — naming (snake/kebab case), change stamps, enum files, status arrays, contact/`user_contacts` fields, file structure, domain-driven page layout — live in the **"Lowdefy Project Rules"** section above and in **`docs/`** (the source of truth for consumer-observable module behavior). Consult those, not per-topic skills.

## Repo skills

Skills authored in this repo (`.claude/skills/`), for the mockup → Lowdefy pipeline:

- `/lowdefy-config` — Look up type names, schemas, and examples from the running dev server (wraps the `lowdefy-docs` MCP).
- `/lowdefy-mock` — Author a pipeline-ready HTML mockup in the app's Ant Design look.
- `/mock-to-lowdefy` — Convert a mockup into Lowdefy page config (frame → layout → content).
- `/design-tasks-ui` — Break a mockup-driven design into an ordered implementation task set.
