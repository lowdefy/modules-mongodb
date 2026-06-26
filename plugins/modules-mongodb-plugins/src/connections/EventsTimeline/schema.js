const schema = {
  type: 'object',
  required: ['databaseUri', 'app_name'],
  additionalProperties: false,
  properties: {
    databaseUri: {
      type: 'string',
      description:
        'MongoDB connection URI; typically resolved via _secret in app YAML.',
    },
    app_name: {
      type: 'string',
      description:
        'Host app deployment name. Consumed by the engine at submit time to ' +
        'key the default log event\'s display block (matching the events ' +
        'module\'s display_key projection). Apps wire this from _module.var: app_name ' +
        'on connections/workflow-api.yaml.',
    },
    eventsCollection: {
      type: 'string',
      default: 'log-events',
      description:
        'Events collection name queried by GetEventsTimeline (task 6). ' +
        'Defaults to "log-events" (matching the events module\'s collection). ' +
        'Host apps need only set this when overriding the collection name.',
    },
    actionsCollection: {
      type: 'string',
      description: 'Actions collection name. Defaults to "actions".',
    },
    contactsCollection: {
      type: 'string',
      description:
        'Contacts collection name joined by GetEventsTimeline to resolve each ' +
        'event author\'s avatar (created.user.id → _id, projecting ' +
        'profile.picture onto created.user.picture). Defaults to "user-contacts" ' +
        '(the shared collection where a user IS a contact — same _id space). ' +
        'Host apps need only set this when overriding the collection name.',
    },
    databaseName: {
      type: 'string',
      description: 'Optional database name; defaults to the URI default.',
    },
    user: {
      type: 'object',
      description:
        'Session user resolved per-request. Wire from `_user: true` on ' +
        'connections/workflow-api.yaml. Lowdefy evaluates connection properties ' +
        'per request, so this resolves to the current session user ' +
        '(`{ roles: [...], ... }`) at handler entry. ' +
        'The engine reads `user.roles` for verb gate checks.',
    },
  },
};

export default schema;
