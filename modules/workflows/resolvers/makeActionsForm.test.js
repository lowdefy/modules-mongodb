import makeActionsForm from "./makeActionsForm.js";

const FIELDS_DIR = "components/fields";

test("makeActionsForm: flat form composes — text_input substituted to _ref with vars", () => {
  const out = makeActionsForm(null, {
    form: [
      {
        component: "text_input",
        key: "contact_name",
        required: true,
        title: "Contact name",
      },
    ],
  });

  expect(out).toEqual([
    {
      _ref: {
        path: `${FIELDS_DIR}/text_input.yaml`,
        key: "config",
        vars: {
          key: "contact_name",
          required: true,
          title: "Contact name",
        },
      },
    },
  ]);
});

test("makeActionsForm: nested controlled_list — author form: renamed to blocks:, sub-form recursed", () => {
  const out = makeActionsForm(null, {
    form: [
      {
        component: "controlled_list",
        key: "form.devices",
        title: "Devices",
        form: [
          {
            component: "label_value",
            key: "form.devices.$._id",
            title: "Device Number",
          },
        ],
      },
    ],
  });

  expect(out).toHaveLength(1);
  const outer = out[0];
  expect(outer._ref.path).toBe(`${FIELDS_DIR}/controlled_list.yaml`);
  expect(outer._ref.vars.key).toBe("form.devices");
  expect(outer._ref.vars.title).toBe("Devices");
  // The author's `form:` is renamed to `blocks:` and substituted recursively.
  expect(outer._ref.vars.form).toBeUndefined();
  expect(outer._ref.vars.blocks).toEqual([
    {
      _ref: {
        path: `${FIELDS_DIR}/label_value.yaml`,
        key: "config",
        vars: {
          key: "form.devices.$._id",
          title: "Device Number",
        },
      },
    },
  ]);
});

test("makeActionsForm: empty / missing form returns []", () => {
  expect(makeActionsForm(null, { form: [] })).toEqual([]);
  expect(makeActionsForm(null, {})).toEqual([]);
});

test("makeActionsForm: duplicate keys across two text_inputs throw with /duplicate block id/", () => {
  expect(() =>
    makeActionsForm(null, {
      form: [
        { component: "text_input", key: "contact_name", required: true },
        { component: "text_input", key: "contact_name", required: true },
      ],
    }),
  ).toThrow(/duplicate block id 'contact_name'/);
});

test("makeActionsForm: viewOnly: true entry drops on mode 'edit'", () => {
  const out = makeActionsForm(null, {
    mode: "edit",
    form: [
      { component: "text_input", key: "contact_name", required: true },
      {
        component: "label",
        key: "form.validation.created",
        title: "Validated",
        viewOnly: true,
      },
    ],
  });

  expect(out).toHaveLength(1);
  expect(out[0]._ref.path).toBe(`${FIELDS_DIR}/text_input.yaml`);
  expect(out[0]._ref.vars.key).toBe("contact_name");
});

test("makeActionsForm: viewOnly: true entry survives on mode 'view'; viewOnly key stripped from emitted vars", () => {
  const out = makeActionsForm(null, {
    mode: "view",
    form: [
      { component: "text_input", key: "contact_name", required: true },
      {
        component: "label_value",
        key: "form.validation.created",
        title: "Validated",
        viewOnly: true,
      },
    ],
  });

  expect(out).toHaveLength(2);
  const labelEntry = out[1];
  expect(labelEntry._ref.path).toBe(`${FIELDS_DIR}/label_value.yaml`);
  expect(labelEntry._ref.vars).toEqual({
    key: "form.validation.created",
    title: "Validated",
  });
  expect("viewOnly" in labelEntry._ref.vars).toBe(false);
});

test("makeActionsForm: viewOnly entry without mode throws /'mode' var is required/", () => {
  expect(() =>
    makeActionsForm(null, {
      form: [
        {
          component: "text_input",
          key: "foo",
          viewOnly: true,
        },
      ],
    }),
  ).toThrow(/'mode' var is required when any form entry has viewOnly: true/);
});

test("makeActionsForm: invalid mode value throws /invalid mode/", () => {
  expect(() =>
    makeActionsForm(null, {
      mode: "bogus",
      form: [{ component: "text_input", key: "foo" }],
    }),
  ).toThrow(/invalid mode 'bogus'/);
});

// --- raw blocks (no component:) ---------------------------------------------

test("makeActionsForm: raw block key becomes id; key and title stripped", () => {
  const out = makeActionsForm(null, {
    form: [
      {
        key: "form.confidence",
        title: "Confidence",
        type: "RatingSlider",
        properties: { max: 5, title: "Confidence" },
      },
    ],
  });

  expect(out).toEqual([
    {
      id: "form.confidence",
      type: "RatingSlider",
      properties: { max: 5, title: "Confidence" },
    },
  ]);
});

test("makeActionsForm: raw block without key emits verbatim (title still stripped)", () => {
  const out = makeActionsForm(null, {
    form: [{ id: "spacer", type: "Box", title: "ignored" }],
  });

  expect(out).toEqual([{ id: "spacer", type: "Box" }]);
});

test("makeActionsForm: raw block with both key and id throws", () => {
  expect(() =>
    makeActionsForm(null, {
      form: [{ key: "form.a", id: "form.b", type: "TextInput" }],
    }),
  ).toThrow(/cannot define both 'key' \('form.a'\) and 'id' \('form.b'\)/);
});

test("makeActionsForm: raw block with non-string key throws", () => {
  expect(() =>
    makeActionsForm(null, { form: [{ key: 42, type: "TextInput" }] }),
  ).toThrow(/raw form block 'key' must be a string, received number/);
});

test("makeActionsForm: raw block id collides with a library component key", () => {
  expect(() =>
    makeActionsForm(null, {
      form: [
        { component: "text_input", key: "form.notes" },
        { key: "form.notes", type: "TextArea" },
      ],
    }),
  ).toThrow(/duplicate block id 'form.notes'/);
});

test("makeActionsForm: raw block nested in a structural component's form is mapped", () => {
  const out = makeActionsForm(null, {
    form: [
      {
        component: "section",
        key: "device_section",
        title: "Device",
        form: [
          { key: "form.device", title: "Device", type: "SegmentedSelector" },
        ],
      },
    ],
  });

  expect(out[0]._ref.vars.blocks).toEqual([
    { id: "form.device", type: "SegmentedSelector" },
  ]);
});

test("makeActionsForm: raw block viewOnly drops on edit, survives on view", () => {
  const form = [
    { key: "form.notes", type: "TextArea" },
    { key: "form.stamp", type: "Paragraph", viewOnly: true },
  ];

  expect(makeActionsForm(null, { mode: "edit", form })).toEqual([
    { id: "form.notes", type: "TextArea" },
  ]);
  expect(makeActionsForm(null, { mode: "view", form })).toEqual([
    { id: "form.notes", type: "TextArea" },
    { id: "form.stamp", type: "Paragraph" },
  ]);
});

test("makeActionsForm: key inside a raw block's own blocks: is left alone", () => {
  const out = makeActionsForm(null, {
    form: [
      {
        key: "wrapper",
        type: "Box",
        blocks: [{ id: "form.inner", type: "TextInput" }],
      },
    ],
  });

  expect(out).toEqual([
    {
      id: "wrapper",
      type: "Box",
      blocks: [{ id: "form.inner", type: "TextInput" }],
    },
  ]);
});
