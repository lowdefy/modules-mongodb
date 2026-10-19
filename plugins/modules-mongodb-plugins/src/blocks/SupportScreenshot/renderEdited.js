import { toPixelBox } from "./boxes.js";

// How far a blurred area is shrunk before it is stretched back. Text at any
// normal size is unreadable at 1/12, and the pixels are gone from the output.
const BLUR_FACTOR = 12;

const blurArea = (ctx, canvas, box) => {
  const { x, y, w, h } = toPixelBox(box, canvas.width, canvas.height);
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.ceil(w / BLUR_FACTOR));
  small.height = Math.max(1, Math.ceil(h / BLUR_FACTOR));
  const smallCtx = small.getContext("2d");
  smallCtx.imageSmoothingEnabled = true;
  smallCtx.imageSmoothingQuality = "high";
  smallCtx.drawImage(canvas, x, y, w, h, 0, 0, small.width, small.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(x, y, w, h);
  ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
};

// The screenshot with every blur box blurred, cropped to the crop box when
// there is one. Boxes are in the source canvas's pixels.
const renderEdited = (source, { blurs = [], crop = null } = {}) => {
  const work = document.createElement("canvas");
  work.width = source.width;
  work.height = source.height;
  const workCtx = work.getContext("2d");
  workCtx.drawImage(source, 0, 0);
  for (const box of blurs) blurArea(workCtx, work, box);
  if (!crop) return work;
  const { x, y, w, h } = toPixelBox(crop, work.width, work.height);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  out.getContext("2d").drawImage(work, x, y, w, h, 0, 0, w, h);
  return out;
};

export default renderEdited;
