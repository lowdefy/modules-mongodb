import { domToCanvas } from "modern-screenshot";

export const BUILT_IN_MASKS = ['input[type="password"]', "[data-support-mask]"];
export const MASK_FILL = "#bfbfbf";

// Marks set on the live page for the length of one capture. The clone keeps
// its source's attributes, so onCloneEachNode reads them off the clone.
const HIDE_ATTR = "data-support-capture-hide";
const MASK_ATTR = "data-support-capture-mask";
const FIXED_ATTR = "data-support-capture-fixed";
const STICKY_ATTR = "data-support-capture-sticky";

const queryAll = (selectors) => {
  const found = new Set();
  for (const selector of selectors) {
    if (typeof selector !== "string" || selector.trim() === "") continue;
    // An invalid selector throws: a mask that silently matched nothing would
    // send what it was meant to hide.
    document.querySelectorAll(selector).forEach((el) => found.add(el));
  }
  return [...found];
};

const px = (n) => `${Math.round(n * 100) / 100}px`;

// The box a position: absolute element is placed against: the nearest
// ancestor that is positioned or transformed. body is transformed in the clone
// (it carries the page's scroll offset), so it is the last resort.
const containingBlock = (el) => {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (node === document.body) return node;
    const style = getComputedStyle(node);
    if (
      style.position !== "static" ||
      style.transform !== "none" ||
      style.filter !== "none"
    ) {
      return node;
    }
  }
  return document.body;
};

const markPage = ({ hideSelectors, maskSelectors }) => {
  const marked = [];
  const mark = (el, attr, value) => {
    marked.push([el, attr]);
    el.setAttribute(attr, value);
  };
  for (const el of queryAll(hideSelectors)) mark(el, HIDE_ATTR, "");
  for (const el of queryAll([...BUILT_IN_MASKS, ...maskSelectors])) {
    const rect = el.getBoundingClientRect();
    const inline = getComputedStyle(el).display === "inline" ? "1" : "0";
    mark(el, MASK_ATTR, `${rect.width},${rect.height},${inline}`);
  }
  // The clone is drawn from the top of the document, with body shifted up by
  // the scroll offset. A fixed element would move with it, so each one is
  // drawn as an absolute box where it shows in the viewport. A sticky element
  // is drawn where it sits in the flow, unscrolled, so it is drawn offset by
  // as far as scrolling has moved it.
  const sticky = [];
  for (const el of document.body.querySelectorAll("*")) {
    const { position } = getComputedStyle(el);
    if (position === "sticky") sticky.push(el);
    if (position !== "fixed") continue;
    const rect = el.getBoundingClientRect();
    const block = containingBlock(el);
    const blockRect = block.getBoundingClientRect();
    const left = rect.left - blockRect.left - block.clientLeft;
    const top = rect.top - blockRect.top - block.clientTop;
    mark(el, FIXED_ATTR, `${left},${top},${rect.width},${rect.height}`);
  }
  // Read where each sticky element would sit unstuck, in document
  // coordinates: unsticking can make the browser's scroll anchoring move the
  // page, which is put back. Nothing paints between these synchronous changes,
  // so the page never shows them.
  if (sticky.length > 0) {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const stuck = sticky.map((el) => el.getBoundingClientRect());
    const saved = sticky.map((el) => [
      el.style.getPropertyValue("position"),
      el.style.getPropertyPriority("position"),
    ]);
    sticky.forEach((el) =>
      el.style.setProperty("position", "relative", "important"),
    );
    const unstuck = sticky.map((el) => {
      const rect = el.getBoundingClientRect();
      return {
        left: rect.left + window.scrollX - scrollX,
        top: rect.top + window.scrollY - scrollY,
      };
    });
    sticky.forEach((el, i) => {
      const [value, priority] = saved[i];
      if (value) el.style.setProperty("position", value, priority);
      else el.style.removeProperty("position");
    });
    if (window.scrollX !== scrollX || window.scrollY !== scrollY) {
      window.scrollTo(scrollX, scrollY);
    }
    sticky.forEach((el, i) => {
      const dx = stuck[i].left - unstuck[i].left;
      const dy = stuck[i].top - unstuck[i].top;
      if (dx !== 0 || dy !== 0) mark(el, STICKY_ATTR, `${dx},${dy}`);
    });
  }
  return () => {
    for (const [el, attr] of marked) el.removeAttribute(attr);
  };
};

const blankClone = (cloned, value) => {
  const [width, height, inline] = value.split(",");
  while (cloned.firstChild) cloned.removeChild(cloned.firstChild);
  for (const attr of ["value", "placeholder", "src", "srcset", "poster"]) {
    cloned.removeAttribute(attr);
  }
  // Pseudo-element content is drawn through classes the capture adds.
  cloned.removeAttribute("class");
  const style = cloned.style;
  if (inline === "1") style.setProperty("display", "inline-block", "important");
  style.setProperty("box-sizing", "border-box", "important");
  style.setProperty("width", px(Number(width)), "important");
  style.setProperty("height", px(Number(height)), "important");
  style.setProperty("min-width", "0", "important");
  style.setProperty("min-height", "0", "important");
  style.setProperty("overflow", "hidden", "important");
  style.setProperty("background", MASK_FILL, "important");
  style.setProperty("color", "transparent", "important");
  style.setProperty("-webkit-text-fill-color", "transparent", "important");
  style.setProperty("text-shadow", "none", "important");
};

const placeFixedClone = (cloned, value) => {
  const [left, top, width, height] = value.split(",").map(Number);
  const style = cloned.style;
  style.setProperty("position", "absolute", "important");
  style.setProperty("left", px(left), "important");
  style.setProperty("top", px(top), "important");
  style.setProperty("right", "auto", "important");
  style.setProperty("bottom", "auto", "important");
  style.setProperty("width", px(width), "important");
  style.setProperty("height", px(height), "important");
  style.setProperty("margin", "0", "important");
  style.setProperty("transform", "none", "important");
  style.setProperty("box-sizing", "border-box", "important");
};

const placeStickyClone = (cloned, value) => {
  const [dx, dy] = value.split(",").map(Number);
  const style = cloned.style;
  style.setProperty("position", "relative", "important");
  style.setProperty("left", px(dx), "important");
  style.setProperty("top", px(dy), "important");
  style.setProperty("right", "auto", "important");
  style.setProperty("bottom", "auto", "important");
};

const onCloneEachNode = (cloned) => {
  if (cloned.nodeType !== 1) return;
  if (cloned.hasAttribute(HIDE_ATTR)) {
    cloned.style.setProperty("visibility", "hidden", "important");
    cloned.style.setProperty("opacity", "0", "important");
  }
  const fixed = cloned.getAttribute(FIXED_ATTR);
  if (fixed) placeFixedClone(cloned, fixed);
  const sticky = cloned.getAttribute(STICKY_ATTR);
  if (sticky) placeStickyClone(cloned, sticky);
  const mask = cloned.getAttribute(MASK_ATTR);
  if (mask) blankClone(cloned, mask);
  cloned.removeAttribute(HIDE_ATTR);
  cloned.removeAttribute(MASK_ATTR);
  cloned.removeAttribute(FIXED_ATTR);
  cloned.removeAttribute(STICKY_ATTR);
};

// Draws the visible part of the page to a canvas, at the device pixel ratio
// (at most 2). The live page only gains marker attributes, removed again
// before this returns or throws.
const capturePage = async ({ hideSelectors = [], maskSelectors = [] } = {}) => {
  const unmark = markPage({ hideSelectors, maskSelectors });
  try {
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    return await domToCanvas(document.documentElement, {
      width,
      height,
      scale: Math.min(window.devicePixelRatio || 1, 2),
      features: { restoreScrollPosition: true },
      onCloneEachNode,
    });
  } finally {
    unmark();
  }
};

export default capturePage;
