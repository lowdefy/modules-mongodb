export default {
  category: "display",
  valueType: null,
  icons: [],
  cssKeys: {
    element: "The file list element.",
  },
  properties: {
    type: "object",
    required: ["linkEndpointId"],
    properties: {
      linkEndpointId: {
        type: "string",
        description:
          "Id of a link endpoint (link: true) that answers GET /api/endpoints/<linkEndpointId>/<...linkPath>/<key> with a redirect to the file, such as the files module's file endpoint ({ _module.endpointId: file }). Each file renders as a link to it.",
      },
      linkPath: {
        type: "array",
        items: { type: "string" },
        description:
          "Path segments that go before each file's key in the link, such as [workflow_id] for the workflows module's form-file endpoint.",
      },
      fileList: {
        type: "array",
        description:
          "The files to list. Each link names the file's _id, else its key.",
        items: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              description:
                "The file record's id, used in the link when present.",
            },
            key: {
              type: "string",
              description:
                "Storage object key, used in the link when there is no _id.",
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
