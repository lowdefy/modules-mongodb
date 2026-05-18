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
  },
};

export default schema;
