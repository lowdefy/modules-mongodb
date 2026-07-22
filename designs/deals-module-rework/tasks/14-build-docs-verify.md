# Task 14: Module — changeset, docs, build + runtime verification

## Context

Final Workstream D task: package the deals-module change for release, refresh docs, and verify the full round trip end-to-end in the demo. This mirrors the release hygiene applied to Workstreams A–C.

## Task

**1. Changeset** — add a changeset for the `deals` module (minor bump): the create form and detail view now expose host domain fields through a single `fields` var (inputs on create, read-only via SmartDescriptions on the view); the five domain-taxonomy vars and top-level `product` are removed. Note it as a breaking-ish config change for any consumer (hosts must migrate their domain fields to `fields`).

**2. Docs** — run `pnpm docs:gen` then `pnpm docs:check`. Update `docs/deals/index.md` (and any quickstart/config snippet) to document the `fields` var and drop references to the removed taxonomy vars. Ensure the generated `reference/vars.md` reflects the new manifest.

**3. Build** — `CI=true pnpm ldf:b` from `apps/demo` green. Clean up `.lowdefy` build artifacts and restore the lockfile if the build pollutes it (`rm -rf apps/*/.lowdefy`, `git checkout pnpm-lock.yaml`).

**4. Runtime verification** (demo): create a deal → confirm the host `fields` render as inputs on the create form, the domain values save under `attributes.*`, the deal view renders them read-only via SmartDescriptions, and the deals list behaves (product column/filter if re-added). Confirm the deal-subtitle header is description-only.

**5. Scrub** — grep the full module diff for client/industry residue (`material`, `sector`, packaging values, tonnage/currency identifiers). The module must carry zero domain-field knowledge; all such content lives only in `apps/demo`.

**6. Host-reconstitution note** — record (in the PR/commit body, per the design's Verification gate) that the demo reconstitutes all seven domain fields via config, and that the origin app does the same in Phase D. This gate is a manual developer-side check (host is a private repo), not CI-automatable.

## Acceptance Criteria

- Changeset present for `deals` (minor).
- `pnpm docs:check` green; `docs/deals/index.md` + generated `reference/vars.md` document `fields` and omit the removed vars.
- `CI=true pnpm ldf:b` green; lockfile clean.
- Runtime round trip verified (create → save `attributes.*` → SmartDescriptions view → list).
- Module diff scrub-clean (no domain-field/industry residue).

## Files

- `.changeset/*.md` — create — deals minor changeset.
- `docs/deals/index.md` — modify — document `fields`; drop removed taxonomy vars.
- `docs/deals/reference/vars.md` — regenerate via `docs:gen`.

## Notes

- Do not push or open a PR — Workstream D folds into draft PR #111 with the A–C commits; pushing awaits explicit permission.
- If the runtime check surfaces a field that can't round-trip through config, stop and surface it — that's a design defect (the host-reconstitution obligation), not something to patch around in the demo.
