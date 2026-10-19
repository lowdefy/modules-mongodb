// Pure helpers for MessageComposer: which files it takes, and which files a
// paste or drop carries.

const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const pad = (n) => String(n).padStart(2, "0");

/** The file extension for a content type, png when it tells nothing. */
export const extensionFor = (contentType) => {
  const type = String(contentType ?? "").toLowerCase();
  if (EXTENSIONS[type]) return EXTENSIONS[type];
  const sub = type.startsWith("image/")
    ? type.slice(6).replace(/[^a-z0-9]/g, "")
    : "";
  return sub || "png";
};

/** pasted-YYYYMMDD-HHmmss.<ext> in local time, -2, -3 when the name is taken. */
export const pastedName = (date, contentType, taken = new Set()) => {
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate(),
  )}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const ext = extensionFor(contentType);
  let name = `pasted-${stamp}.${ext}`;
  for (let n = 2; taken.has(name); n += 1) {
    name = `pasted-${stamp}-${n}.${ext}`;
  }
  taken.add(name);
  return name;
};

/** Whether a file is an image or a PDF. */
export const isAccepted = (file) => {
  const type = String(file?.type ?? "").toLowerCase();
  if (type.startsWith("image/") || type === "application/pdf") return true;
  return !type && /\.pdf$/i.test(file?.name ?? "");
};

export const isImage = (file) =>
  String(file?.type ?? "")
    .toLowerCase()
    .startsWith("image/");

/** The accepted files in clipboard or drop data (a DataTransfer). */
export const filesFromData = (data) => {
  if (!data) return [];
  const files = Array.from(data.files ?? []).filter(isAccepted);
  if (files.length > 0) return files;
  return Array.from(data.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file) => file && isAccepted(file));
};

/**
 * The files a paste should attach. A paste that also carries text is text
 * (Office apps put a picture of the copied cells next to them), unless the text
 * is only the files' names, as a screenshot or files copied in Finder give.
 */
export const pastedFiles = (data) => {
  const files = filesFromData(data);
  if (files.length === 0) return [];
  const text =
    typeof data.getData === "function" ? (data.getData("text/plain") ?? "") : "";
  const names = new Set(files.map((file) => file.name));
  const lines = text
    .split(/[\r\n]+/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.every((line) => names.has(line)) ? files : [];
};

/**
 * Checks files against what is already attached. Returns { accepted, rejected },
 * each rejected entry { file, message }.
 */
export const checkFiles = ({ files, attached, maxFiles, maxSize }) => {
  const accepted = [];
  const rejected = [];
  files.forEach((file) => {
    let message = null;
    if (!isAccepted(file)) message = "Only images and PDFs can be attached.";
    else if (attached + accepted.length >= maxFiles)
      message = `Attach up to ${maxFiles} files.`;
    else if (file.size > maxSize)
      message = `Too large, the limit is ${Math.round(maxSize / 1048576)} MB.`;
    if (message) rejected.push({ file, message });
    else accepted.push(file);
  });
  return { accepted, rejected };
};
