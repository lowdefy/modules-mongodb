/**
 * Resolve the engine's collection names from the connection config, applying
 * the schema defaults (see WorkflowAPI/schema.js) in one place. Every handler
 * and phase that opens a collection resolves the name through this helper so
 * the defaults can never drift between call sites.
 *
 * @param {Object | undefined} connection — the Lowdefy connection properties.
 * @returns {{ workflows: string, actions: string, events: string, contacts: string }}
 */
export default function collectionNames(connection) {
  return {
    workflows: connection?.workflowsCollection ?? "workflows",
    actions: connection?.actionsCollection ?? "actions",
    events: connection?.eventsCollection ?? "log-events",
    contacts: connection?.contactsCollection ?? "user-contacts",
  };
}
