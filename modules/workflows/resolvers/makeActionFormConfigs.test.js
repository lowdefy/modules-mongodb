import makeActionFormConfigs from "./makeActionFormConfigs.js";

const qualifyAction = {
  type: "qualify",
  kind: "form",
  form: [
    {
      component: "text_input",
      key: "contact_name",
      required: true,
      title: "Contact name",
    },
    { component: "text_area", key: "notes", title: "Notes" },
  ],
};

const sendQuoteAction = {
  type: "send-quote",
  kind: "form",
  form: [{ component: "number", key: "quote_total", required: true }],
  form_review: [{ component: "text_area", key: "approve_notes" }],
};

const proofOfInstallAction = {
  type: "proof-of-installation",
  kind: "form",
  form: [
    {
      component: "controlled_list",
      key: "form.devices",
      required: true,
      title: "Devices",
      form: [
        {
          component: "label_value",
          key: "form.devices.$._id",
          title: "Device Number",
        },
        {
          component: "date_range_selector",
          key: "form.devices.$.warranty",
          required: true,
          title: "Warranty",
        },
      ],
    },
  ],
};

const scheduleFollowupAction = {
  type: "schedule-followup",
  kind: "simple",
};

const trackInstallationAction = {
  type: "track-installation",
  kind: "tracker",
  tracker: { workflow_type: "device-installation" },
};

function workflow(actions) {
  return {
    type: "onboarding",
    entity_collection: "leads-collection",
    actions,
  };
}

test("makeActionFormConfigs: worked-example shape with mixed actions and nested controlled_list", () => {
  const out = makeActionFormConfigs(null, {
    workflows: [
      workflow([
        qualifyAction,
        sendQuoteAction,
        proofOfInstallAction,
        scheduleFollowupAction,
        trackInstallationAction,
      ]),
    ],
  });

  expect(Object.keys(out).sort()).toEqual([
    "proof-of-installation",
    "qualify",
    "send-quote",
  ]);

  expect(out.qualify).toEqual({
    form: [
      {
        component: "text_input",
        key: "contact_name",
        required: true,
        title: "Contact name",
      },
      {
        component: "text_area",
        key: "notes",
        required: false,
        title: "Notes",
      },
    ],
  });

  expect(out["send-quote"]).toEqual({
    form: [
      { component: "number", key: "quote_total", required: true },
    ],
    form_review: [
      { component: "text_area", key: "approve_notes", required: false },
    ],
  });

  expect(out["proof-of-installation"]).toEqual({
    form: [
      {
        component: "controlled_list",
        key: "form.devices",
        required: true,
        title: "Devices",
        form: [
          {
            component: "label_value",
            key: "form.devices.$._id",
            required: false,
            title: "Device Number",
          },
          {
            component: "date_range_selector",
            key: "form.devices.$.warranty",
            required: true,
            title: "Warranty",
          },
        ],
      },
    ],
  });
});

test("makeActionFormConfigs: form_error absent → metadata does not carry form_error", () => {
  const out = makeActionFormConfigs(null, {
    workflows: [workflow([qualifyAction])],
  });

  expect(out.qualify).toBeDefined();
  expect("form_error" in out.qualify).toBe(false);
});

test("makeActionFormConfigs: form_error present → metadata carries form_error", () => {
  const withError = {
    ...qualifyAction,
    type: "qualify-with-error",
    form_error: [
      { component: "text_area", key: "recovery_notes" },
    ],
  };

  const out = makeActionFormConfigs(null, {
    workflows: [workflow([withError])],
  });

  expect(out["qualify-with-error"].form_error).toEqual([
    { component: "text_area", key: "recovery_notes", required: false },
  ]);
});

test("makeActionFormConfigs: keyed action → one entry per action_type, no per-instance entries", () => {
  const keyedAction = {
    type: "install-device",
    kind: "form",
    key: "$device_id",
    form: [{ component: "text_input", key: "serial", required: true }],
  };

  const out = makeActionFormConfigs(null, {
    workflows: [workflow([keyedAction])],
  });

  expect(Object.keys(out)).toEqual(["install-device"]);
  expect(out["install-device"].form).toEqual([
    { component: "text_input", key: "serial", required: true },
  ]);
});
