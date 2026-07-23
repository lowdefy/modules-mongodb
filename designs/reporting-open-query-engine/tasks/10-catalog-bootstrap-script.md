# Task 10: Catalog Bootstrap Script (AI-Drafted, Human-Curated)

## Context

For production schemas, hand-writing field-by-field catalog descriptions across dozens of collections is the biggest adoption cost. This script drafts the catalog; a human curates and checks it in. The curated file is the trusted artifact — generation is scaffolding, never a runtime path.

Repo conventions that apply: standalone scripts live in the repo-root `scripts/` directory (alongside `gen-var-docs.mjs`, `gen-llms-txt.mjs`) and read secrets from `LOWDEFY_SECRET_<NAME>` env vars (see `apps/demo/scripts/seed-reporting-domain.mjs` for the pattern). The reporting module already routes model calls through an AI gateway (`AI_GATEWAY_API_KEY` secret, model id via the module's `model` var) — reuse that access pattern rather than introducing a new SDK dependency.

The catalog shape this emits is task 4's: `{ [collectionName]: { roles, description, fields: { [name]: { type, description, values?, format?/currency?/locale?/decimals? } }, relationships } }`.

## Task

Create `scripts/gen-reporting-catalog.mjs`, operator-run (`node scripts/gen-reporting-catalog.mjs [--db <name>] [--out <path>]`):

1. **Connect with the read-only principal** — the same credential the engine uses (its provisioning is already a deployment step, task 9). URI from `LOWDEFY_SECRET_<NAME>` (document the exact env var in the script header and `--help`).
2. **Sample and infer:** list collections; for each, `$sample` a bounded number of documents (e.g. 100) and infer per-field types from the sampled values (union of observed BSON types, dotted sub-document fields flattened one level, arrays noted). Detect candidate enum fields (low-cardinality strings across the sample) with their observed values.
3. **Model drafting:** send the inferred schema + a redacted value sample to a model (via the AI gateway pattern; model id configurable via env/flag) to draft: per-field `description`s, confirmation of enum candidates (`values`), display hints (money-shaped names/values → `format: currency`), and `relationships` inferred from naming + value overlap (`company_id` → `companies._id`). The model NEVER drafts `roles`.
4. **Emit fail-closed YAML:** write the draft catalog with **every collection entry commented out** — uncommenting an entry is the curator's act of declaring that collection (an active entry with empty `roles` is open to any authenticated user, so activation must be deliberate). Include a generated header explaining exactly that, plus the empty-roles semantics and a pointer to the catalog reference docs.
5. **Drift-friendly output:** deterministic key ordering (collections and fields sorted) so re-running against a drifted schema produces a draft that diffs cleanly against the curated file — the diff doubles as schema-drift detection. Note this in the header.

Handle gracefully: unsampleable/empty collections (emit a stub entry, still commented), model-call failure (emit the type-inference-only draft with empty descriptions and a warning — the script must still produce useful output without the model).

## Acceptance Criteria

- Run against the seeded demo database produces a draft covering the demo collections, fully commented out, with plausible types, enum candidates for the known enum fields (e.g. `region`, `status`), a currency hint on `total`, and the activities→companies-style relationship detected.
- `roles` never appears with AI-generated content — only as an empty/commented placeholder for the curator.
- Re-running twice against the same database produces byte-identical drafts (modulo model nondeterminism in descriptions — types/structure/ordering must be stable; consider caching or temperature 0 to keep description churn low).
- The script never writes to the database (read-only principal enforces this; the script also uses only reads).
- Script header documents: purpose, env vars, the fail-closed convention, and that this is never a runtime path.

## Files

- `scripts/gen-reporting-catalog.mjs` — create

## Notes

Before writing the model-call code, load the `claude-api` skill if calling Anthropic directly turns out to be simpler than the gateway — but prefer the existing gateway pattern for consistency (one key, one access path). Keep the drafting prompt in the script (visible, reviewable), not a separate file.
