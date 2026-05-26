const schema = {
  type: 'object',
  required: ['databaseUri'],
  additionalProperties: false,
  properties: {
    databaseUri: {
      type: 'string',
      description:
        'MongoDB connection URI; typically resolved via _secret in app YAML.',
    },
    read: {
      type: 'boolean',
      default: true,
      description: 'Allow read requests on this connection.',
    },
    write: {
      type: 'boolean',
      default: false,
      description:
        'Allow write requests on this connection. Required for StartWorkflow, SubmitWorkflowAction, CancelWorkflow, and CloseWorkflow handlers, which all set meta.checkWrite = true.',
    },
    databaseName: {
      type: 'string',
      description: 'Optional database name; defaults to the URI default.',
    },
    workflowsCollection: {
      type: 'string',
      description: 'Workflows collection name. Defaults to "workflows".',
      default: 'workflows',
    },
    actionsCollection: {
      type: 'string',
      description: 'Actions collection name. Defaults to "actions".',
      default: 'actions',
    },
    changeLog: {
      type: 'object',
      description:
        'Optional changeLog config forwarded to the community-plugin MongoDBCollection handlers. Mirrors the events module pattern: `{ collection, meta }` writes every workflow + action mutation into the consumer app\'s log-changes collection automatically.',
    },
    workflowsConfig: {
      type: 'array',
      description:
        'Normalized workflows config — output of the makeWorkflowsConfig resolver. ' +
        'Each entry is one workflow with its actions and action_groups. ' +
        'Consumed by the engine at runtime. ' +
        'Workflow shape: { type, entity_collection, display_order?, starting_actions, actions, action_groups? }. ' +
        'starting_actions entries: { type: string, status: string } where type matches an actions[].type and status is a key in actionsEnum.',
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['type', 'entity_collection', 'starting_actions', 'actions'],
        properties: {
          actions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              required: ['type', 'kind'],
            },
          },
        },
      },
    },
    changeStamp: {
      type: 'object',
      description:
        'Resolves to the events module change_stamp at app build time (typically via _ref: { module: events, component: change_stamp }). The engine reads it at handler entry and stamps every workflow + action doc write with it via `created` and `updated`. One stamp per handler invocation; all writes in the same call share the timestamp.',
    },
    app_name: {
      type: 'string',
      description:
        'Host app deployment name. Consumed by the engine at submit time to ' +
        'key the default log event\'s display block (matching the events ' +
        'module\'s display_key projection). Apps wire this from _module.var: app_name ' +
        'on connections/workflow-api.yaml.',
    },
    actionsEnum: {
      type: 'object',
      description:
        'Action status enum keyed by status name (e.g. "done", "blocked"). ' +
        'Typically loaded from enums/action_statuses.yaml. ' +
        'Each entry MUST carry priority (load-bearing — the engine compares priorities ' +
        'in the priority-rule check in SubmitWorkflowAction). ' +
        'Display fields (title, color, borderColor, titleColor) are optional in the schema ' +
        'but present on every shipped status; apps providing their own actionsEnum ' +
        'should populate them too for consistent UI rendering.',
      additionalProperties: {
        type: 'object',
        additionalProperties: true,
        required: ['priority'],
        properties: {
          priority: { type: 'number' },
          title: { type: 'string' },
          color: { type: 'string' },
          borderColor: { type: 'string' },
          titleColor: { type: 'string' },
        },
      },
    },
  },
};

export default schema;
