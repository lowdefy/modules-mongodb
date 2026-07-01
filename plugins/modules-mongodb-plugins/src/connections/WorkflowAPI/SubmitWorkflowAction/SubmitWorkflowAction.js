import createEngineContext from "../../shared/phases/createEngineContext.js";
import handleSubmit from "./handleSubmit.js";

/**
 * SubmitWorkflowAction connection resolver (design D2/D3; task 15).
 *
 * Composes the engine context once per invocation via the shared
 * `createEngineContext` step (mint + request-context fields + getMongoDb) and
 * hands it to `handleSubmit`, which runs the load → pre-hook → plan → commit →
 * tracker-cascade → post-hook phase composition.
 *
 * No `mongoDBConnection` / `createMongoDBConnection` — loads go through the
 * engine `findDocs` (load phase) and hooks/events/notifications through
 * `callApi`, so the rebuilt path never touches the community wrapper.
 */
async function SubmitWorkflowAction(lowdefyContext) {
  const context = await createEngineContext(lowdefyContext);
  return handleSubmit(context);
}

SubmitWorkflowAction.schema = {};
SubmitWorkflowAction.meta = {
  checkRead: false,
  checkWrite: true,
};

export default SubmitWorkflowAction;
