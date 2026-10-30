export default {
  category: "display",
  valueType: null,
  // The block registers a CallAPI action that reads _event; a page's own
  // config may use neither, so they are counted from here.
  actions: ["CallAPI"],
  operators: ["_event"],
  icons: [],
  cssKeys: {
    element: "The file list element.",
  },
  properties: {
    type: "object",
    required: ["downloadEndpointId"],
    properties: {
      downloadEndpointId: {
        type: "string",
        description:
          "Id of an API endpoint that takes { file_id, ...downloadPayload } and returns { url }, a signed link to that file. The files module's download-file is one.",
      },
      downloadPayload: {
        type: "object",
        description:
          "Extra fields sent to the endpoint with each download, such as { workflow_id }. file_id is always set from the clicked file.",
      },
      fileList: {
        type: "array",
        description:
          "The files to list. file_id is each file's _id, else its key.",
        items: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description:
                "The file record's id, sent as file_id when present.",
            },
            key: {
              type: "string",
              description:
                "Storage object key, sent as file_id when there is no _id.",
            },
            name: {
              type: "string",
              description: "File name shown in the list.",
            },
            size: {
              type: "number",
              description: "File size in bytes.",
            },
            type: {
              type: "string",
              description: "File MIME type.",
            },
          },
        },
      },
    },
  },
};
