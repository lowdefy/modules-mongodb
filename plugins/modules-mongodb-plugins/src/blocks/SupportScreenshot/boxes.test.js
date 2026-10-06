import { boxFromPoints, isBox, scaleBox, toPixelBox } from "./boxes.js";

test("a drag in any direction gives the same box", () => {
  const box = { x: 10, y: 20, w: 30, h: 40 };
  expect(boxFromPoints({ x: 10, y: 20 }, { x: 40, y: 60 }, 100, 100)).toEqual(
    box,
  );
  expect(boxFromPoints({ x: 40, y: 60 }, { x: 10, y: 20 }, 100, 100)).toEqual(
    box,
  );
  expect(boxFromPoints({ x: 40, y: 20 }, { x: 10, y: 60 }, 100, 100)).toEqual(
    box,
  );
});

test("a drag past the edge stops at the edge", () => {
  expect(boxFromPoints({ x: -20, y: 50 }, { x: 150, y: 130 }, 100, 80)).toEqual(
    { x: 0, y: 50, w: 100, h: 30 },
  );
});

test("a tiny drag is not a box", () => {
  expect(isBox({ x: 0, y: 0, w: 3, h: 50 })).toBe(false);
  expect(isBox({ x: 0, y: 0, w: 50, h: 3 })).toBe(false);
  expect(isBox({ x: 0, y: 0, w: 4, h: 4 })).toBe(true);
  expect(isBox(null)).toBe(false);
});

test("scaleBox maps display pixels to image pixels", () => {
  expect(scaleBox({ x: 10, y: 5, w: 20, h: 8 }, 2.5)).toEqual({
    x: 25,
    y: 12.5,
    w: 50,
    h: 20,
  });
});

test("toPixelBox covers every partly covered pixel and stays inside the image", () => {
  expect(toPixelBox({ x: 1.5, y: 2.2, w: 3, h: 3 }, 100, 100)).toEqual({
    x: 1,
    y: 2,
    w: 4,
    h: 4,
  });
  expect(toPixelBox({ x: 95, y: 95, w: 20, h: 20 }, 100, 100)).toEqual({
    x: 95,
    y: 95,
    w: 5,
    h: 5,
  });
  expect(toPixelBox({ x: 120, y: -5, w: 0, h: 0 }, 100, 100)).toEqual({
    x: 99,
    y: 0,
    w: 1,
    h: 1,
  });
});
