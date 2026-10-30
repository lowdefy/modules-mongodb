import {
  findFileByKey,
  pruneFormData,
  viewableActions,
} from "./viewableFormData.js";

describe("viewableActions", () => {
  test("keeps actions the caller holds any verb on", () => {
    const actions = [
      { _id: "a", access: { app: { view: true } } },
      { _id: "b", access: { app: { error: ["ops"] } } },
      { _id: "c", access: { app: { view: ["admin"] } } },
      { _id: "d" },
    ];
    const result = viewableActions({
      actions,
      slug: "app",
      userRoles: ["ops"],
    });
    expect(result.map(({ action }) => action._id)).toEqual(["a", "b"]);
    expect(result[1].allowed).toEqual({
      view: false,
      edit: false,
      review: false,
      error: true,
    });
  });
});

describe("pruneFormData", () => {
  const formData = {
    one: { x: 1 },
    keyed: { a: { y: 1 }, b: { y: 2 } },
    hidden: { z: 1 },
  };

  test("keeps unkeyed slots whole and only visible keyed slices", () => {
    expect(
      pruneFormData({
        formData,
        actions: [{ type: "one" }, { type: "keyed", key: "a" }],
      }),
    ).toEqual({ one: { x: 1 }, keyed: { a: { y: 1 } } });
  });

  test("an unkeyed action of a type keeps the whole slot over keyed ones", () => {
    expect(
      pruneFormData({
        formData,
        actions: [{ type: "keyed", key: "a" }, { type: "keyed" }],
      }),
    ).toEqual({ keyed: formData.keyed });
  });

  test("returns {} for missing form data", () => {
    expect(
      pruneFormData({ formData: null, actions: [{ type: "one" }] }),
    ).toEqual({});
  });
});

describe("findFileByKey", () => {
  const target = { key: "k/2", name: "2" };

  test.each([
    ["a bare file", target],
    ["a single-file value", { file: target }],
    ["a fileList", { fileList: [{ key: "k/1" }, target] }],
    ["a list of sections", { rows: [{ docs: { fileList: [target] } }] }],
    ["a keyed slot", { "site-a": { scan: { fileList: [target] } } }],
  ])("finds the key in %s", (_label, value) => {
    expect(findFileByKey(value, "k/2")).toBe(target);
  });

  test("returns null when no object carries the key", () => {
    expect(findFileByKey({ fileList: [{ key: "k/1" }] }, "k/2")).toBeNull();
    expect(findFileByKey("k/2", "k/2")).toBeNull();
    expect(findFileByKey(["k/2"], "k/2")).toBeNull();
  });
});
