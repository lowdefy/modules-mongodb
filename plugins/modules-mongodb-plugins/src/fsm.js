// Back-compat re-export: the FSM tables moved to the workflows SDK
// (workflows-sdk-split design). Prefer importing from
// `@lowdefy/mongodb-workflows-sdk/fsm` directly.
export { FSM_TABLES, hasReview } from "@lowdefy/mongodb-workflows-sdk/fsm";
export { default } from "@lowdefy/mongodb-workflows-sdk/fsm";
