import { urlQuery } from "@lowdefy/helpers";
import { WebParser } from "@lowdefy/operators";
import * as operators from "@lowdefy/operators-js/operators/client";

const identity = (value) => value;

// _url_query reads globals.window.location.search — substitute a window
// carrying the mock urlQuery when one is provided.
function buildWindow(mockUrlQuery) {
  const realWindow = typeof window !== "undefined" ? window : {};
  if (!mockUrlQuery) return realWindow;
  return {
    ...realWindow,
    location: { search: `?${urlQuery.stringify(mockUrlQuery)}` },
  };
}

function buildContext(mock, previewState) {
  const requests = {};
  Object.entries(mock.requests ?? {}).forEach(([id, response]) => {
    requests[id] = [{ response, loading: false }];
  });
  return {
    id: "preview",
    jsMap: undefined,
    eventLog: [],
    requests,
    state: { ...(mock.state ?? {}), ...(previewState ?? {}) },
    websockets: {},
    _internal: {
      lowdefy: {
        apiResponses: {},
        basePath: "",
        home: {},
        i18n: identity,
        inputs: { preview: {} },
        lowdefyApp: {},
        lowdefyGlobal: mock.global ?? {},
        menus: [],
        pageId: "form_builder_preview",
        theme: {},
        user: mock.user ?? {},
        _internal: {
          globals: {
            window: buildWindow(mock.urlQuery),
            document: typeof document !== "undefined" ? document : {},
          },
        },
      },
    },
  };
}

export function createPreviewParser(mock = {}, previewState = {}) {
  return new WebParser({
    context: buildContext(mock, previewState),
    operators,
  });
}

// Parses a value, never throwing — returns the original input and captured
// errors so the canvas can render an error chip instead of crashing.
export function parsePreview(parser, input, location) {
  if (input == null) return { output: input, errors: [] };
  try {
    const { output, errors } = parser.parse({
      input,
      location,
      arrayIndices: [],
    });
    return { output, errors: errors ?? [] };
  } catch (error) {
    return { output: input, errors: [error] };
  }
}
