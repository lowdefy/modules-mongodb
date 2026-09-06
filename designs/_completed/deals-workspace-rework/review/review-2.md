# Review 2

Second pass after review 1's resolutions replaced the design's central mechanism (the info-grid seam) and reversed two other decisions. Scope is what changed; review 1's settled findings are not re-raised.

### 1. Open question 6 gates item 4 — it is not a confirmation

> **Resolved (auto).** Reclassification only, no design change — it does gate item 4, so the document now says so. Open questions split into a **Blocking — answer before scoping the release** section carrying this one, and a numbered non-blocking list for the rest. The blocking entry states that a "no" reverts item 4 to one of the three rejected alternatives and enlarges the work, and that the answer is cheap to obtain (the two pairings rendered side by side). Getting that answer is a real-world action outside this design's control — flagged to the user in the resolve summary.

The design asks the issue author whether they accept the new tile pairing (Company | Product over People | Files) and files it last among six open questions, phrased as needing confirming "rather than assuming".

It is more than that. Issue item 4 asked for the pre-module layout, and the whole of the current approach — move one line, no new var, nothing breaking — exists *because* exact fidelity was judged not worth its cost. If the author says no, the resolution to review-1 #2 reverts to one of the three alternatives the design explicitly rejects in the same section, every one of which costs either a breaking config change or permanent module surface. That is not a detail to settle during implementation; it decides which design gets built.

Two consequences the document should carry: mark it as **blocking item 4** rather than a general open question, and note that the answer is cheap to get (a screenshot of the two pairings) and worth getting *before* the release is scoped, since the fallback is materially larger work.

### 2. "One full-width card" is ambiguous, and the obvious reading nests card chrome

> **Resolved.** Ambiguity confirmed: `open_items_row.yaml:7` is a `Box`, and it renders inside `detail_card`, which is a real `Card` — so "one full-width card" could reasonably have produced a nested bordered card. Settled on **no container chrome**: the component stays a `Box`, its two span-12 columns become full-width sections, and the existing small-caps `ACTIONS`/`TASKS` `Html` headers remain the only labelling. Consistent with the tile grid, related deals and timeline tabs, which are all unchrome'd. Both alternatives are recorded as weighed-and-dropped — a subtle bordered block reusing the meta strip's treatment (the one chrome'd section in the panel), and a real `Card`. Wording corrected in the proposed change, the decision section and Files Changed. Also flagged that the discovery mockup showed a titled bordered container, so a reviewer comparing the two sees the chrome was dropped on purpose.

Proposed change 1 and the decision section both describe the combined open-items surface as "one full-width card" / "one stacked card". The problem is what `card` means here.

`components/detail/open_items_row.yaml` is a **`Box`** today (`:7`), containing two span-12 `Box` columns each with its own `Html` section header. It has no Card block. And it renders inside `detail_card` (`pages/view.yaml:637`), which *is* a `Card`, with `.body` padding of 8px.

So an implementer reading "one full-width card" can reasonably introduce a `Card` block — putting a bordered, titled card inside the bordered detail card, one of the more visible ways to make a panel look wrong. The alternative reading, which is almost certainly what is meant, is the existing Box with the two columns stacked and the existing Html headers retained.

Say which. If Card chrome genuinely is wanted, say that the containing card's own chrome or padding is adjusted to absorb it.

### 3. The collapse decision doesn't cover the `sm` breakpoint

> **Resolved.** Premise holds, but the finding's breakpoint was wrong and the correction supplied the answer. Lowdefy's grid keys are counterintuitive: the **top-level `span` applies from md (≥768px) up** (`deriveLayout.js:131` → `--lf-span-md`), while `sm: {span: 24}` sets the base for everything below (`:148`) — so the boundary is 768px, not 576/640. Because top-level `span` only bites at md+, a span-based collapse is automatically a no-op below it, so no breakpoint-aware visibility is needed (which Lowdefy would make awkward — `visible` reads state, not media queries). Settled on **one collapsed state doing two things**: hide the card body (search, list, pagination) and drop the span to a rail. Renders as the rail at ≥768px and a full-width header-only strip below — the latter a genuine mobile improvement, since the `calc(100vh - 110px)` list stacks above the workspace there and currently forces a full screen of scrolling. Recorded with the breakpoint semantics, since they are easy to misread.

`deal_list_col` is `layout: { span: 5, sm: { span: 24 } }` (`pages/view.yaml:112-115`), so below the `sm` breakpoint the deal list is full width and stacks *above* the workspace rather than beside it. `workspace_col` mirrors it at `span: 19, sm: 24`.

The collapse decision describes one geometry: span 5 → narrow rail, with `workspace_col` 19 → 23. At `sm` that has no meaning — there is no side-by-side arrangement to reclaim width from, and a "narrow rail" would be a full-width strip above the workspace containing nothing but a chevron. The design says nothing about it.

This needs a decision, not just a note: either the toggle is hidden below `sm` (leaving the stacked full-width list, which is the sane mobile layout), or collapsing at `sm` means something different — collapsing the list's *height* to just its header, say. The first is simpler and probably right; either way it is a second state the implementer otherwise has to invent.

### 4. The pairing rationale holds only for exactly two host tiles

> **Resolved (auto).** Factual correction. The claim that the change yields "host tiles above module tiles" was true only of the host app's tile count. Replaced with a table giving the rows for 0, 1, 2 and 3 injected tiles, and an explicit statement that the tidy split is a property of the number two rather than of the mechanism. Matters because this is the pairing the issue author is asked to accept (#1) — the description they see should be true of what the module does. The demo's 0-tile case (`People | Files`, unchanged) is now covered too.

The info-grid decision explains the outcome as "the two host-supplied domain tiles on the top row, the two module-owned relational tiles below". That is true of the host app's current config, which injects exactly two tiles, and of nothing else.

Tiles are span-12, two per row, and injected tiles now come first — so with **one** host tile the rows are `HostTile | People` and `Files` alone; with **three**, `Host | Host` then `Host | People` then `Files`. The clean "host row above module row" split is a coincidence of the number 2, not a property of the mechanism.

This matters because the design is asking the issue author to accept that specific pairing (see #1). The description offered to them should be true of what the module will do, not of one config that happens to produce a tidy result — and the demo, which injects nothing, gets `People | Files` on one row and no host row at all.

### 5. Two host files will deliberately disagree about the shape of `workflows`

> **Resolved (auto).** Documentation correction of a verified fact. The Host follow-through line noting `deal_card_fields.yaml` is unaffected read as reassurance; replaced with a callout stating the two shapes coexist **by design** — module-built and workflow-type-keyed in `vars.yaml`, self-built flat and `$unset` at `deal_card_fields.yaml:89-91` — that there is no runtime conflict because the flat one never leaves its own aggregation, and an explicit **do not "align" them**, since re-keying the self-built field would break it.

After the re-key in proposed change 6, the host reads workflow form data two different ways:

- `modules/deals/vars.yaml:213-220` — `$workflows.prospecting.volumes.annual_volume_ton`, off the **module-built, workflow-type-keyed** alias.
- `modules/deals/stages/deal_card_fields.yaml:30,39,42` — `$workflows.volumes.annual_volume_ton`, off a **flat, action-keyed** field the host's own stage builds with its own `$lookup`.

Both live under `modules/deals/`, both are host-owned, both use the field name `workflows`, and they will have different shapes. Verified this is not a runtime bug — `deal_card_fields.yaml:89-91` `$unset`s `workflows` before the results leave the pipeline, so nothing downstream sees the flat shape. It is an authoring trap: the rename work requires editing both files, and the natural instinct on seeing the mismatch is to "fix" one to match the other, which silently breaks whichever it touches.

The design's Host follow-through notes that `deal_card_fields.yaml` is "self-built, so ... **not** affected by the module's re-keying", which is correct but reads as reassurance rather than warning. State positively that the two shapes differ *by design*, and why.

### 6. The fixed card width has no value, and the tunability decision disappeared silently

> **Resolved.** Set to a **180px module constant**, with the derivation recorded so the number isn't arbitrary: after item 8 narrows the detail column the strip has ~730px on a 1920px viewport (workspace 19/24 of page, detail 12/24 of that, less 8px card-body padding), and the floor is ~150px set by the top row's deal code beside a stage chip (`Fulfillment` being the longest current title). 180px shows about four cards with ten reachable by scrolling. Constant rather than a var, decided explicitly rather than by omission: no host has notably longer deal codes or stage titles, and this design has twice declined to add module surface ahead of a consumer needing it — the reasoning that settled the info-grid seam applies unchanged. Promote to a var if a consumer needs it.

Proposed change 3 now rests on the compact cards being fixed-width, which is what makes the count limit meaningful. The design never says what that width is, and — unlike the earlier draft, which exposed a related-deals size var — nothing is host-tunable any more. That var was dropped from Files Changed during the resolution without the design recording it as a decision.

The width is the one number that determines how many cards are visible before the strip scrolls, and it is being chosen for a detail column that proposed change 5 is simultaneously narrowing from 14/24 to 12/24 of the workspace. Name it, and say whether it is a module constant or a var — a constant is defensible with two consumers, but it should be a stated choice rather than an omission.
