# Task 11: The `welcome` namespace var — six pieces of consumer-authored copy

## Context

The chat page's empty state is six pieces of copy, all of it consumer-authored rather than
derived from the catalog:

- a title;
- a line naming what the assistant can see;
- a label and a starter-prompt list per track — one track asks a question, the other builds a
  report.

**Why not catalog-derived.** The obvious way to write the "what I can see" line is from the
catalog's collection descriptions — the module already has that map, and a derived line can never
go stale. It is rejected because **a collection is not an entity a user recognises**: a nested
object inside one collection is routinely a thing users ask about by name while the collection
holding it is a name they have never seen, several collections can be one entity to a user, and a
collection can be internal plumbing that should not appear in a welcome at all. The manifest's own
`catalog` documentation says as much — the per-collection `description` is "what the collection
holds — **prompt material for the agent**", and using it as user-facing copy repurposes a field
written for a model as a field written for a person. The same argument reaches the track labels:
an app whose users do not call the output a "report" would otherwise get consumer-authored
starters under a module-authored heading. The accepted cost is drift.

**One namespace var, not six flat ones**, for a build reason rather than tidiness: a namespaced
var is typo-fatal and a flat one is silent. `validateRequiredVars` in `@lowdefy/build`'s
`registerModules.js` walks the consumer's keys against `properties` and throws on an undeclared
one, listing what is declared; at the top level it walks the manifest's definitions instead, so a
misspelled flat var name is not an error, it is nothing at all.

**Two levels, not three.** `scripts/gen-var-docs.mjs` gives each object var one sub-section
listing its properties and stops there — a property that is itself an object renders as a single
row reading `object` and its own leaves never appear. No module in this repo nests three deep. So
the tracks flatten into leaf names rather than a `tracks` sub-object.

**Defaults resolve per leaf.** `resolveNamespaceVar` in `buildRefs/walker.js` builds the object by
resolving each declared property independently — the consumer value wins one leaf at a time and
any omitted leaf falls back to that leaf's own `default`. So partial configuration is safe by
construction, and structure cannot make a label mandatory alongside its starters; the label's
default is what covers that.

**What defaults and what does not**, split by whether the copy is a fact about the app or
furniture:

- **Furniture ships with defaults** — the title and both track labels, and the starter prompts
  too. They are true in any app, and this is the surface the whole sub-design exists to teach on:
  leaving it blank until configured would make discoverability opt-in for the one feature whose
  point is that the user should not have to know something in advance. A generic starter is safe
  because clicking one **fills** the composer rather than sending it, so a near-miss is an
  editable first draft.
- **App facts stay absent when unset** — the data-scope line. There is no generic sentence about
  what an app's assistant can read, and a wrong one is a promise the agent then fails to keep.

`modules/contacts/module.lowdefy.yaml:27-46` is the shape to follow for an object var with
`properties:`.

## Interfaces

- **Produces:** `_module.var: welcome` resolving to an object with the six leaves below, consumed
  by the page's empty state (task 15) and overridden partially by the demo (task 16).

## Task

**`modules/reporting/module.lowdefy.yaml`** — add to `vars:`:

```yaml
welcome:
  type: object
  description: >
    Copy for the chat page's empty state — the surface that teaches both of the
    module's jobs. …
  properties:
    title: { type: string, default: … }
    data_scope: { type: string } # NO default
    explore_label: { type: string, default: … }
    explore_starters: { type: array, default: […] }
    report_label: { type: string, default: … }
    report_starters: { type: array, default: […] }
```

Every property, and the `welcome` var itself, carries a full `description` and `type`, plus
`default` where one is shipped — the manifest is the source of truth for var schema.

- `title` — the heading above both tracks. Ship one.
- `data_scope` — one line naming what the assistant can see, in the words this app's users use.
  **No `default`.** Its description must say what unset means: the line is not rendered at all,
  and it never falls back to collection names — an absent affordance beats a wrong one, and there
  is no generic true sentence here. Say why it is not derived from the catalog, briefly, and point
  at `catalog`'s `description` being prompt material for the agent.
- `explore_label` / `report_label` — the heading over each track's starters. Ship generic ones
  along the lines of "Get an answer" and "Build a report", and note in the description that an app
  whose users do not call the output a report should override them.
- `explore_starters` / `report_starters` — string arrays of prompt text. Ship a few generic ones
  each. Note in the description that clicking a starter **fills** the composer rather than sending
  it, which is what makes a generic default safe.

Write the shipped defaults so they read sensibly against no particular app's data — the demo
(task 16) overrides only some of them precisely to build-verify that partial configuration works.

Then run **`pnpm docs:gen`** from the repo root and commit the regenerated
`docs/reporting/reference/vars.md` and `docs/llms.txt`. Do not hand-edit either.

## Acceptance Criteria

- `pnpm docs:check` passes from the repo root — no drift, front-matter valid.
- `docs/reporting/reference/vars.md` documents all six leaves in the `welcome` sub-section, with
  `data_scope` showing no default.
- `pnpm ldf:b` from `apps/demo` builds with the module entry setting none of the `welcome`
  properties — every furniture leaf resolves to its default and `data_scope` resolves absent.
- A module entry setting `welcome: { titl: 'typo' }` **fails the build** with an error naming the
  declared property set. This is the whole reason the var is namespaced; verify it once by hand
  and revert.

## Files

- `modules/reporting/module.lowdefy.yaml` — modify — the `welcome` var
- `docs/reporting/reference/vars.md` — regenerate — `pnpm docs:gen`
- `docs/llms.txt` — regenerate — `pnpm docs:gen`

## Notes

**The name collides with `AgentChat`'s own `welcome` property**, which this page deliberately
leaves unset (the block flattens its `prompts` into a single row and declares no areas, so two
tracks cannot live inside it). Two different things called `welcome` on one page: the module var
carrying the copy, and the block property that stays empty. Kept anyway — `welcome` is the right
name for the consumer-facing var. Refer to the other one as "the block's `welcome`" wherever both
appear, including in the var's description.

No var derives from the catalog. If a later change is tempted to add one, that is a design
question, not an implementation one.
