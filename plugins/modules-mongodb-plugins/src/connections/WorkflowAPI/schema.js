const schema = {
  type: "object",
  required: ["databaseUri", "entry_id", "endpoints"],
  additionalProperties: false,
  properties: {
    databaseUri: {
      type: "string",
      description:
        "MongoDB connection URI; typically resolved via _secret in app YAML.",
    },
    entry_id: {
      type: "string",
      description:
        "The workflows module entry id, wired from `_module.id: true` in " +
        "connections/workflow-api.yaml. The engine uses it to build " +
        "entry-scoped page ids (`${entry_id}/${pageId}`) when computing the " +
        "per-verb engine links written onto action docs, matching Lowdefy's " +
        "build-time _module.pageId scoping.",
    },
    endpoints: {
      type: "object",
      required: ["new_event", "send_notification"],
      description:
        "Build-resolved dispatch targets, wired from `_module.endpointId` in " +
        "connections/workflow-api.yaml. Each value is an opaque pre-scoped " +
        "endpoint id string (`<moduleEntryId>/<endpointId>`) consumed verbatim " +
        "by the engine's dispatch helpers via `callApi({ endpointId, payload })` " +
        "— the engine never constructs prefixes at runtime.",
      properties: {
        new_event: {
          type: "string",
          description:
            "Pre-scoped id of the events module's new-event Api (e.g. " +
            '"events/new-event"); the engine dispatches the per-invocation ' +
            "log event here.",
        },
        send_notification: {
          type: "string",
          description:
            "Pre-scoped id of the notifications module's send-notification " +
            'InternalApi (e.g. "notifications/send-notification"); the engine ' +
            "dispatches `{ event_ids }` here after each committed event.",
        },
      },
    },
    read: {
      type: "boolean",
      default: true,
      description: "Allow read requests on this connection.",
    },
    write: {
      type: "boolean",
      default: false,
      description:
        "Allow write requests on this connection. Required for StartWorkflow, SubmitWorkflowAction, CancelWorkflow, and CloseWorkflow handlers, which all set meta.checkWrite = true.",
    },
    databaseName: {
      type: "string",
      description: "Optional database name; defaults to the URI default.",
    },
    workflowsCollection: {
      type: "string",
      description: 'Workflows collection name. Defaults to "workflows".',
      default: "workflows",
    },
    actionsCollection: {
      type: "string",
      description: 'Actions collection name. Defaults to "actions".',
      default: "actions",
    },
    eventsCollection: {
      type: "string",
      default: "log-events",
      description:
        "Events collection name. Defaults to \"log-events\" (matching the " +
        "events module's collection). Read by GetEventsTimeline and by " +
        "GetWorkflowAction (the changes-requested callout's request-changes " +
        "comment lookup). Host apps need only set this when overriding the " +
        "collection name.",
    },
    changeLog: {
      type: "object",
      description:
        "Optional changeLog config consumed natively by the engine. Same `{ collection, meta }` shape and same opt-in as the community-plugin / events-module pattern: when set, the engine writes one log-changes entry per workflow + action mutation into the consumer app's log-changes collection. Engine writes bypass the community plugin (they go through the native Mongo driver), so the engine populates each entry's before/after from the Plan rather than via the plugin's per-op double-reads. When unset, no audit entries are written.",
    },
    workflowsConfig: {
      type: "array",
      description:
        "Normalized workflows config — output of the makeWorkflowsConfig resolver. " +
        "Each entry is one workflow with its actions and action_groups. " +
        "Consumed by the engine at runtime. " +
        "Workflow shape: { type, entity, display_order?, starting_actions, actions, action_groups? }. " +
        "entity is a nested block { connection_id, ref_key, page_id, id_query_key, title } carrying the workflow's entity routing wholesale: " +
        'connection_id is the entity\'s Lowdefy connection id; ref_key is the event-references key (e.g. "lead_ids") — written into event docs so events surface on the entity; ' +
        'page_id is the host-app page id rendering the entity; id_query_key is the URL query-string key for the entity\'s primary id (default "_id"); title is the singular entity-kind label. ' +
        "starting_actions entries: { type: string, status: string } where type matches an actions[].type and status is a key in actionsEnum.",
      items: {
        type: "object",
        additionalProperties: true,
        required: ["type", "entity", "starting_actions", "actions"],
        properties: {
          actions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: true,
              required: ["type", "kind"],
            },
          },
        },
      },
    },
    changeStamp: {
      type: "object",
      description:
        "Resolves to the events module change_stamp at app build time (typically via _ref: { module: events, component: change_stamp }). The engine reads it at handler entry and stamps every workflow + action doc write with it via `created` and `updated`. One stamp per handler invocation; all writes in the same call share the timestamp.",
    },
    app_name: {
      type: "string",
      description:
        "Host app deployment name. Consumed by the engine at submit time to " +
        "key the default log event's display block (matching the events " +
        "module's display_key projection). Apps wire this from _module.var: app_name " +
        "on connections/workflow-api.yaml.",
    },
    actionsEnum: {
      type: "object",
      description:
        'Action status enum keyed by status name (e.g. "done", "blocked"). ' +
        "Typically loaded from modules/shared/enums/action_statuses.yaml. " +
        "Each entry MUST carry priority — display-only (ordering in pickers / " +
        "visualizations); the engine no longer consults it for transition " +
        "legality (transitions are resolved by the per-kind FSM tables). " +
        "Display fields (title, color, borderColor, titleColor) are optional in the schema " +
        "but present on every shipped status; apps providing their own actionsEnum " +
        "should populate them too for consistent UI rendering.",
      additionalProperties: {
        type: "object",
        additionalProperties: true,
        required: ["priority"],
        properties: {
          priority: { type: "number" },
          title: { type: "string" },
          color: { type: "string" },
          borderColor: { type: "string" },
          titleColor: { type: "string" },
        },
      },
    },
    user: {
      type: "object",
      description:
        "Session user resolved per-request. Wire from `_user: true` on " +
        "connections/workflow-api.yaml. Lowdefy evaluates connection properties " +
        "per request, so this resolves to the current session user " +
        "(`{ roles: [...], ... }`) at handler entry. " +
        "The engine reads `user.roles` for verb gate checks.",
    },
    contactsCollection: {
      type: "string",
      default: "user-contacts",
      description:
        "Contacts collection name joined by GetWorkflowAction to resolve each " +
        "contact's avatar (created.user.id → _id, projecting profile.picture). " +
        'Defaults to "user-contacts" (the shared collection where a user IS a ' +
        "contact — same _id space). Host apps need only set this when overriding " +
        "the collection name.",
    },
  },
};

export default schema;
