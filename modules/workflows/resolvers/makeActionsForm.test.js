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
