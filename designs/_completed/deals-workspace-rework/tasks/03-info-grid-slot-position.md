# Task 3: Inject host info-grid tiles before People and Files

> **As built — item 4 below no longer holds.** This task correctly left `apps/demo`
> alone, but the demo was changed in a later, separate commit: with no tiles
> injected, nothing in this repo exercised either the reordering or the re-keyed
> form-data read. It now ships a `qualification` tile and a `request_stages` stage
> as a reference consumer. See the `apps/demo` entry under Files changed in
> `design.md`.

## Context

The deal workspace's detail panel contains an "info grid" of half-width tiles, assembled by
`modules/deals/components/detail/section_info_grid.yaml`:

```yaml
blocks:
  _build.array.concat:
    - - _ref: components/detail/section_fields.yaml   # Details — full width, self-hiding
    - - _ref: components/detail/section_people.yaml
      - _ref: components/detail/section_files.yaml
    - _module.var: components.info_grid_slots          # ← host tiles, appended LAST
```

Host apps inject their own tiles through the `info_grid_slots` var, which currently **appends** them
after People and Files. A host wants its tiles ahead of the module's, and moving the injection point
is the whole of the change — one entry moves up the concat.

The design considered and rejected three richer alternatives (an ordered whole-grid var with the
built-in tiles exported as components, a position-keyed object, and two extra named slot vars). Each
achieved exact ordering control at the cost of either a breaking config change or permanent module
surface, and bought only which pair of tiles shares a row. **Do not implement any of them.**

## Task

**1. Move the slot injection point in `section_info_grid.yaml`** so `components.info_grid_slots` sits
between the Details entry and the People/Files group:

```yaml
blocks:
  _build.array.concat:
    - - _ref: components/detail/section_fields.yaml
    - _module.var: components.info_grid_slots          # ← moved up
    - - _ref: components/detail/section_people.yaml
      - _ref: components/detail/section_files.yaml
```

Update the surrounding comments — the existing ones describe the slots as "App-injected info-grid
tiles ... the shipped grid has no product tile; host apps inject their own tiles here" and note the
span-12 ordering as "People, Files, then host-injected tiles". Both need to reflect the new order.

**2. Update the var description in `modules/deals/module.lowdefy.yaml`.** Under
`vars.components.info_grid_slots`, the description currently reads "Extra blocks appended to the
deal's info grid." It must say the blocks are inserted **before** the built-in People and Files tiles.
While there, check the parent `components` var description (which lists the slot names) — it needs no
change unless it also claims append semantics.

**3. Regenerate the docs.** `docs/deals/reference/vars.md` is generated from the manifest by
`scripts/gen-var-docs.mjs` and carries a "do not edit by hand" marker. Run `pnpm docs:gen` from the
repo root and commit the regenerated output in this same change, so `pnpm docs:check` never sees an
inconsistent intermediate state.

**4. Do not change `apps/demo`.** It sets no `info_grid_slots`, so moving the injection point has no
effect on it, and it needs no new consumer for this — no capability is being added.

## Acceptance Criteria

- `section_info_grid.yaml`'s concat order is Details → host slots → People/Files, and its comments
  describe that order.
- `module.lowdefy.yaml`'s `info_grid_slots` description states the blocks are inserted before the
  built-in tiles, with no remaining claim that they are appended.
- `pnpm docs:gen` has been run and `docs/deals/reference/vars.md` reflects the new description.
- `pnpm docs:check` passes.
- `pnpm ldf:b` from `apps/demo` compiles cleanly, and the demo's info grid is visually unchanged
  (it injects no tiles).
- No new var is introduced, nothing is renamed, and no component is added to
  `exports.components`.

## Files

- `modules/deals/components/detail/section_info_grid.yaml` — modify — move the `info_grid_slots` concat entry above the People/Files group; update comments.
- `modules/deals/module.lowdefy.yaml` — modify — `info_grid_slots` description: inserted before the built-in tiles.
- `docs/deals/reference/vars.md` — modify — regenerated output, not hand-edited.

## Notes

- **This task is the one that could be invalidated.** The design carries a blocking open question:
  whether the issue author accepts the resulting tile pairing. Tiles are span-12, two per row, so the
  rows depend on how many tiles the host injects — with two injected tiles the host's pair sits on the
  top row and People/Files below, which is *not* the pre-cutover arrangement (that had one host tile
  paired with People). If the author rejects it, this task is replaced by one of the rejected
  alternatives and becomes materially larger. Confirm before starting if that answer hasn't landed.
- Host config is untouched by this change: a host already listing its tiles in its preferred order
  gets them in that order, just earlier in the grid.
- `section_fields.yaml` (Details) is self-hiding and carries its own trailing divider, so a host that
  disables it via `show_details: false` sees its own tiles first with no stray divider. Don't add
  divider handling.
