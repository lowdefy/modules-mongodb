/**
 * Runs the `_js` in check-upload.yaml and check-save.yaml, which refuse an
 * upload policy or a save before anything touches S3 or the database, and in
 * sign-link.yaml, which picks the headers a signed file link opens with.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

import { load as loadYaml } from "js-yaml";

const here = dirname(fileURLToPath(import.meta.url));
const jsOf = (file, stateKey) =>
  loadYaml(readFileSync(join(here, file), "utf8")).find(
    (step) => step[":set_state"]?.[stateKey],
  )[":set_state"][stateKey]._js;

const uploadCode = jsOf("check-upload.yaml", "upload_problem");
const saveCode = jsOf("check-save.yaml", "save_check_result");
const signCode = jsOf("sign-link.yaml", "sign_link_headers");

const MB = 1048576;
const upload = {
  organization_id: "org-a",
  entity_type: "lot",
  entity_id: "lot-1",
  file: { name: "report.pdf", type: "application/pdf", size: 2 * MB },
  max_file_size: 25 * MB,
  allowed_content_types: null,
};
const checkUpload = (changes) =>
  new Function("state", uploadCode)(() => ({ ...upload, ...changes }));

const UUID = "0b7c6a8e-3f2d-4c1b-9a8e-1d2c3b4a5f60";
const STAMP = "20261023_143012123";
const goodKey = `org-a/files/lot/lot-1/${STAMP}/${UUID}/report.pdf`;
const save = {
  organization_id: "org-a",
  entity_type: "lot",
  entity_id: "lot-1",
  key: goodKey,
  thumbnail: null,
};
const checkSave = (changes) =>
  new Function("state", saveCode)(() => ({ ...save, ...changes }));

const NOT_HERE = "This file was not uploaded here. Upload it again.";
const SLASH = 'The record type and ID must be set and cannot contain "/".';

describe("check-upload", () => {
  test("a good upload passes", () => {
    expect(checkUpload()).toBeNull();
  });

  test("a caller with no organization is refused", () => {
    expect(checkUpload({ organization_id: null })).toBe(
      "Files can only be uploaded by a member of an organization.",
    );
  });

  test.each([
    ["a / in entity_type", { entity_type: "lot/other" }],
    ["a / in entity_id", { entity_id: "../lot-2" }],
    ["an empty entity_id", { entity_id: "" }],
  ])("%s is refused", (_, changes) => {
    expect(checkUpload(changes)).toBe(SLASH);
  });

  test("a file over max_file_size is refused", () => {
    expect(checkUpload({ file: { ...upload.file, size: 26 * MB } })).toBe(
      "This file is larger than the 25 MB limit.",
    );
  });

  test("a type outside allowed_content_types is refused", () => {
    expect(checkUpload({ allowed_content_types: ["image/png"] })).toBe(
      'Files of type "application/pdf" cannot be uploaded here.',
    );
    expect(
      checkUpload({ allowed_content_types: ["application/pdf"] }),
    ).toBeNull();
  });
});

describe("check-save", () => {
  test("a minted key passes and names the file from its last segment", () => {
    expect(checkSave()).toEqual({
      problem: null,
      name: "report.pdf",
      thumbnail: null,
    });
  });

  test.each([
    ["another organization", `org-b/files/lot/lot-1/${STAMP}/${UUID}/a.pdf`],
    ["another record", `org-a/files/lot/lot-2/${STAMP}/${UUID}/a.pdf`],
    ["another record type", `org-a/files/deal/lot-1/${STAMP}/${UUID}/a.pdf`],
    ["no files segment", `org-a/lot/lot-1/${STAMP}/${UUID}/a.pdf`],
    ["no timestamp", `org-a/files/lot/lot-1/${UUID}/a.pdf`],
    ["a bad timestamp", `org-a/files/lot/lot-1/2026-10-23/${UUID}/a.pdf`],
    ["no uuid", `org-a/files/lot/lot-1/${STAMP}/a.pdf`],
    ["a bad uuid", `org-a/files/lot/lot-1/${STAMP}/not-a-uuid/a.pdf`],
    ["no name", `org-a/files/lot/lot-1/${STAMP}/${UUID}/`],
    ["an extra segment", `org-a/files/lot/lot-1/${STAMP}/${UUID}/x/a.pdf`],
    ["an old unprefixed key", `lot/${STAMP}/${UUID}/a.pdf`],
    ["no key", undefined],
  ])("a key with %s is refused", (_, key) => {
    expect(checkSave({ key }).problem).toBe(NOT_HERE);
  });

  test("a / in entity_type is refused", () => {
    expect(
      checkSave({
        entity_type: "lot/x",
        key: `org-a/files/lot/x/lot-1/${STAMP}/${UUID}/a.pdf`,
      }).problem,
    ).toBe(SLASH);
  });

  test("a caller with no organization is refused", () => {
    expect(checkSave({ organization_id: null }).problem).toBe(
      "Files can only be saved by a member of an organization.",
    );
  });

  test("keeps only a small data:image/ thumbnail", () => {
    const small = `data:image/png;base64,${"a".repeat(100)}`;
    expect(checkSave({ thumbnail: small }).thumbnail).toBe(small);
    expect(
      checkSave({ thumbnail: `data:image/png;base64,${"a".repeat(16384)}` })
        .thumbnail,
    ).toBeNull();
    expect(
      checkSave({ thumbnail: "https://example.com/a.png" }).thumbnail,
    ).toBeNull();
    expect(
      checkSave({ thumbnail: "data:text/html;base64,PGI+" }).thumbnail,
    ).toBeNull();
  });
});

const signHeaders = (input) =>
  new Function("state", signCode)(() => ({
    key: "org-a/files/lot/lot-1/x/y/stored.pdf",
    content_type: "application/pdf",
    file_name: "report.pdf",
    ...input,
  }));

describe("sign-link", () => {
  test.each([
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "application/pdf",
  ])("%s opens inline", (content_type) => {
    expect(signHeaders({ content_type })).toEqual({
      content_type,
      content_disposition: "inline; filename*=UTF-8''report.pdf",
    });
  });

  test.each(["text/html", "image/svg+xml", "text/plain", "application/zip"])(
    "%s downloads",
    (content_type) => {
      expect(signHeaders({ content_type }).content_disposition).toBe(
        "attachment; filename*=UTF-8''report.pdf",
      );
    },
  );

  test("the name is encoded for filename*", () => {
    expect(
      signHeaders({ file_name: "a b+c&d (1)'*ü.pdf" }).content_disposition,
    ).toBe("inline; filename*=UTF-8''a%20b%2Bc%26d%20%281%29%27%2A%C3%BC.pdf");
  });

  test("a file with no type or name downloads under the key's last segment", () => {
    expect(signHeaders({ content_type: null, file_name: null })).toEqual({
      content_type: "application/octet-stream",
      content_disposition: "attachment; filename*=UTF-8''stored.pdf",
    });
  });
});
