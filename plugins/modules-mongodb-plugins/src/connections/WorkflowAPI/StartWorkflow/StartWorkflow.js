async function StartWorkflow() {
  const err = new Error('not implemented: StartWorkflow');
  err.code = 'WorkflowAPINotImplemented';
  err.handler = 'StartWorkflow';
  throw err;
}

StartWorkflow.schema = {};
StartWorkflow.meta = {
  checkRead: false,
  checkWrite: false,
};

export default StartWorkflow;
