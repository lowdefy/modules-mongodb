# Task 9: Document the MCP-facing endpoints and the rules an app author must follow

## Context

The module cannot enforce the most important rule in this design. `mcp` is
**app-level config**: the app author decides which endpoints become tools, and
nothing in `ai-reporting` can stop them listing `query-data`. So the prohibition
has to live where the app author will actually look, which is `docs/ai-reporting/`.

`docs/` is the source of truth for consumer-observable authoring behaviour. Three
things belong there and exist nowhere else today: which endpoints are
MCP-suitable and their intended `scope` tag, the `query-data` prohibition and its
reason, and the two preconditions (the version bump, and the consent page that
does not exist yet in any module here).

Existing structure: `docs/ai-reporting/` has `index.md`, `concepts/`
(`open-query-engine.md`, `ownership.md`, `implementation-walkthrough.md`),
`how-to/` and `reference/`. Front-matter is mandatory and linted.

## Interfaces

- **Consumes:** the three endpoints from tasks 5, 6 and 7, and their final ids,
  descriptions and payload schemas.

## Task

1. Create `docs/ai-reporting/how-to/expose-reports-over-mcp.md` with valid
   front-matter:

   ```yaml
   ---
   title: Expose reports over MCP
   module: ai-reporting
   type: how-to
   concepts: [mcp, authorization, open-query-engine]
   ---
   ```

   Content, in this order:

   - **What this gives you** — an outside agent pulling a saved report's resolved
     data, with the app's own authorization: the MCP caller is a real app user, so
     `owner.user_id` scoping and per-viewer role gates carry over with no new
     visibility rule.
   - **The three endpoints to list**, with their `scope` tag (`mcp:read` for all
     three) and the `mcp` block that lists them. Show the block, and note that the
     tool name is derived — `id.replaceAll('/', '__')` over the entry-scoped id —
     so an app mounting the module as `reporting` gets `reporting__get-report`,
     and a tool description can never hardcode a sibling's name.
   - **Never list `query-data`.** Its own section, stated as a prohibition with
     the reason: it takes a caller-authored `collection` + `pipeline`, and the
     open engine deliberately has no field-level scoping — with no field scoping,
     an empty pipeline (or `$replaceRoot: { newRoot: "$$ROOT" }`, or `$getField`)
     returns every field of every touched collection, up to the injected row
     limit. That is an accepted consequence in-app, where the caller is a
     signed-in user in a browser session; over MCP the same capability goes to a
     third-party agent holding a long-lived bearer token, driven by a model, on
     infrastructure the app operator does not control. Same authorization,
     materially different exposure. Link to `concepts/open-query-engine.md`.
   - **Two preconditions**, stated as blocking: a Lowdefy version carrying the MCP
     server route (the repo's current pin predates it), and `auth.oauthProvider`,
     which needs a consent page — one line of app config, but the page it points
     at does not exist in any module here yet.
   - **What the caller must check before reporting a figure** —
     `truncated_sections` and `failed_sections`, and why: every pipeline carries an
     unconditional 1000-row cap, so a section returning exactly 1000 rows is a
     partial answer that looks complete. Include the reference response shape.
   - **A rate bound is your responsibility and is not solved here.** Nothing in
     the framework throttles `/api/mcp` or API endpoints generally — rate limiting
     exists only under `auth`, guarding the login endpoints. A report with a dozen
     query-backed sections is a dozen pipelines per call, and an agent loop is not
     human-paced. Say plainly that whether anything fronts the deployment that
     bounds request rate must be answered before enabling the block in a real app.

2. Add the page to `docs/ai-reporting/index.md`'s navigation, alongside the other
   how-to entries.

3. Run `pnpm docs:gen` and commit both generated files.

## Acceptance Criteria

- `pnpm docs:check` passes — it runs in CI and fails on stale generated files or
  invalid front-matter.
- `docs/llms.txt` reflects the new page.
- Every endpoint id, tool name and payload key in the page matches what tasks 5–7
  actually built. Read the endpoint files; do not write the docs from this task
  description.

## Files

- `docs/ai-reporting/how-to/expose-reports-over-mcp.md` — create
- `docs/ai-reporting/index.md` — modify — link the new page
- `docs/llms.txt` — regenerate via `pnpm docs:gen`

## Notes

- **Do not hand-edit `docs/ai-reporting/reference/vars.md` or `docs/llms.txt`.**
  Both are generated; `vars.md` comes from the module manifest via
  `scripts/gen-var-docs.mjs`. This design adds no module vars, so `vars.md` should
  come back unchanged from `docs:gen` — if it changes, something in the manifest
  moved that this design did not intend.
- Source-side READMEs (`modules/ai-reporting/README.md`) are stubs that point into
  `docs/`. Do not add content there.
- The endpoints' own `description` fields are consumer-facing text too — they are
  what an agent reads to choose a tool. If writing this page reveals that one of
  them is unclear, fix the endpoint's `description` rather than compensating for
  it in prose here.
