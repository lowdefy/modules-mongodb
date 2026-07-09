import planFormDataMerge from "./planFormDataMerge.js";

function makeLoadedState({ form_data = {}, type = "install-step" } = {}) {
  return {
    workflow: {
      _id: "wf-1",
      workflow_type: "device-installation",
      form_data,
    },
    targetAction: { _id: "a-1", workflow_id: "wf-1", type },
  };
}

test("unkeyed action: merges onto form_data[type]", () => {
  const { form_data, submitted_form } = planFormDataMerge({
    params: { form: { physical_id: "D-42" } },
    preHookResult: undefined,
    loadedState: makeLoadedState(),
  });

  expect(submitted_form).toEqual({ physical_id: "D-42" });
  expect(form_data).toEqual({ "install-step": { physical_id: "D-42" } });
});

test("keyed action: merges onto form_data[type][current_key]; sibling keys untouched", () => {
  const loadedState = makeLoadedState({
    form_data: {
      "install-step": {
        "device-1": { physical_id: "D-1" },
        "device-2": { physical_id: "D-2" },
      },
    },
  });

  const { form_data } = planFormDataMerge({
    params: { form: { physical_id: "D-2b" }, current_key: "device-2" },
    loadedState,
  });

  expect(form_data).toEqual({
    "install-step": {
      "device-1": { physical_id: "D-1" },
      "device-2": { physical_id: "D-2b" },
    },
  });
});

test("channel merge order: form → form_review → form_overrides, later wins per-key", () => {
  const { submitted_form } = planFormDataMerge({
    params: {
      form: { a: 1, b: 1, c: 1 },
      form_review: { b: 2, c: 2 },
    },
    preHookResult: { form_overrides: { c: 3 } },
    loadedState: makeLoadedState(),
  });

  expect(submitted_form).toEqual({ a: 1, b: 2, c: 3 });
});

test("inter-channel merge is deep: nested sibling keys from different channels survive", () => {
  const { submitted_form } = planFormDataMerge({
    params: {
      form: { validation: { passed: true } },
      form_review: { validation: { reviewer: "u2" } },
    },
    preHookResult: { form_overrides: { validation: { stamped: true } } },
    loadedState: makeLoadedState(),
  });

  expect(submitted_form).toEqual({
    validation: { passed: true, reviewer: "u2", stamped: true },
  });
});

test("deep-merge onto loaded base preserves sibling sub-keys from earlier submits", () => {
  const loadedState = makeLoadedState({
    form_data: {
      "install-step": {
        physical_id: "D-42",
        validation: { passed: false, comment: "redo" },
      },
    },
  });

  const { form_data } = planFormDataMerge({
    params: { form_review: { validation: { passed: true } } },
    loadedState,
  });

  expect(form_data["install-step"]).toEqual({
    physical_id: "D-42",
    validation: { passed: true, comment: "redo" },
  });
});

test("arrays replace whole, not element-wise", () => {
  const loadedState = makeLoadedState({
    form_data: { "install-step": { access_control: ["a", "b", "c"] } },
  });

  const { form_data } = planFormDataMerge({
    params: { form: { access_control: ["d"] } },
    loadedState,
  });

  expect(form_data["install-step"].access_control).toEqual(["d"]);
});

test("explicit null clears a scalar; omitted field persists its prior value", () => {
  const loadedState = makeLoadedState({
    form_data: { "install-step": { physical_id: "D-42", serial: "S-1" } },
  });

  const { form_data } = planFormDataMerge({
    params: { form: { serial: null } },
    loadedState,
  });

  expect(form_data["install-step"]).toEqual({
    physical_id: "D-42", // omitted → persists
    serial: null, // explicit null → cleared
  });
});

test("Date replaces whole (non-plain-object leaf, not deep-merged)", () => {
  const loadedState = makeLoadedState({
    form_data: {
      "install-step": { installed_at: new Date("2026-01-01T00:00:00Z") },
    },
  });
  const next = new Date("2026-05-20T00:00:00Z");

  const { form_data } = planFormDataMerge({
    params: { form: { installed_at: next } },
    loadedState,
  });

  expect(form_data["install-step"].installed_at).toBe(next);
});

test("empty channels: submitted_form is {} and form_data equals the loaded value (no empty namespace created)", () => {
  const loadedState = makeLoadedState({
    form_data: { "other-step": { done: true } },
  });

  const { form_data, submitted_form } = planFormDataMerge({
    params: {},
    loadedState,
  });

  expect(submitted_form).toEqual({});
  expect(form_data).toEqual({ "other-step": { done: true } });
  expect(form_data["install-step"]).toBeUndefined();
});

test("target path absent in loaded form_data → created (keyed)", () => {
  const { form_data } = planFormDataMerge({
    params: { form: { physical_id: "D-9" }, current_key: "device-9" },
    loadedState: makeLoadedState({ form_data: {} }),
  });

  expect(form_data).toEqual({
    "install-step": { "device-9": { physical_id: "D-9" } },
  });
});

test("does not mutate loadedState, and the result shares no mutated containers with the input", () => {
  const loadedState = makeLoadedState({
    form_data: {
      "install-step": { validation: { passed: false }, tags: ["x"] },
      "other-step": { done: true },
    },
  });
  const snapshot = structuredClone(loadedState);

  const { form_data } = planFormDataMerge({
    params: { form: { validation: { passed: true } } },
    loadedState,
  });

  expect(loadedState).toEqual(snapshot);

  // Mutating the planned result must not reach back into the loaded doc.
  form_data["install-step"].validation.passed = "mutated";
  form_data["install-step"].tags.push("y");
  form_data["other-step"].done = "mutated";
  expect(loadedState).toEqual(snapshot);
});
