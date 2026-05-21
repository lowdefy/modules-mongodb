import schema from './schema.js';
import StartWorkflow from './StartWorkflow/StartWorkflow.js';
import CancelWorkflow from './CancelWorkflow/CancelWorkflow.js';
import CloseWorkflow from './CloseWorkflow/CloseWorkflow.js';
import SubmitWorkflowAction from './SubmitWorkflowAction/SubmitWorkflowAction.js';

const WorkflowAPI = {
  schema,
  requests: {
    StartWorkflow,
    CancelWorkflow,
    CloseWorkflow,
    SubmitWorkflowAction,
  },
};

export default WorkflowAPI;
