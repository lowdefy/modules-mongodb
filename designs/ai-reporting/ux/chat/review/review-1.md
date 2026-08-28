# Review 1

Two changes directed by the user to the empty state, both moving copy out of the catalog and
into consumer-defined vars. Recorded here with what each one touches, and the one shape
question they raise together.

### 1. The "what I can see" line is consumer-defined free text, not derived from the catalog

> **Resolved.** Accepted as directed. The design now carries a rationale section, "The empty
> state's copy is consumer-authored, not catalog-derived", holding the collection-is-not-an-entity
> argument, the manifest's own "prompt material for the agent" wording, and the drift cost stated
> as accepted. The line becomes the `data_scope` property of a new `welcome` var and is the one
> property with **no default** — unset renders no line, never a fallback to collection names.
> The parent design's claim that the welcome's collection names derive from the catalog is
> updated with it; the save sheet's field derivation is untouched.

**Directed: replace the catalog-derived collection list with a free-text var the module
consumer writes.**

The design derives the line from the catalog's collection descriptions in three places —
proposal 1 ("a line naming what the assistant can see, derived from the catalog's collection
descriptions", line 13), the rationale ("Naming the collections the assistant can see (from
the catalog's descriptions)", line 32), and the vars section, which rules a var out
explicitly ("The collection names in the welcome derive from the catalog's descriptions — no
var", line 110). `wireframes.html` draws the result literally: `I can read: orders,
companies, contacts, activities.`

The reason that is wrong: **a collection is not an entity a user recognises.** In an existing
app, `close_the_loop` is a nested data object inside the `interviews` collection, but users
think of the two as separate things they can ask about — so a catalog-derived line both
omits one of them and offers a name nobody uses. The mapping fails in the other direction
too: several collections can be one entity to a user, and a collection can be internal
plumbing that should never appear in a welcome at all.

The catalog itself says as much. `modules/ai-reporting/module.lowdefy.yaml:32-59` documents the
per-entry `description` as "what the collection holds — **prompt material for the agent**".
Using it as user-facing copy repurposes a field written for the model as a field written for
a person, and the two want different words.

Consequences to carry:

- The parent design decides this too and has to change with it: `../design.md:106` says "The
  collection names in the welcome **and** the fields the save sheet offers both derive from
  the catalog — no var for either." Only the welcome half is in scope here; leave the save
  sheet's field derivation alone unless [save-as-report](../../save-as-report/design.md)
  says otherwise.
- New var in the manifest with full `description` / `type` / `default`, then `pnpm docs:gen`.
- **Accept the drift.** Free text can go stale when a consumer adds a collection and forgets
  the copy, where the derived line could not. That is the cost of the change and the design
  should record it as accepted rather than leave it unstated — the derived line was accurate
  about the wrong thing.
- Unset should mean the line is **absent**, not a fallback to collection names, matching how
  the design already treats an unset var elsewhere (an absent affordance beats a wrong one).

### 2. The two track labels are consumer-defined too

> **Resolved.** Accepted as directed, as `explore_label` and `report_label` on the `welcome` var.
> Unlike the data-scope line, both **ship defaults** — they are furniture that is true in any app,
> and the empty state is the surface this whole sub-design exists to teach on, so leaving it blank
> until configured would make discoverability opt-in. The design records that split (facts stay
> absent when unset, furniture defaults) in "The module ships default copy, and the consumer
> overrides it", which also settles the same question for the starter prompts: they get generic
> defaults, safe because a starter fills the composer rather than sending it, so a near-miss is an
> editable first draft.

**Directed: "Get an answer" and "Build a report" become vars the module consumer defines.**

The vars section currently carries `welcome_title`, `starters_explore` and `starters_report`
(line 110) — the starter _prompts_ are already consumer copy, but the two headings above
them are not: they live as hard-coded copy in the rationale ("the left column is 'ask a
question', the right is 'build a report'", line 30) and in plate 1 as `Get an answer` /
`Build a report`. An app whose users do not call the output a "report" gets consumer-authored
starters under a module-authored heading.

### 3. Shape question the two changes raise together — one object var or five flat ones

> **Resolved — one `welcome` namespace var, two levels, six properties**
> (`title`, `data_scope`, `explore_label`, `explore_starters`, `report_label`, `report_starters`).
>
> The reason given here for nesting does not hold, and reading `@lowdefy/build` is what settled it.
> `resolveNamespaceVar` in `buildRefs/walker.js` resolves a `properties:` var **one leaf at a
> time** — the consumer value wins per leaf, every omitted leaf falls back to its own `default`. So
> `tracks.report: { starters: […] }` with no label resolves to the default label, exactly as a flat
> `report_starters` with no `report_label` would. No manifest structure can make two leaves
> mandatory together; the label default is what covers the drift, which is why finding 2's defaults
> decision matters more than the nesting did.
>
> The namespace still wins, on a different argument: **it is typo-fatal where flat vars are
> silent.** `validateRequiredVars` in `registerModules.js` checks the consumer's keys against
> `properties` and throws on an undeclared one, listing the declared set; at the top level it walks
> the manifest's definitions instead, so a misspelled flat var name is not an error, it is nothing
> at all. That is the mechanical enforcement `CLAUDE.md` prefers, and it is the whole case for the
> object.
>
> **Two levels, not the three sketched above,** because `scripts/gen-var-docs.mjs` renders exactly
> one level of nesting: an object property inside an object var appears as a single row reading
> `object` and its leaves are never documented. Nothing in `modules/` nests three deep. So the
> tracks flatten into leaf names and `vars.md` documents all six with no generator change.
>
> One consequence worth carrying to implementation: the var's name collides with `AgentChat`'s own
> `welcome` property, which this page deliberately leaves unset. Kept, and the design now names the
> block's one as the block's everywhere it appears.

Findings 1 and 2 push the welcome to five pieces of consumer copy: `welcome_title`, the
data-scope line, and a label plus a starter list per track. Five flat top-level vars is one
option; the alternative is one nested var whose shape makes the pairing mechanical, e.g.

```yaml
welcome:
  title: …
  data_scope: …
  tracks:
    explore: { label: …, starters: […] }
    report: { label: …, starters: […] }
```

Worth deciding rather than defaulting, because a label and its starters are a unit — flat
vars let a consumer set `starters_report` and forget the label beside it, which is the
"opt-in correctness drifts" failure `CLAUDE.md` warns about. Either way every var, top-level
and nested, needs `description` / `type` / `default` in `module.lowdefy.yaml`, and the demo
entry must set them so both tracks render with real text and the vars are build-verified
(the design's demo list already asks for this, line 125).
