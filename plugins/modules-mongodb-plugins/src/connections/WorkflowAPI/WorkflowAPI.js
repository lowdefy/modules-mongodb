import schema from './schema.js';
import StartWorkflow from './StartWorkflow/StartWorkflow.js';
import CancelWorkflow from './CancelWorkflow/CancelWorkflow.js';
import CloseWorkflow from './CloseWorkflow/CloseWorkflow.js';
import SubmitWorkflowAction from './SubmitWorkflowAction/SubmitWorkflowAction.js';
import UpdateActionFields from './UpdateActionFields/UpdateActionFields.js';
import GetEntityWorkflows from './GetEntityWorkflows/GetEntityWorkflows.js';
import GetWorkflowOverview from './GetWorkflowOverview/GetWorkflowOverview.js';
import GetWorkflowActionGroupOverview from './GetWorkflowActionGroupOverview/GetWorkflowActionGroupOverview.js';
import GetWorkflowAction from './GetWorkflowAction/GetWorkflowAction.js';
import GetEventsTimeline from './GetEventsTimeline/GetEventsTimeline.js';

const WorkflowAPI = {
  schema,
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
    GetEventsTimeline,
  },
};

export default WorkflowAPI;
