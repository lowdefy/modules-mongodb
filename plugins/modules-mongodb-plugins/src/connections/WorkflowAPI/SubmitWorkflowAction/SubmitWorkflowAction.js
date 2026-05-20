import { randomUUID } from "node:crypto";

import createMongoDBConnection from "../../shared/createMongoDBConnection.js";
import handleSubmit from "./handleSubmit.js";

async function SubmitWorkflowAction(lowdefyContext) {
  const { request: payload = {}, connection, user } = lowdefyContext;
  const context = {
    mongoDBConnection: createMongoDBConnection(lowdefyContext),
    workflowsConfig: connection.workflowsConfig,
    actionsEnum: connection.actionsEnum,
    changeStamp: connection.changeStamp,
    params: payload,
    user,
    eventId: randomUUID(),
  };
  return handleSubmit(context);
}

SubmitWorkflowAction.schema = {};
SubmitWorkflowAction.meta = {
  checkRead: false,
  checkWrite: true,
};

export default SubmitWorkflowAction;
