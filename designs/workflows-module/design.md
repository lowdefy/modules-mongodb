# Workflows Module — Implementation Design

This design carves the [workflows-module-concept](../workflows-module-concept/design.md) into 20 independently-implementable parts. Each part is a small, testable unit of work with a stateable contract to its neighbours — a coherent code change a single contributor can hold in their head and a reviewer can approve in one pass.

The concept design committed _what_ the module does and _why_. This design commits _how the work is split for delivery_ — where each capability lives, in what order parts ship, and what contract sits at each seam. Source rationale stays in the concept folder; parts link back rather than restate.

## Layers

The 20 parts group into 5 layers by where they live in the runtime stack:

| Layer             | Parts | Concern                                                                 |
| ----------------- | ----- | ----------------------------------------------------------------------- |
| Foundational      | 1–3   | Upstream Lowdefy primitives + plugin scaffold the module depends on     |
| Build-time config | 4     | YAML grammar + the validator that turns it into runtime config          |
| Engine handlers   | 5–11  | Server-side `WorkflowAPI` connection handlers and their internal pieces |
| Resolvers         | 12–15 | Build-time emitters that turn workflow YAML into Lowdefy Apis and pages |
| UI delivery       | 16–18 | Page templates, shared pages, and entity-page components                |
| Surface           | 19–20 | Module manifest + four operational Apis + demo wiring                   |

## Parts

Each part has its own folder under [parts/](parts/) with a `design.md` containing: goal, in-scope artifacts (with exact identifiers), out-of-scope deferrals to other parts, dependencies, verification, and open questions. The concept sub-design carrying the full rationale is linked at the top.

| #   | Part                                                                    | Source concept sub-design                                                                                                                         | Size |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | [call-api-primitive](parts/01-call-api-primitive/design.md)             | [call-api](../workflows-module-concept/call-api/spec.md)                                                                                          | S    |
| 2   | [dynamic-module-pages](parts/02-dynamic-module-pages/design.md)         | (new — upstream module-system extension)                                                                                                          | S    |
| 3   | [engine-plugin-shell](parts/03-engine-plugin-shell/design.md)           | [engine](../workflows-module-concept/engine/spec.md)                                                                                              | M    |
| 4   | [workflow-config-schema](parts/04-workflow-config-schema/design.md)     | [action-authoring](../workflows-module-concept/action-authoring/spec.md)                                                                          | M    |
| 5   | [start-cancel-handlers](parts/05-start-cancel-handlers/design.md)       | [engine](../workflows-module-concept/engine/spec.md)                                                                                              | M    |
| 6   | [submit-action-writes](parts/06-submit-action-writes/design.md)         | [engine](../workflows-module-concept/engine/spec.md) + [submit-pipeline](../workflows-module-concept/submit-pipeline/spec.md)                     | L    |
| 7   | [group-state-machine](parts/07-group-state-machine/design.md)           | [action-groups](../workflows-module-concept/action-groups/spec.md)                                                                                | M    |
| 8   | [side-effect-dispatch](parts/08-side-effect-dispatch/design.md)         | [submit-pipeline](../workflows-module-concept/submit-pipeline/spec.md)                                                                            | M    |
| 9   | [hook-invocation](parts/09-hook-invocation/design.md)                   | [submit-pipeline](../workflows-module-concept/submit-pipeline/spec.md)                                                                            | M    |
| 10  | [tracker-subscription](parts/10-tracker-subscription/design.md)         | [engine](../workflows-module-concept/engine/spec.md)                                                                                              | S    |
| 11  | [group-on-complete-fanout](parts/11-group-on-complete-fanout/design.md) | [action-groups](../workflows-module-concept/action-groups/spec.md) + [submit-pipeline](../workflows-module-concept/submit-pipeline/spec.md)       | S    |
| 12  | [resolver-pages](parts/12-resolver-pages/design.md)                     | [action-authoring](../workflows-module-concept/action-authoring/spec.md) + [ui](../workflows-module-concept/ui/spec.md)                           | M    |
| 13  | [resolver-apis](parts/13-resolver-apis/design.md)                       | [action-authoring](../workflows-module-concept/action-authoring/spec.md) + [submit-pipeline](../workflows-module-concept/submit-pipeline/spec.md) | M    |
| 14  | [form-components-library](parts/14-form-components-library/design.md)   | [action-authoring](../workflows-module-concept/action-authoring/spec.md)                                                                          | M    |
| 15  | [resolver-form-builder](parts/15-resolver-form-builder/design.md)       | [action-authoring](../workflows-module-concept/action-authoring/spec.md)                                                                          | M    |
| 16  | [page-templates](parts/16-page-templates/design.md)                     | [ui](../workflows-module-concept/ui/spec.md) + [submit-pipeline](../workflows-module-concept/submit-pipeline/spec.md)                             | M    |
| 17  | [shared-pages](parts/17-shared-pages/design.md)                         | [ui](../workflows-module-concept/ui/spec.md)                                                                                                      | M    |
| 18  | [entity-components](parts/18-entity-components/design.md)               | [ui](../workflows-module-concept/ui/spec.md)                                                                                                      | M    |
| 19  | [operational-apis](parts/19-operational-apis/design.md)                 | [module-surface](../workflows-module-concept/module-surface/spec.md)                                                                              | M    |
| 20  | [module-manifest](parts/20-module-manifest/design.md)                   | [module-surface](../workflows-module-concept/module-surface/spec.md)                                                                              | S    |

S ≈ 1 reviewer-day. M ≈ 2–4 reviewer-days. L ≈ 1–2 weeks (may sub-split).

## Dependency graph

| #   | Part                     | Depends on |
| --- | ------------------------ | ---------- |
| 1   | call-api-primitive       | —          |
| 2   | dynamic-module-pages     | —          |
| 3   | engine-plugin-shell      | —          |
| 4   | workflow-config-schema   | —          |
| 5   | start-cancel-handlers    | 3, 4       |
| 6   | submit-action-writes     | 3, 4, 5    |
| 7   | group-state-machine      | 4, 6       |
| 8   | side-effect-dispatch     | 1, 6       |
| 9   | hook-invocation          | 1, 6, 7, 8 |
| 10  | tracker-subscription     | 5, 6, 7    |
| 11  | group-on-complete-fanout | 1, 7, 9    |
| 12  | resolver-pages           | 2, 4       |
| 13  | resolver-apis            | 2, 4, 6    |
| 14  | form-components-library  | —          |
| 15  | resolver-form-builder    | 4, 14      |
| 16  | page-templates           | 12, 13, 15 |
| 17  | shared-pages             | 13, 15, 19 |
| 18  | entity-components        | 4, 19      |
| 19  | operational-apis         | 5, 7       |
| 20  | module-manifest          | all        |

Hard gates:

- **Parts 1 and 2** (upstream) ship before anything in the workflows module proper. Both are small.
- **Parts 3 and 4** unblock the rest. They can run in parallel.
- **Part 6** is the load-bearing engine work — parts 7–10 each extend its lifecycle in an orthogonal way and can ship in parallel after 6 lands.
- **Part 11** lands after 7 (which surfaces `completed_groups`) and 9 (which owns `context.callApi` invocation patterns).
- **Parts 12–15** can stream alongside 6–11 (the resolvers don't depend on the runtime, only on the YAML config from part 4).
- **Parts 16–18** (UI) can stream alongside 12–15 (templates only need the API contracts, not the resolver emission).
- **Part 19** depends on engine handlers (5, 6, 7, 10).
- **Part 20** is the closeout — manifest + demo wiring after everything else.

## Conventions across parts

- **Each part links its source concept sub-design.** Full rationale lives there; parts only carry the implementation-shaped restatement.
- **"Out of scope / deferred to" points at the part that picks up the rest.** No floating TODOs.
- **Identifiers are exact.** Function names, plugin handler names, page ids, API ids, YAML keys, file paths — all match the concept spec verbatim so /r:design-task can produce literal task prompts.
- **Open questions are part-local.** Cross-cutting unknowns stay in the [concept open-questions list](../workflows-module-concept/design.md#cross-cutting-open-questions-and-risks).

## Next steps

Each part is ready for `/r:design-task workflows-module/parts/{n-name}` to produce ordered implementation task prompts. Suggested shipping order matches the dependency graph above.

The worked-example onboarding workflow in [workflows-module-concept/design.md](../workflows-module-concept/design.md#worked-example--end-to-end-across-all-seven-sub-designs) remains the v1 integration smoke target — after part 20 lands the demo app exercises every part.
