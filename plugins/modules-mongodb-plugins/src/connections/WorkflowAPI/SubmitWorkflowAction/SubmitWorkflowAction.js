async function SubmitWorkflowAction() {
  const err = new Error('not implemented: SubmitWorkflowAction');
  err.code = 'WorkflowAPINotImplemented';
  err.handler = 'SubmitWorkflowAction';
  throw err;
}

SubmitWorkflowAction.schema = {};
SubmitWorkflowAction.meta = {
  checkRead: false,
  checkWrite: false,
};

export default SubmitWorkflowAction;
