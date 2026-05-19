async function CancelWorkflow() {
  const err = new Error('not implemented: CancelWorkflow');
  err.code = 'WorkflowAPINotImplemented';
  err.handler = 'CancelWorkflow';
  throw err;
}

CancelWorkflow.schema = {};
CancelWorkflow.meta = {
  checkRead: false,
  checkWrite: false,
};

export default CancelWorkflow;
