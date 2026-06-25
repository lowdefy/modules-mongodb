# Task 7: Documentation — one enriching timeline, enrichment vars, remove two-timeline material

## Context

Part 50 collapses the split entity timeline into one events-module-owned timeline
that self-enriches with action cards when `actions_collection` is set. The consumer
docs still describe the old two-timeline / swap model and must be updated to the
one-timeline model. `docs/` is the source of truth for consumer-observable
authoring behaviour.

Known stale material (verified):

- `docs/events/index.md:61` — describes `events-timeline` as "Events-only … renders
  no workflow action cards. Apps using workflows … use the workflows module's
  `workflows-events-timeline` component instead." This is now wrong: there is one
  timeline that enriches via `actions_collection`.
- `docs/events/reference/vars.md` — generated; regenerated in task 4 after the
  manifest var changes. This task only verifies it is current.
- `docs/workflows/reference/exports.md` — the `workflows-events-timeline` row and
  the `check-action-click` mention of it were corrected in task 6; verify here.

This task is the consumer-docs sweep. Tasks 4 and 6 already touched the generated
`vars.md` and the workflows exports table respectively; this task owns the prose:
the events module page and any other doc describing the two-timeline model.

## Task

### 1. Events module page (`docs/events/index.md`)

- Rewrite the `events-timeline` bullet (~line 61) to describe the **one** timeline:
  events-only by default; set `actions_collection` on the events module entry to
  enrich every entity timeline in the app with action cards (verb-filtered,
  link-collapsed server-side); set `contacts_collection` to resolve author avatars.
  Remove the pointer to `workflows-events-timeline`.
- Add a short subsection (or extend the relevant one) documenting the enrichment
  model and the two new vars:
  - `actions_collection` (default null) — turns on action-card enrichment app-wide;
    null ⇒ events-only, renders identically to a pure-CRM app.
  - `contacts_collection` (default null) — author-avatar join; null ⇒ initials.
  - Note it is an **app-wide** switch on the events entry (not per-entity), and that
    entities with no workflow actions render exactly as before (empty join).
- Include the worked example (events entry with `actions_collection: actions` +
  `contacts_collection`) from the design.
- Front-matter: ensure `module: events`, `type: index`; add `concepts:` keys if
  appropriate (e.g. `[timeline, enrichment]`).

### 2. Sweep for remaining two-timeline / swap material

Search the docs tree and remove/rewrite any remaining references to the dropped
model:

```
grep -rln "workflows-events-timeline\|events_tile\|two timeline\|swap.*timeline\|replaceable" docs/
```

- `docs/workflows/reference/exports.md` — confirm task 6 removed the
  `workflows-events-timeline` row and fixed the `check-action-click` row (it should
  now describe `check-action-click` as baked into `actions-on-entity` only).
- Any workflows concept/how-to page that tells consumers to use
  `workflows-events-timeline` for an enriched timeline — repoint to "set
  `actions_collection` on the events module entry."
- The original Part 50 `components.events_tile` slot / "replaceable-region" idiom
  was never built, so there should be nothing to retract — but grep to confirm.

### 3. Regenerate generated docs

Run `pnpm docs:gen` and commit any changes to `docs/events/reference/vars.md` and
`docs/llms.txt`. Run `pnpm docs:check` to confirm no drift and valid front-matter.

## Acceptance Criteria

- `docs/events/index.md` describes one self-enriching timeline and the
  `actions_collection` / `contacts_collection` vars; no mention of
  `workflows-events-timeline` or a two-timeline/swap model.
- `grep -rln "workflows-events-timeline" docs/` returns nothing.
- No docs page instructs consumers to use a separate workflows timeline component
  for enrichment; enrichment is documented as the `actions_collection` var on the
  events entry.
- `pnpm docs:gen` produces no uncommitted changes after commit; `pnpm docs:check`
  passes (no drift, valid front-matter).

## Files

- `docs/events/index.md` — modify — one-timeline model + enrichment vars + worked example.
- `docs/workflows/reference/exports.md` — verify (corrected in task 6).
- `docs/workflows/**` — modify — any page repointing consumers from
  `workflows-events-timeline` to the `actions_collection` var (grep-driven).
- `docs/events/reference/vars.md`, `docs/llms.txt` — regenerate via `pnpm docs:gen`.

## Notes

- `modules/events/README.md` is a stub by convention — do not add content there;
  consumer docs live under `docs/events/`.
- Do not hand-edit `vars.md` or `llms.txt` — they are generated. Edit the manifest
  (done in task 4) and run `pnpm docs:gen`.
