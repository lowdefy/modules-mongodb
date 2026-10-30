import {
  isFormFile,
  isLegacyFormFileKey,
  isOwnFormFileKey,
  isSignableFormFileKey,
  listFormFiles,
} from "./formFiles.js";

describe("isFormFile", () => {
  test("is a plain object with a string key", () => {
    expect(isFormFile({ key: "a/b.pdf", name: "b.pdf" })).toBe(true);
    expect(isFormFile({ key: "a/b.pdf" })).toBe(true);
    expect(isFormFile({ key: 1 })).toBe(false);
    expect(isFormFile({ name: "b.pdf" })).toBe(false);
    expect(isFormFile(["a/b.pdf"])).toBe(false);
    expect(isFormFile("a/b.pdf")).toBe(false);
    expect(isFormFile(null)).toBe(false);
  });
});

describe("listFormFiles", () => {
  test("finds files at any depth with their paths, inside other files too", () => {
    const one = { key: "k/1" };
    const nested = { key: "k/3" };
    const two = { key: "k/2", extra: nested };
    const value = {
      upload: { file: one, fileList: [one] },
      rooms: [{ evidence: { fileList: [two] } }],
      notes: "text",
    };
    expect(listFormFiles(value)).toEqual([
      { file: one, path: ["upload", "file"] },
      { file: one, path: ["upload", "fileList", 0] },
      { file: two, path: ["rooms", 0, "evidence", "fileList", 0] },
      { file: nested, path: ["rooms", 0, "evidence", "fileList", 0, "extra"] },
    ]);
  });

  test("is empty for no value", () => {
    expect(listFormFiles(undefined)).toEqual([]);
    expect(listFormFiles("k/1")).toEqual([]);
  });
});

describe("key rules", () => {
  test("own key is under {organization_id}/workflows/", () => {
    expect(isOwnFormFileKey("org-a/workflows/x/1.pdf", "org-a")).toBe(true);
    expect(isOwnFormFileKey("org-b/workflows/x/1.pdf", "org-a")).toBe(false);
    expect(isOwnFormFileKey("org-a/files/x/1.pdf", "org-a")).toBe(false);
    expect(isOwnFormFileKey("org-a-2/workflows/x/1.pdf", "org-a")).toBe(false);
    expect(isOwnFormFileKey("/workflows/x/1.pdf", "")).toBe(false);
    expect(isOwnFormFileKey("org-a/workflows/x/1.pdf", null)).toBe(false);
  });

  test("legacy key has no module prefix in its second segment", () => {
    expect(isLegacyFormFileKey("workflows/po/1.pdf")).toBe(true);
    expect(isLegacyFormFileKey("deal/20260101/uuid/1.pdf")).toBe(true);
    expect(isLegacyFormFileKey("1.pdf")).toBe(true);
    expect(isLegacyFormFileKey("org-a/workflows/x/1.pdf")).toBe(false);
    expect(isLegacyFormFileKey("org-a/files/deal/d1/1.pdf")).toBe(false);
    expect(isLegacyFormFileKey("org-a/support/u1/1.pdf")).toBe(false);
  });

  test("signable is own or legacy", () => {
    expect(isSignableFormFileKey("org-a/workflows/x/1.pdf", "org-a")).toBe(
      true,
    );
    expect(isSignableFormFileKey("workflows/po/1.pdf", "org-a")).toBe(true);
    expect(isSignableFormFileKey("org-b/workflows/x/1.pdf", "org-a")).toBe(
      false,
    );
    expect(isSignableFormFileKey("org-a/files/deal/d1/1.pdf", "org-a")).toBe(
      false,
    );
    expect(isSignableFormFileKey("org-a/support/u1/1.pdf", "org-a")).toBe(
      false,
    );
    // A caller with no organization gets only legacy keys.
    expect(isSignableFormFileKey("org-a/workflows/x/1.pdf", null)).toBe(false);
    expect(isSignableFormFileKey("workflows/po/1.pdf", null)).toBe(true);
  });
});
