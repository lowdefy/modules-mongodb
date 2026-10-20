---
name: lowdefy-config
description: Use when writing or editing Lowdefy YAML config — pages, blocks, operators, actions, connections, or requests. Looks up exact type names, schemas, and examples from the running dev server instead of guessing.
lowdefy-skill-hash: 99496b8362f764fad26a74cc8f8568bf0f55c6f545034674f572624feb48f6fb
---

# Writing Lowdefy config

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

Never guess type names or properties. Before writing config:

1. Call `lowdefy_list_types` to find the exact type name — this includes this project's local plugins.
2. Call `lowdefy_get_schema` for the exact properties and events of that type.
3. Call `lowdefy_get_examples` to see real usage YAML for blocks.
4. For concepts (state, operators, events, requests), call `lowdefy_get_doc` or `lowdefy_search_docs`.

## Icons and interactive HTML

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

## Testing a change

Verify a change by running the app's journeys (`tests/journeys/`) with `lowdefy_run_tests`:

- Run `tier: common` first: the most-used journeys, ranked by production use, a quick check of the
  happy paths.
- Widen to `tier: edge` before you call the change done: the edge cases real users still reach.
  Journeys with no production counts for their current steps run in every tier.
- In a terminal the same runs are `lowdefy test --config-directory <app> --tier common` and
  `lowdefy test --config-directory <app> --tier edge`.
- A tier is refused when the app has too little production use pulled; then run without `tier`.

## Visual feedback

Developers can press `Cmd/Ctrl+/` in the running app to point at, draw on, and comment on
what's on screen; the annotation helper copies an agent-readable feedback block to their
clipboard, which they paste to you. Pasted blocks start with "Feedback:" and include the
config file and line each annotation refers to — treat them as precise UI feedback and use
`lowdefy_inspect_state` for the page's live state.
