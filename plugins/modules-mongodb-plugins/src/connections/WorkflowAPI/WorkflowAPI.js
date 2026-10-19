import schema from "./schema.js";
import StartWorkflow from "./StartWorkflow/StartWorkflow.js";
import CancelWorkflow from "./CancelWorkflow/CancelWorkflow.js";
import CloseWorkflow from "./CloseWorkflow/CloseWorkflow.js";
import SubmitWorkflowAction from "./SubmitWorkflowAction/SubmitWorkflowAction.js";
import UpdateActionFields from "./UpdateActionFields/UpdateActionFields.js";
import GetEntityWorkflows from "./GetEntityWorkflows/GetEntityWorkflows.js";
import GetWorkflowOverview from "./GetWorkflowOverview/GetWorkflowOverview.js";
import GetWorkflowActionGroupOverview from "./GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js";
import GetWorkflowAction from "./GetWorkflowAction/GetWorkflowAction.js";

const WorkflowAPI = {
  schema,
  // Runtime tenant contract declaration: the engine threads the verdict from
  // createEngineContext into every mongo/ wrapper call (reads org-scoped,
  // writes org-stamped).
  // Data-set journeys redirect it: it reads and writes only through
  // databaseUri and databaseName (mongo/getMongoDb.js).
  meta: { tenant: true, dataSet: "redirect" },
  requests: {
    StartWorkflow,
    CancelWorkflow,
    CloseWorkflow,
    SubmitWorkflowAction,
    UpdateActionFields,
    GetEntityWorkflows,
    GetWorkflowOverview,
    GetWorkflowActionGroupOverview,
    GetWorkflowAction,
  },
};

export default WorkflowAPI;
