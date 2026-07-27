const schema = {
  type: "object",
  required: ["databaseUri", "display_key"],
  additionalProperties: false,
  properties: {
    databaseUri: {
      type: "string",
      description:
        "MongoDB connection URI; typically resolved via _secret in app YAML.",
    },
    display_key: {
      type: "string",
      description:
        "Key of the per-app display block to render. Events store their titles " +
        "per app (`{display_key}.title`, `.description`, `.info`), and events " +
        "without a block under this key are excluded from the timeline; the " +
        "same key selects each action card's per-app `message` and `links`. " +
        "Apps wire this from _module.var: display_key on " +
        "connections/events-timeline.yaml, which defaults to the host app's " +
        "slug and is set explicitly only to render another app's events. " +
        "Must not contain dots — dots are read as nested field navigation in " +
        "MongoDB field paths.",
    },
    eventsCollection: {
      type: "string",
      default: "log-events",
      description:
        "Events collection name queried by GetEventsTimeline (task 6). " +
        'Defaults to "log-events" (matching the events module\'s collection). ' +
        "Host apps need only set this when overriding the collection name.",
    },
    actionsCollection: {
      type: "string",
      description: 'Actions collection name. Defaults to "actions".',
    },
    contactsCollection: {
      type: "string",
      description:
        "Contacts collection name joined by GetEventsTimeline to resolve each " +
        "event author's avatar (created.user.id → _id, projecting " +
        'profile.picture onto created.user.picture). Defaults to "user-contacts" ' +
        "(the shared collection where a user IS a contact — same _id space). " +
        "Host apps need only set this when overriding the collection name.",
    },
    databaseName: {
      type: "string",
      description: "Optional database name; defaults to the URI default.",
    },
    user: {
      type: "object",
      description:
        "Session user resolved per-request. Wire from `_user: true` on " +
        "connections/events-timeline.yaml. Lowdefy evaluates connection properties " +
        "per request, so this resolves to the current session user " +
        "(`{ roles: [...], ... }`) at handler entry. " +
        "The engine reads `user.roles` for verb gate checks.",
    },
  },
};

export default schema;
