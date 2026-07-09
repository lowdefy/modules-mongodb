import schema from "./schema.js";
import makeWorkflowRequest from "../lowdefyAdapter.js";

// The engine lives in @lowdefy/mongodb-workflows-sdk; each request is a thin
// adapter over the corresponding engine method (workflows-sdk-split design).
// Request keys are the plugin's public request types — do not rename.
const write = { checkRead: false, checkWrite: true };
const read = { checkRead: false, checkWrite: false };

const WorkflowAPI = {
  schema,
  requests: {
    StartWorkflow: makeWorkflowRequest("startWorkflow", write),
    CancelWorkflow: makeWorkflowRequest("cancelWorkflow", write),
    CloseWorkflow: makeWorkflowRequest("closeWorkflow", write),
    SubmitWorkflowAction: makeWorkflowRequest("submitAction", write),
    UpdateActionFields: makeWorkflowRequest("updateActionFields", write),
    GetEntityWorkflows: makeWorkflowRequest("getEntityWorkflows", read),
    GetWorkflowOverview: makeWorkflowRequest("getWorkflowOverview", read),
    GetWorkflowActionGroupOverview: makeWorkflowRequest(
      "getWorkflowActionGroupOverview",
      read,
    ),
    GetWorkflowAction: makeWorkflowRequest("getWorkflowAction", read),
  },
};

export default WorkflowAPI;
