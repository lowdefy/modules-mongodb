/**
 * Look up one workflow's config entry in the connection's normalized
 * `workflowsConfig` array (output of the makeWorkflowsConfig resolver) by its
 * `type`. Returns `undefined` when the type is unknown — each caller decides
 * whether that is an error (write handlers throw) or a soft degrade (read
 * handlers render without display config).
 *
 * @param {Array | undefined} workflowsConfig
 * @param {string} workflowType
 * @returns {Object | undefined}
 */
export default function findWorkflowConfig(workflowsConfig, workflowType) {
  return (workflowsConfig ?? []).find((w) => w.type === workflowType);
}
