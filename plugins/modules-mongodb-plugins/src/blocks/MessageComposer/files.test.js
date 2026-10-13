import {
  checkFiles,
  isAccepted,
  pastedFiles,
  pastedName,
} from "./files.js";

const file = (name, type, size = 10) => ({ name, type, size });

test("images and PDFs are accepted, other files are not", () => {
  expect(isAccepted(file("a.png", "image/png"))).toBe(true);
  expect(isAccepted(file("a.pdf", "application/pdf"))).toBe(true);
  expect(isAccepted(file("a.pdf", ""))).toBe(true);
  expect(isAccepted(file("a.zip", "application/zip"))).toBe(false);
});

test("pasted names carry the local time and stay unique", () => {
  const taken = new Set();
  const date = new Date(2026, 0, 2, 3, 4, 5);
  expect(pastedName(date, "image/png", taken)).toBe("pasted-20260102-030405.png");
  expect(pastedName(date, "image/jpeg", taken)).toBe("pasted-20260102-030405.jpg");
  expect(pastedName(date, "image/png", taken)).toBe("pasted-20260102-030405-2.png");
});

test("a paste with text is text, a paste of a screenshot is a file", () => {
  const png = file("image.png", "image/png");
  const data = (text) => ({ files: [png], getData: () => text });
  expect(pastedFiles(data(""))).toEqual([png]);
  expect(pastedFiles(data("image.png"))).toEqual([png]);
  expect(pastedFiles(data("A1\tB1"))).toEqual([]);
  expect(pastedFiles({ files: [], getData: () => "hi" })).toEqual([]);
});

test("checkFiles refuses the wrong type, the sixth file and a large file", () => {
  const big = file("big.png", "image/png", 11 * 1048576);
  const { accepted, rejected } = checkFiles({
    files: [
      file("a.png", "image/png"),
      file("a.zip", "application/zip"),
      big,
      file("b.png", "image/png"),
    ],
    attached: 3,
    maxFiles: 5,
    maxSize: 10 * 1048576,
  });
  expect(accepted.map((f) => f.name)).toEqual(["a.png", "b.png"]);
  expect(rejected.map((r) => r.file.name)).toEqual(["a.zip", "big.png"]);
});
