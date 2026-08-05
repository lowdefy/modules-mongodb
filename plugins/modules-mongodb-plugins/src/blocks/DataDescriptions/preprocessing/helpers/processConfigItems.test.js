// detectFieldType pulls the field type registry, which contains JSX the test
// transform does not parse. Type detection is not under test here — key
// expansion and recursion are — so stub it with a plain string type. The swc
// transform compiles this file to CJS, so jest.mock + require (instead of
// import) keeps the mock registered before the module loads.
jest.mock("./detectFieldType.js", () => ({
  __esModule: true,
  default: (value) =>
    value === undefined || value === null
      ? null
      : { type: "string", isArray: Array.isArray(value), config: {} },
}));

const processConfigItems = require("./processConfigItems.js").default;

function fieldKeys(items) {
  return items.filter((i) => i.type === "field").map((i) => i.key);
}

function sectionsOf(items) {
  return items.filter((i) => i.type === "section");
}

test("one-level list: fields resolve per index and get Item N sections", () => {
  const data = {
    form: { devices: [{ name: "Router" }, { name: "Switch" }] },
  };
  const form = [
    {
      key: "form.devices",
      title: "Devices",
      form: [{ key: "form.devices.$.name", component: "text_input" }],
    },
  ];

  const items = processConfigItems(data, form, 0);
  const [devices] = sectionsOf(items);

  expect(devices.title).toBe("Devices");
  expect(devices.isListItem).toBe(false);
  expect(devices.items).toHaveLength(2);
  expect(devices.items[0].title).toBe("Item 1");
  expect(devices.items[0].isListItem).toBe(true);
  expect(devices.items[1].title).toBe("Item 2");
  expect(fieldKeys(devices.items[0].items)).toEqual(["form.devices.0.name"]);
  expect(devices.items[0].items[0].value).toBe("Router");
  expect(fieldKeys(devices.items[1].items)).toEqual(["form.devices.1.name"]);
  expect(devices.items[1].items[0].value).toBe("Switch");
});

test("itemKey titles each list item from its own data, Item N on miss", () => {
  const data = {
    form: {
      devices: [{ name: "Router" }, { sku: "no-name" }, { name: "" }],
    },
  };
  const form = [
    {
      key: "form.devices",
      title: "Devices",
      itemKey: "name",
      form: [
        { key: "form.devices.$.name", component: "text_input" },
        { key: "form.devices.$.sku", component: "text_input" },
      ],
    },
  ];

  const [devices] = sectionsOf(processConfigItems(data, form, 0));

  expect(devices.items[0].title).toBe("Router");
  expect(devices.items[1].title).toBe("Item 2");
  expect(devices.items[2].title).toBe("Item 3");
});

test("itemKey supports dot notation and applies per nesting level", () => {
  const data = {
    form: {
      devices: [
        {
          meta: { label: "Router" },
          parts: [{ name: "Antenna" }, { sku: "no-name" }],
        },
      ],
    },
  };
  const form = [
    {
      key: "form.devices",
      itemKey: "meta.label",
      form: [
        { key: "form.devices.$.meta.label", component: "text_input" },
        {
          key: "form.devices.$.parts",
          itemKey: "name",
          form: [
            { key: "form.devices.$.parts.$.name", component: "text_input" },
            { key: "form.devices.$.parts.$.sku", component: "text_input" },
          ],
        },
      ],
    },
  ];

  const [devices] = sectionsOf(processConfigItems(data, form, 0));

  expect(devices.items[0].title).toBe("Router");
  const [parts] = sectionsOf(devices.items[0].items);
  expect(parts.items[0].title).toBe("Antenna");
  expect(parts.items[1].title).toBe("Item 2");
});

test("two-level nested list: inner $ expands with outer and inner indices", () => {
  const data = {
    form: {
      devices: [
        { name: "Router", parts: [{ sku: "A1" }, { sku: "A2" }] },
        { name: "Switch", parts: [{ sku: "B1" }] },
      ],
    },
  };
  const form = [
    {
      key: "form.devices",
      title: "Devices",
      form: [
        { key: "form.devices.$.name", component: "text_input" },
        {
          key: "form.devices.$.parts",
          title: "Parts",
          form: [
            { key: "form.devices.$.parts.$.sku", component: "text_input" },
          ],
        },
      ],
    },
  ];

  const [devices] = sectionsOf(processConfigItems(data, form, 0));

  const [item1, item2] = devices.items;
  expect(fieldKeys(item1.items)).toEqual(["form.devices.0.name"]);
  const [parts1] = sectionsOf(item1.items);
  expect(parts1.title).toBe("Parts");
  expect(parts1.items.map((s) => fieldKeys(s.items))).toEqual([
    ["form.devices.0.parts.0.sku"],
    ["form.devices.0.parts.1.sku"],
  ]);
  expect(parts1.items[0].items[0].value).toBe("A1");
  expect(parts1.items[1].items[0].value).toBe("A2");

  const [parts2] = sectionsOf(item2.items);
  expect(parts2.items.map((s) => fieldKeys(s.items))).toEqual([
    ["form.devices.1.parts.0.sku"],
  ]);
  expect(parts2.items[0].items[0].value).toBe("B1");
});

test("three-level nested list resolves at full depth", () => {
  const data = {
    form: {
      a: [{ b: [{ c: [{ v: "deep" }] }] }],
    },
  };
  const form = [
    {
      key: "form.a",
      form: [
        {
          key: "form.a.$.b",
          form: [
            {
              key: "form.a.$.b.$.c",
              form: [{ key: "form.a.$.b.$.c.$.v", component: "text_input" }],
            },
          ],
        },
      ],
    },
  ];

  const [a] = sectionsOf(processConfigItems(data, form, 0));
  const [b] = sectionsOf(a.items[0].items);
  const [c] = sectionsOf(b.items[0].items);
  const field = c.items[0].items[0];

  expect(field.key).toBe("form.a.0.b.0.c.0.v");
  expect(field.value).toBe("deep");
});

test("empty inner array: that item's inner section is omitted, siblings intact", () => {
  const data = {
    form: {
      devices: [
        { name: "Router", parts: [] },
        { name: "Switch", parts: [{ sku: "B1" }] },
      ],
    },
  };
  const form = [
    {
      key: "form.devices",
      form: [
        { key: "form.devices.$.name", component: "text_input" },
        {
          key: "form.devices.$.parts",
          title: "Parts",
          form: [
            { key: "form.devices.$.parts.$.sku", component: "text_input" },
          ],
        },
      ],
    },
  ];

  const [devices] = sectionsOf(processConfigItems(data, form, 0));

  expect(sectionsOf(devices.items[0].items)).toHaveLength(0);
  expect(fieldKeys(devices.items[0].items)).toEqual(["form.devices.0.name"]);
  expect(sectionsOf(devices.items[1].items)).toHaveLength(1);
});

test("nested list inside a section still expands parent indices", () => {
  const data = {
    form: { devices: [{ specs: { weight: "1kg" } }] },
  };
  const form = [
    {
      key: "form.devices",
      form: [
        {
          component: "section",
          title: "Specs",
          form: [
            { key: "form.devices.$.specs.weight", component: "text_input" },
          ],
        },
      ],
    },
  ];

  const [devices] = sectionsOf(processConfigItems(data, form, 0));
  const [specs] = sectionsOf(devices.items[0].items);

  expect(specs.title).toBe("Specs");
  expect(fieldKeys(specs.items)).toEqual(["form.devices.0.specs.weight"]);
  expect(specs.items[0].value).toBe("1kg");
});
