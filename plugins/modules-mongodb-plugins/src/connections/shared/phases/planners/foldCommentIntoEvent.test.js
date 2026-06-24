import foldCommentIntoEvent from "./foldCommentIntoEvent.js";

const APP = "demo";

const payloadWith = (display) => ({
  type: "action-submit",
  display,
  references: {},
  metadata: {},
});

describe("foldCommentIntoEvent", () => {
  test("text present folds comment.html into display[app].description", () => {
    const payload = payloadWith({ [APP]: { title: "Sam submitted" } });
    foldCommentIntoEvent(payload, { html: "<p>hi</p>", text: "hi" }, APP);
    expect(payload.display[APP].description).toBe("<p>hi</p>");
  });

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

  test("existing title is not clobbered and other app buckets are untouched", () => {
    const payload = payloadWith({
      [APP]: { title: "Sam submitted" },
      portal: { title: "Updated" },
    });
    foldCommentIntoEvent(payload, { html: "<p>hi</p>", text: "hi" }, APP);
    expect(payload.display[APP].title).toBe("Sam submitted");
    expect(payload.display[APP].description).toBe("<p>hi</p>");
    expect(payload.display.portal).toEqual({ title: "Updated" });
  });

  test("missing display[appName] bucket is created via ??=", () => {
    const payload = payloadWith({ portal: { title: "Updated" } });
    expect(() =>
      foldCommentIntoEvent(payload, { html: "<p>hi</p>", text: "hi" }, APP),
    ).not.toThrow();
    expect(payload.display[APP].description).toBe("<p>hi</p>");
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
