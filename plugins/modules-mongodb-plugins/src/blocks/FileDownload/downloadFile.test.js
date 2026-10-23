import { jest } from "@jest/globals";
import {
  DOWNLOAD_EVENT,
  downloadFile,
  getFileId,
  registerDownloadEvent,
} from "./downloadFile.js";

function fakeMethods(answer) {
  const calls = [];
  return {
    calls,
    registerEvent: jest.fn(),
    triggerEvent: jest.fn(async (args) => {
      calls.push(args);
      return answer;
    }),
  };
}

const answered = (url) => ({
  success: true,
  responses: { [DOWNLOAD_EVENT]: { response: { response: { url } } } },
});

beforeEach(() => {
  global.window = { open: jest.fn() };
});

afterEach(() => {
  delete global.window;
});

test("registers a CallAPI action that reads the payload from the event", () => {
  const methods = fakeMethods();
  registerDownloadEvent({ methods, downloadEndpointId: "download-file" });
  expect(methods.registerEvent).toHaveBeenCalledWith({
    name: DOWNLOAD_EVENT,
    actions: [
      {
        id: DOWNLOAD_EVENT,
        type: "CallAPI",
        params: {
          endpointId: "download-file",
          payload: { _event: "payload" },
        },
      },
    ],
  });
});

test("file_id is the file's _id, else its key", () => {
  expect(getFileId({ _id: "rec-1", key: "k/1" })).toBe("rec-1");
  expect(getFileId({ key: "k/1" })).toBe("k/1");
  expect(getFileId(undefined)).toBe(null);
});

test("sends file_id as a string beside the download payload and opens the url", async () => {
  const methods = fakeMethods(answered("https://signed/1"));
  const file = { key: "org/files/a.pdf", name: "a.pdf" };
  const url = await downloadFile({
    file,
    downloadPayload: { workflow_id: "wf-1", file_id: "ignored" },
    methods,
  });
  expect(methods.calls[0]).toEqual({
    name: DOWNLOAD_EVENT,
    event: {
      file,
      payload: { workflow_id: "wf-1", file_id: "org/files/a.pdf" },
    },
  });
  expect(url).toBe("https://signed/1");
  expect(window.open).toHaveBeenCalledWith("https://signed/1");
});

test("an explicit fileId wins over the file's own fields", async () => {
  const methods = fakeMethods(answered("https://signed/2"));
  await downloadFile({
    file: { key: "k" },
    fileId: "rec-2",
    methods,
  });
  expect(methods.calls[0].event.payload).toEqual({ file_id: "rec-2" });
});

test("a refused download opens nothing", async () => {
  const methods = fakeMethods({
    success: false,
    responses: { [DOWNLOAD_EVENT]: { error: new Error("Not allowed") } },
  });
  const url = await downloadFile({ file: { _id: "rec-3" }, methods });
  expect(url).toBe(null);
  expect(window.open).not.toHaveBeenCalled();
});

test("several files through one registered event each send their own id", async () => {
  const methods = fakeMethods(answered("https://signed/x"));
  await downloadFile({
    file: { key: "a" },
    downloadPayload: { w: 1 },
    methods,
  });
  await downloadFile({
    file: { key: "b" },
    downloadPayload: { w: 1 },
    methods,
  });
  expect(methods.calls.map((c) => c.event.payload.file_id)).toEqual(["a", "b"]);
});
