const schema = {
  type: "object",
  required: ["databaseUri"],
  additionalProperties: false,
  properties: {
    databaseUri: {
      type: "string",
      description:
        "MongoDB connection URI for the app data the data dictionary describes; " +
        "typically resolved via _secret in the module's connection YAML.",
    },
    databaseName: {
      type: "string",
      description:
        "Database name. Defaults to the database in the connection URI.",
    },
    catalog: {
      type: "object",
      description:
        "The collections catalog — the engine's confidentiality/authorization " +
        "boundary, keyed by collection name. Bound once at the connection (from " +
        "the module var) so every request validates against the same catalog by " +
        "construction; a request cannot substitute its own.",
    },
    maxTimeMS: {
      type: "number",
      default: 30000,
      description:
        "Server-side execution time cap (ms) applied to every compiled aggregation.",
    },
    allowDiskUse: {
      type: "boolean",
      default: true,
      description:
        "Allow aggregations to use temporary disk for large sorts/groups " +
        "(design §6). Default true so legitimate reporting aggregations are not " +
        "capped by the 100MB in-memory stage limit.",
    },
    options: {
      type: "object",
      description: "MongoClient options passed through to the driver.",
    },
  },
  errorMessage: {
    type: "ReportingData connection properties should be an object.",
    required: {
      databaseUri:
        'ReportingData connection should have required property "databaseUri".',
    },
  },
};

export default schema;
