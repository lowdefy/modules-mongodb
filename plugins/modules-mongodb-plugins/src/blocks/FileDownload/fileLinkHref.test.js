import fileLinkHref, { getFileKey } from "./fileLinkHref.js";

test("links a key on the app's own domain with no base path", () => {
  expect(fileLinkHref({ linkEndpointId: "files/file", key: "rec-1" })).toBe(
    "/api/endpoints/files/file/rec-1",
  );
});

test("an empty base path adds nothing", () => {
  expect(
    fileLinkHref({ basePath: "", linkEndpointId: "files/file", key: "rec-1" }),
  ).toBe("/api/endpoints/files/file/rec-1");
});

test("a set base path goes in front", () => {
  expect(
    fileLinkHref({
      basePath: "/admin",
      linkEndpointId: "files/file",
      key: "rec-1",
    }),
  ).toBe("/admin/api/endpoints/files/file/rec-1");
});

test("linkPath segments go before the key, each encoded", () => {
  expect(
    fileLinkHref({
      linkEndpointId: "workflows/form-file",
      linkPath: ["wf 1/a"],
      key: "org/workflows/a.pdf",
    }),
  ).toBe("/api/endpoints/workflows/form-file/wf%201%2Fa/org/workflows/a.pdf");
});

test("the key's own / stay path separators", () => {
  expect(
    fileLinkHref({ linkEndpointId: "files/file", key: "org-1/files/x/y.png" }),
  ).toBe("/api/endpoints/files/file/org-1/files/x/y.png");
});

test("a space, + and & in a file name are encoded", () => {
  expect(
    fileLinkHref({
      linkEndpointId: "files/file",
      key: "org-1/files/R&D plan+v2.pdf",
    }),
  ).toBe("/api/endpoints/files/file/org-1/files/R%26D%20plan%2Bv2.pdf");
});

test("no key or no endpoint gives no link", () => {
  expect(fileLinkHref({ linkEndpointId: "files/file", key: null })).toBe(null);
  expect(fileLinkHref({ linkEndpointId: "files/file", key: "" })).toBe(null);
  expect(fileLinkHref({ key: "k" })).toBe(null);
});

test("the key is the file's _id, else its key", () => {
  expect(getFileKey({ _id: "rec-1", key: "k/1" })).toBe("rec-1");
  expect(getFileKey({ key: "k/1" })).toBe("k/1");
  expect(getFileKey(undefined)).toBe(null);
});
