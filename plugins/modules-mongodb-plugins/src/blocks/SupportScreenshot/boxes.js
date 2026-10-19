// Box geometry for the screenshot editor. Boxes are { x, y, w, h } in pixels.

export const MIN_BOX_PX = 4;

// The box spanned by two drag points, clamped to a width × height area.
export const boxFromPoints = (start, end, width, height) => {
  const clamp = (v, max) => Math.min(Math.max(v, 0), max);
  const x1 = clamp(start.x, width);
  const y1 = clamp(start.y, height);
  const x2 = clamp(end.x, width);
  const y2 = clamp(end.y, height);
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
};

// A drag smaller than this on either side is a click, not a box.
export const isBox = (box) =>
  !!box && box.w >= MIN_BOX_PX && box.h >= MIN_BOX_PX;

export const scaleBox = (box, factor) => ({
  x: box.x * factor,
  y: box.y * factor,
  w: box.w * factor,
  h: box.h * factor,
});

// Whole pixels inside a width × height image, never empty.
export const toPixelBox = (box, width, height) => {
  const x = Math.min(Math.max(Math.floor(box.x), 0), width - 1);
  const y = Math.min(Math.max(Math.floor(box.y), 0), height - 1);
  const right = Math.min(Math.ceil(box.x + box.w), width);
  const bottom = Math.min(Math.ceil(box.y + box.h), height);
  return { x, y, w: Math.max(right - x, 1), h: Math.max(bottom - y, 1) };
};
