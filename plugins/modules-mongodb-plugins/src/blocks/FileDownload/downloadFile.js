export const DOWNLOAD_EVENT = "__getDownloadPolicy";

// The payload travels in the event rather than in the registered action, so
// data in it is never parsed as operators and a payload that resolves after
// mount (a record loaded later) is current at click time. Lowdefy counts the
// CallAPI action and the _event operator from the block meta, since a page's
// own config may use neither.
export function registerDownloadEvent({ methods, downloadEndpointId }) {
  methods.registerEvent({
    name: DOWNLOAD_EVENT,
    actions: [
      {
        id: DOWNLOAD_EVENT,
        type: "CallAPI",
        params: {
          endpointId: downloadEndpointId,
          payload: { _event: "payload" },
        },
      },
    ],
  });
}

export function getFileId(file) {
  return file?._id ?? file?.key ?? null;
}

// Asks the endpoint for a signed link to one file and opens it. The endpoint
// takes { ...downloadPayload, file_id } and returns { url }. A refusal fails
// the CallAPI action, which shows the endpoint's message, and opens nothing.
export async function downloadFile({ file, fileId, downloadPayload, methods }) {
  const result = await methods.triggerEvent({
    name: DOWNLOAD_EVENT,
    event: {
      file,
      payload: {
        ...(downloadPayload ?? {}),
        file_id: fileId ?? getFileId(file),
      },
    },
  });
  const url = result?.responses?.[DOWNLOAD_EVENT]?.response?.response?.url;
  if (!url) return null;
  window.open(url);
  return url;
}
