# Review 1

Two changes directed by the user to the empty state, both moving copy out of the catalog and
into consumer-defined vars. Recorded here with what each one touches, and the one shape
question they raise together.

### 1. The "what I can see" line is consumer-defined free text, not derived from the catalog

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

The catalog itself says as much. `modules/reporting/module.lowdefy.yaml:32-59` documents the
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

**Directed: "Get an answer" and "Build a report" become vars the module consumer defines.**

The vars section currently carries `welcome_title`, `starters_explore` and `starters_report`
(line 110) — the starter _prompts_ are already consumer copy, but the two headings above
them are not: they live as hard-coded copy in the rationale ("the left column is 'ask a
question', the right is 'build a report'", line 30) and in plate 1 as `Get an answer` /
`Build a report`. An app whose users do not call the output a "report" gets consumer-authored
starters under a module-authored heading.

### 3. Shape question the two changes raise together — one object var or five flat ones

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
