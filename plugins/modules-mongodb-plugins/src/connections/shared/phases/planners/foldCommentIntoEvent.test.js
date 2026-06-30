import foldCommentIntoEvent from "./foldCommentIntoEvent.js";

const APP = "demo";

const payloadWith = (display) => ({
  type: "action-submit",
  display,
  references: {},
  metadata: {},
});

describe("foldCommentIntoEvent", () => {
  // ── Emptiness gate (visibility-independent) ────────────────────────────────
  test("empty-document value is a no-op (text null, empty fileList)", () => {
    const payload = payloadWith({ [APP]: { title: "Sam submitted" } });
    foldCommentIntoEvent(
      payload,
      { html: "<p></p>", text: null, fileList: [] },
      APP,
    );
    expect(payload.display[APP].description).toBeUndefined();
  });

  test("whitespace-only text is a no-op", () => {
    const payload = payloadWith({ [APP]: { title: "Sam submitted" } });
    foldCommentIntoEvent(
      payload,
      { html: "<p>  </p>", text: "  \n", fileList: [] },
      APP,
    );
    expect(payload.display[APP].description).toBeUndefined();
  });

  test("comment null is a no-op", () => {
    const payload = payloadWith({ [APP]: { title: "Sam submitted" } });
    foldCommentIntoEvent(payload, null, APP);
    expect(payload.display[APP].description).toBeUndefined();
  });

  test("comment undefined is a no-op", () => {
    const payload = payloadWith({ [APP]: { title: "Sam submitted" } });
    foldCommentIntoEvent(payload, undefined, APP);
    expect(payload.display[APP].description).toBeUndefined();
  });

  test("plain-string comment is a no-op (object-vs-string input)", () => {
    const payload = payloadWith({ [APP]: { title: "Sam submitted" } });
    foldCommentIntoEvent(payload, "hello", APP);
    expect(payload.display[APP].description).toBeUndefined();
  });

  test("no-op regardless of visibility / opt-in", () => {
    const payload = payloadWith({
      [APP]: { title: "Sam submitted" },
      portal: { title: "Updated" },
    });
    foldCommentIntoEvent(payload, null, APP, "internal", true);
    expect(payload.display[APP].description).toBeUndefined();
    expect(payload.display.portal.description).toBeUndefined();
  });

  // ── shared (default) — fans out to every bucket (Part 61 D1/D3) ────────────
  test("default visibility (absent) is shared: writes the single bucket", () => {
    const payload = payloadWith({ [APP]: { title: "Sam submitted" } });
    foldCommentIntoEvent(payload, { html: "<p>hi</p>", text: "hi" }, APP);
    expect(payload.display[APP].description).toBe("<p>hi</p>");
  });

  test("shared fans the comment into every bucket on the display", () => {
    const payload = payloadWith({
      [APP]: { title: "Sam submitted" },
      portal: { title: "Updated" },
    });
    foldCommentIntoEvent(payload, { html: "<p>hi</p>", text: "hi" }, APP);
    expect(payload.display[APP].description).toBe("<p>hi</p>");
    expect(payload.display.portal.description).toBe("<p>hi</p>");
  });

  test("explicit shared behaves identically to absent", () => {
    const payload = payloadWith({
      [APP]: { title: "Sam submitted" },
      portal: { title: "Updated" },
    });
    foldCommentIntoEvent(
      payload,
      { html: "<p>hi</p>", text: "hi" },
      APP,
      "shared",
      true,
    );
    expect(payload.display[APP].description).toBe("<p>hi</p>");
    expect(payload.display.portal.description).toBe("<p>hi</p>");
  });

  test("shared preserves every title and only sets description", () => {
    const payload = payloadWith({
      [APP]: { title: "Sam submitted" },
      portal: { title: "Updated" },
    });
    foldCommentIntoEvent(payload, { html: "<p>hi</p>", text: "hi" }, APP);
    expect(payload.display[APP].title).toBe("Sam submitted");
    expect(payload.display.portal.title).toBe("Updated");
  });

  // ── internal — single bucket, only when the connection opted in (D2/D4) ────
  test("internal with opt-in writes ONLY the submitting app's bucket", () => {
    const payload = payloadWith({
      [APP]: { title: "Sam submitted" },
      portal: { title: "Updated" },
    });
    foldCommentIntoEvent(
      payload,
      { html: "<p>note</p>", text: "note" },
      APP,
      "internal",
      true,
    );
    expect(payload.display[APP].description).toBe("<p>note</p>");
    expect(payload.display.portal).toEqual({ title: "Updated" });
  });

  test("internal WITHOUT opt-in is coerced to shared (fans out)", () => {
    const payload = payloadWith({
      [APP]: { title: "Sam submitted" },
      portal: { title: "Updated" },
    });
    foldCommentIntoEvent(
      payload,
      { html: "<p>note</p>", text: "note" },
      APP,
      "internal",
      false,
    );
    expect(payload.display[APP].description).toBe("<p>note</p>");
    expect(payload.display.portal.description).toBe("<p>note</p>");
  });

  test("internal with opt-in omitted (default false) is coerced to shared", () => {
    const payload = payloadWith({
      [APP]: { title: "Sam submitted" },
      portal: { title: "Updated" },
    });
    foldCommentIntoEvent(
      payload,
      { html: "<p>note</p>", text: "note" },
      APP,
      "internal",
    );
    expect(payload.display.portal.description).toBe("<p>note</p>");
  });

  test("unrecognised visibility value falls back to shared", () => {
    const payload = payloadWith({
      [APP]: { title: "Sam submitted" },
      portal: { title: "Updated" },
    });
    foldCommentIntoEvent(
      payload,
      { html: "<p>hi</p>", text: "hi" },
      APP,
      "garbage",
      true,
    );
    expect(payload.display.portal.description).toBe("<p>hi</p>");
  });

  // ── fileList / verbatim / bucket-creation (carried from Part 33) ───────────
  test("image-only comment (no text, populated fileList) folds html", () => {
    const payload = payloadWith({ [APP]: { title: "Sam submitted" } });
    foldCommentIntoEvent(
      payload,
      {
        html: '<p><img src="data:image/png;base64,abc"></p>',
        text: null,
        fileList: [{ uid: "1", name: "shot.png" }],
      },
      APP,
    );
    expect(payload.display[APP].description).toBe(
      '<p><img src="data:image/png;base64,abc"></p>',
    );
  });

  test("missing display[appName] bucket is created via ??=", () => {
    const payload = payloadWith({ portal: { title: "Updated" } });
    expect(() =>
      foldCommentIntoEvent(
        payload,
        { html: "<p>hi</p>", text: "hi" },
        APP,
        "internal",
        true,
      ),
    ).not.toThrow();
    expect(payload.display[APP].description).toBe("<p>hi</p>");
    // internal: the other bucket is untouched.
    expect(payload.display.portal).toEqual({ title: "Updated" });
  });

  test("template syntax in html is stored verbatim, not interpolated, no throw", () => {
    const payload = payloadWith({ [APP]: { title: "Sam submitted" } });
    const html = "<p>{{ workflow.entity_id }} and a stray {% raw</p>";
    expect(() =>
      foldCommentIntoEvent(payload, { html, text: "x" }, APP),
    ).not.toThrow();
    expect(payload.display[APP].description).toBe(html);
  });
});
