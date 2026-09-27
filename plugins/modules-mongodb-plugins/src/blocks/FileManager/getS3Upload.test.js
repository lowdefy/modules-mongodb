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

const makeFile = () => ({
  name: "shot.png",
  lastModified: 1,
  size: 10,
  type: "image/png",
  uid: "u1",
});

// A page whose onUploadPolicy actions call setUploadPolicy with `answer`
// (or skip the call when it is undefined) and end with `success`.
const makeSetup = ({ usePolicyEvent, answer, success = true }) => {
  const policyRef = { current: null };
  const triggered = [];
  const methods = {
    triggerEvent: jest.fn(async ({ name, event }) => {
      triggered.push({ name, event });
      if (name === "onUploadPolicy") {
        if (answer !== undefined) policyRef.current = answer;
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
  const upload = getS3Upload({
    methods,
    setFileList,
    removeFile,
    usePolicyEvent,
    policyRef,
    policyQueueRef: { current: Promise.resolve() },
  });
  return { upload, triggered, setFileList, removeFile, policyRef };
};

beforeEach(() => {
  sent.length = 0;
  global.XMLHttpRequest = FakeXhr;
});

afterEach(() => {
  delete global.XMLHttpRequest;
});

test("without onUploadPolicy, the policy comes from the page request", async () => {
  const { upload, triggered, setFileList } = makeSetup({
    usePolicyEvent: false,
  });
  const file = makeFile();
  await upload({ file });
  expect(triggered.map((t) => t.name)).toEqual(["__getS3PostPolicy"]);
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe(policy.url);
  expect(file.key).toBe(policy.fields.key);
  expect(file.bucket).toBe("files");
  expect(setFileList).toHaveBeenCalledWith({ event: "onSuccess", file });
});

test("with onUploadPolicy, the policy set by the page is used", async () => {
  const { upload, triggered, policyRef } = makeSetup({
    usePolicyEvent: true,
    answer: policy,
  });
  const file = makeFile();
  await upload({ file });
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
  expect(policyRef.current).toBe(null);
});

test("a pasted file is marked in the policy event and on the file", async () => {
  const { upload, triggered } = makeSetup({
    usePolicyEvent: true,
    answer: policy,
  });
  const file = makeFile();
  await upload({ file, pasted: true });
  expect(triggered[0].event.pasted).toBe(true);
  expect(file.pasted).toBe(true);
});

test("no policy from the page drops the upload with no error state", async () => {
  const { upload, setFileList, removeFile } = makeSetup({
    usePolicyEvent: true,
  });
  await upload({ file: makeFile() });
  expect(sent).toHaveLength(0);
  expect(removeFile).toHaveBeenCalledWith("u1");
  expect(setFileList).not.toHaveBeenCalled();
});

test("a failed policy event drops the upload with no error state", async () => {
  const { upload, setFileList, removeFile } = makeSetup({
    usePolicyEvent: true,
    answer: policy,
    success: false,
  });
  await upload({ file: makeFile() });
  expect(sent).toHaveLength(0);
  expect(removeFile).toHaveBeenCalledWith("u1");
  expect(setFileList).not.toHaveBeenCalled();
});

test("policy events run one at a time", async () => {
  const policyRef = { current: null };
  let active = 0;
  let maxActive = 0;
  const methods = {
    triggerEvent: jest.fn(async ({ event }) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      policyRef.current = {
        url: policy.url,
        fields: { key: `key-${event.file.uid}` },
      };
      active -= 1;
      return { success: true, responses: {} };
    }),
  };
  const upload = getS3Upload({
    methods,
    setFileList: async () => {},
    removeFile: () => {},
    usePolicyEvent: true,
    policyRef,
    policyQueueRef: { current: Promise.resolve() },
  });
  const a = { ...makeFile(), uid: "a" };
  const b = { ...makeFile(), uid: "b" };
  await Promise.all([upload({ file: a }), upload({ file: b })]);
  expect(maxActive).toBe(1);
  expect(a.key).toBe("key-a");
  expect(b.key).toBe("key-b");
});
