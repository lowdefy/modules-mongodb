// Server-side plugin connections. Each export is a module-shaped
// `{ schema, requests: { RequestType: handlerFn } }` object — see
// designs/workflows-module-concept/engine/spec.md.

export { default as WorkflowAPI } from './connections/WorkflowAPI/WorkflowAPI.js';
