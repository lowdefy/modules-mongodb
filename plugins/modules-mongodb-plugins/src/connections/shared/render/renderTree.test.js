import renderTree from "./renderTree.js";

test("renders strings, recurses objects/arrays, preserves non-strings", () => {
  const tree = {
    title: "{{ name }} did it",
    count: 3,
    flag: true,
    nested: { msg: "hi {{ name }}" },
    list: ["{{ name }}", 7, { deep: "{{ name }}!" }],
    nothing: null,
  };
  const out = renderTree(tree, { name: "Sam" });
  expect(out).toEqual({
    title: "Sam did it",
    count: 3,
    flag: true,
    nested: { msg: "hi Sam" },
    list: ["Sam", 7, { deep: "Sam!" }],
    nothing: null,
  });
});
