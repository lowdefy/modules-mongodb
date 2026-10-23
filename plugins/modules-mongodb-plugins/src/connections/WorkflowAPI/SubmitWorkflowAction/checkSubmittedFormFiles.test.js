import checkSubmittedFormFiles from "./checkSubmittedFormFiles.js";

const USER = { id: "U1", organization_id: "org-a" };

const upload = (key) => {
  const file = { key, name: key.split("/").pop() };
  return { file, fileList: [file] };
};

function loaded({ form_data = {}, type = "inspect", key = null } = {}) {
  return { workflow: { form_data }, targetAction: { type, key } };
}

const check = ({ params, loadedState = loaded(), user = USER }) =>
  checkSubmittedFormFiles({ params, loadedState, user });

test("accepts a file under the caller's own organization", () => {
  expect(() =>
    check({ params: { form: { photo: upload("org-a/workflows/1.png") } } }),
  ).not.toThrow();
});

test("accepts a form with no files", () => {
  expect(() => check({ params: { form: { notes: "ok" } } })).not.toThrow();
  expect(() => check({ params: {} })).not.toThrow();
});

test("refuses another organization's prefix, naming the field", () => {
  expect(() =>
    check({ params: { form: { photo: upload("org-b/workflows/1.png") } } }),
  ).toThrow(
    expect.objectContaining({
      name: "UserError",
      isReject: true,
      message: expect.stringContaining("form.photo "),
    }),
  );
});

test("refuses a new key with no organization prefix", () => {
  expect(() =>
    check({ params: { form: { photo: upload("workflows/po/1.png") } } }),
  ).toThrow(/form\.photo/);
});

test("refuses a files module key in a form", () => {
  expect(() =>
    check({ params: { form: { photo: upload("org-a/files/deal/d1/1.png") } } }),
  ).toThrow(/form\.photo/);
});

test("refuses a bare key object nested anywhere, and checks form_review", () => {
  expect(() =>
    check({
      params: { form: { rooms: [{ evidence: { key: "org-b/x.png" } }] } },
    }),
  ).toThrow(/form\.rooms\.0\.evidence /);
  expect(() =>
    check({ params: { form_review: { note: upload("legacy/1.png") } } }),
  ).toThrow(/form_review\.note /);
});

test("refuses a foreign key hidden inside an own-prefix file", () => {
  const file = { key: "org-a/workflows/1.png", extra: { key: "org-b/2.png" } };
  expect(() => check({ params: { form: { photo: { file } } } })).toThrow(
    /form\.photo\.file\.extra/,
  );
});

test("carries over a legacy key already in the slot this submit merges into", () => {
  const loadedState = loaded({
    form_data: { inspect: { photo: upload("legacy/1.png") } },
  });
  expect(() =>
    check({
      params: { form: { photo: upload("legacy/1.png") } },
      loadedState,
    }),
  ).not.toThrow();
});

test("carries over in a keyed slot, but not a key from another slot", () => {
  const loadedState = loaded({
    type: "sign",
    key: "site-a",
    form_data: {
      sign: {
        "site-a": { scan: upload("legacy/a.pdf") },
        "site-b": { scan: upload("legacy/b.pdf") },
      },
      other: { scan: upload("legacy/c.pdf") },
    },
  });
  const submit = (key) =>
    check({
      params: { current_key: "site-a", form: { scan: upload(key) } },
      loadedState,
    });
  expect(() => submit("legacy/a.pdf")).not.toThrow();
  expect(() => submit("legacy/b.pdf")).toThrow(/form\.scan/);
  expect(() => submit("legacy/c.pdf")).toThrow(/form\.scan/);
});

test("a caller with no organization can only carry files over", () => {
  const loadedState = loaded({
    form_data: { inspect: { photo: upload("legacy/1.png") } },
  });
  expect(() =>
    check({
      params: { form: { photo: upload("legacy/1.png") } },
      loadedState,
      user: { id: "U1" },
    }),
  ).not.toThrow();
  expect(() =>
    check({
      params: { form: { photo: upload("org-a/workflows/1.png") } },
      loadedState,
      user: { id: "U1" },
    }),
  ).toThrow(/form\.photo/);
});
