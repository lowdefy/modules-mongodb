import http from "node:http";

// A stand-in for Pelican's support API on the port playwright.config.js points the
// support module at. Each test sets `answer`, a function from the call to
// { status, body } or { hangUp: true }, and reads back the calls it received.

export const STUB_PORT = 3102;

export function createPelicanStub() {
  const calls = [];
  let answer = () => ({ status: 500, body: {} });

  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      const call = {
        endpoint: req.url.replace("/api/endpoints/", ""),
        authorization: req.headers.authorization,
        body: raw ? JSON.parse(raw) : null,
      };
      calls.push(call);
      const reply = answer(call);
      if (reply.hangUp) {
        req.socket.destroy();
        return;
      }
      res.writeHead(reply.status, { "content-type": "application/json" });
      res.end(JSON.stringify(reply.body ?? {}));
    });
  });

  return {
    calls,
    answer(fn) {
      answer = fn;
    },
    reset() {
      calls.length = 0;
      answer = () => ({ status: 500, body: {} });
    },
    start: () =>
      new Promise((resolve) => server.listen(STUB_PORT, "127.0.0.1", resolve)),
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}
