import { jest } from "@jest/globals";
import getS3Upload from "./getS3Upload.js";

const sent = [];

class FakeXhr {
  constructor() {
    this.listeners = {};
    this.upload = {};
  }
  addEventListener(name, fn) {
    this.listeners[name] = fn;
  }
  open(method, url) {
    this.method = method;
    this.url = url;
  }
  send(body) {
    sent.push({ method: this.method, url: this.url, body });
    return this.listeners.loadend?.();
  }
}

const policy = {
  url: "https://bucket.example/",
  fields: { key: "org/space/doc/1/uuid/shot.png", bucket: "files" },
};

const makeFile = (uid = "u1") => ({
  name: "shot.png",
  lastModified: 1,
  size: 10,
  type: "image/png",
  uid,
});

const makeUploadsRef = () => ({
  current: { queue: Promise.resolve(), asking: null, held: new Map() },
});

// A page whose onUploadPolicy actions call setUploadPolicy with `answer`
// (or skip the call when it is undefined) and end with `success`.
const makeSetup = ({ usePolicyEvent, answer, success = true }) => {
  const uploadsRef = makeUploadsRef();
  const triggered = [];
  let block;
  const methods = {
    triggerEvent: jest.fn(async ({ name, event }) => {
      triggered.push({ name, event });
      if (name === "onUploadPolicy") {
        if (answer !== undefined) await block.setUploadPolicy(answer);
        return { success, responses: {} };
      }
      if (name === "__getS3PostPolicy") {
        return {
          success: true,
          responses: { __getS3PostPolicy: { response: [policy] } },
        };
      }
      return { success: true, responses: {} };
    }),
  };
  const setFileList = jest.fn(async () => {});
  const removeFile = jest.fn();
  block = getS3Upload({
    methods,
    setFileList,
    removeFile,
    usePolicyEvent,
    uploadsRef,
  });
  return { block, triggered, setFileList, removeFile, uploadsRef };
};

beforeEach(() => {
  sent.length = 0;
  global.XMLHttpRequest = FakeXhr;
});

afterEach(() => {
  delete global.XMLHttpRequest;
});

test("without onUploadPolicy, the policy comes from the page request", async () => {
  const { block, triggered, setFileList } = makeSetup({
    usePolicyEvent: false,
  });
  const file = makeFile();
  await block.upload({ file });
  expect(triggered.map((t) => t.name)).toEqual(["__getS3PostPolicy"]);
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe(policy.url);
  expect(file.key).toBe(policy.fields.key);
  expect(file.bucket).toBe("files");
  expect(setFileList).toHaveBeenCalledWith({ event: "onSuccess", file });
});

test("with onUploadPolicy, the policy set by the page is used", async () => {
  const { block, triggered, uploadsRef } = makeSetup({
    usePolicyEvent: true,
    answer: policy,
  });
  const file = makeFile();
  await block.upload({ file });
  expect(triggered[0]).toEqual({
    name: "onUploadPolicy",
    event: {
      file: {
        name: "shot.png",
        lastModified: 1,
        size: 10,
        type: "image/png",
        uid: "u1",
      },
      pasted: false,
    },
  });
  expect(triggered.map((t) => t.name)).not.toContain("__getS3PostPolicy");
  expect(sent).toHaveLength(1);
  expect(file.key).toBe(policy.fields.key);
  expect(uploadsRef.current.asking).toBe(null);
  expect(uploadsRef.current.held.size).toBe(0);
});

test("a pasted file is marked in the policy event and on the file", async () => {
  const { block, triggered } = makeSetup({
    usePolicyEvent: true,
    answer: policy,
  });
  const file = makeFile();
  await block.upload({ file, pasted: true });
  expect(triggered[0].event.pasted).toBe(true);
  expect(file.pasted).toBe(true);
});

test("no policy from the page holds the upload with no error state", async () => {
  const { block, setFileList, removeFile, uploadsRef } = makeSetup({
    usePolicyEvent: true,
  });
  const file = makeFile();
  await block.upload({ file });
  expect(sent).toHaveLength(0);
  expect(removeFile).toHaveBeenCalledWith("u1");
  expect(setFileList).not.toHaveBeenCalled();
  expect(uploadsRef.current.held.get("u1")).toBe(file);
});

test("a failed policy event holds the upload with no error state", async () => {
  const { block, setFileList, removeFile, uploadsRef } = makeSetup({
    usePolicyEvent: true,
    answer: policy,
    success: false,
  });
  await block.upload({ file: makeFile() });
  expect(sent).toHaveLength(0);
  expect(removeFile).toHaveBeenCalledWith("u1");
  expect(setFileList).not.toHaveBeenCalled();
  expect(uploadsRef.current.held.has("u1")).toBe(true);
});

test("a held upload is sent when the page sets a policy for its uid", async () => {
  const { block, setFileList, uploadsRef } = makeSetup({
    usePolicyEvent: true,
  });
  const file = makeFile();
  await block.upload({ file, pasted: true });
  expect(sent).toHaveLength(0);

  await block.setUploadPolicy({ url: "https://bucket.example/" }, "other");
  await block.setUploadPolicy(null, "u1");
  expect(sent).toHaveLength(0);
  expect(uploadsRef.current.held.has("u1")).toBe(true);

  await block.setUploadPolicy(policy, "u1");
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe(policy.url);
  expect(file.key).toBe(policy.fields.key);
  expect(file.pasted).toBe(true);
  expect(setFileList).toHaveBeenCalledWith({ event: "onSuccess", file });
  expect(uploadsRef.current.held.size).toBe(0);

  await block.setUploadPolicy(policy, "u1");
  expect(sent).toHaveLength(1);
});

test("a cancelled held upload cannot be sent", async () => {
  const { block, setFileList, uploadsRef } = makeSetup({
    usePolicyEvent: true,
  });
  await block.upload({ file: makeFile() });
  block.cancelUpload("u1");
  expect(uploadsRef.current.held.size).toBe(0);
  await block.setUploadPolicy(policy, "u1");
  expect(sent).toHaveLength(0);
  expect(setFileList).not.toHaveBeenCalled();
});

test("setUploadPolicy with another upload's uid does not answer the running event", async () => {
  const uploadsRef = makeUploadsRef();
  let block;
  const methods = {
    triggerEvent: jest.fn(async () => {
      await block.setUploadPolicy(policy, "someone-else");
      return { success: true, responses: {} };
    }),
  };
  block = getS3Upload({
    methods,
    setFileList: async () => {},
    removeFile: () => {},
    usePolicyEvent: true,
    uploadsRef,
  });
  await block.upload({ file: makeFile() });
  expect(sent).toHaveLength(0);
  expect(uploadsRef.current.held.has("u1")).toBe(true);
});

test("policy events run one at a time", async () => {
  const uploadsRef = makeUploadsRef();
  let active = 0;
  let maxActive = 0;
  let block;
  const methods = {
    triggerEvent: jest.fn(async ({ event }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      await block.setUploadPolicy({
        url: policy.url,
        fields: { key: `key-${event.file.uid}` },
      });
      active -= 1;
      return { success: true, responses: {} };
    }),
  };
  block = getS3Upload({
    methods,
    setFileList: async () => {},
    removeFile: () => {},
    usePolicyEvent: true,
    uploadsRef,
  });
  const a = makeFile("a");
  const b = makeFile("b");
  await Promise.all([block.upload({ file: a }), block.upload({ file: b })]);
  expect(maxActive).toBe(1);
  expect(a.key).toBe("key-a");
  expect(b.key).toBe("key-b");
});
