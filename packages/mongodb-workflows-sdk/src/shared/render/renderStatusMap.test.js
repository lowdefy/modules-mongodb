import renderStatusMap from "./renderStatusMap.js";

test("renders cell strings against the planned doc + hoisted metadata", () => {
  const rendered = renderStatusMap({
    cell: {
      demo: { message: "Install {{ physical_id }}" },
      status_title: "{{ type }} pending",
    },
    plannedActionDoc: {
      type: "install-step",
      metadata: { physical_id: "D-42" },
    },
    mergedMetadata: { physical_id: "D-42" },
  });
  expect(rendered).toEqual({
    demo: { message: "Install D-42" },
    status_title: "install-step pending",
  });
});

test("returns {} when there is no cell (prior values stay sticky on merge)", () => {
  expect(renderStatusMap({ cell: null, plannedActionDoc: {} })).toEqual({});
});

test("only emits the keys the author wrote — omitted slugs are not clobbered", () => {
  const rendered = renderStatusMap({
    cell: { demo: { message: "hi" } },
    plannedActionDoc: {},
  });
  expect(rendered).toEqual({ demo: { message: "hi" } });
  expect(rendered).not.toHaveProperty("customer");
});

test("mergedMetadata wins over an action-doc field collision", () => {
  const rendered = renderStatusMap({
    cell: { demo: { message: "{{ status_title }}" } },
    plannedActionDoc: { status_title: "doc-value" },
    mergedMetadata: { status_title: "meta-value" },
  });
  expect(rendered.demo.message).toBe("meta-value");
});
