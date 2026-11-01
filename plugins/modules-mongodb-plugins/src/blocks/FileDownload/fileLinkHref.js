const encodeSegments = (value) =>
  String(value).split("/").map(encodeURIComponent).join("/");

export function getFileKey(file) {
  return file?._id ?? file?.key ?? null;
}

// A file's link on the app's own domain:
// <basePath>/api/endpoints/<linkEndpointId>/<...linkPath>/<key>.
// Each linkPath entry is one encoded path segment. The key keeps its own "/"
// as separators, since link endpoints read the path after the endpoint id.
// The endpoint id is a module endpoint id such as "files/file", whose "/" is
// part of the route.
export default function fileLinkHref({
  basePath,
  linkEndpointId,
  linkPath,
  key,
}) {
  if (!linkEndpointId || key == null || key === "") return null;
  const segments = [
    ...(linkPath ?? []).map((segment) => encodeURIComponent(String(segment))),
    encodeSegments(key),
  ];
  return `${basePath ?? ""}/api/endpoints/${encodeSegments(linkEndpointId)}/${segments.join("/")}`;
}
