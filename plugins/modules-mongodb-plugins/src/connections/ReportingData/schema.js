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
      description: "Database name. Defaults to the database in the connection URI.",
    },
    maxTimeMS: {
      type: "number",
      default: 30000,
      description:
        "Server-side execution time cap (ms) applied to every compiled aggregation.",
    },
    options: {
      type: "object",
      description: "MongoClient options passed through to the driver.",
    },
  },
  errorMessage: {
    type: "ReportingData connection properties should be an object.",
    required: {
      databaseUri: 'ReportingData connection should have required property "databaseUri".',
    },
  },
};

export default schema;
