import renderEventDisplay from "./renderEventDisplay.js";

test("renders a per-app display block against the event context", () => {
  const out = renderEventDisplay({
    display: {
      demo: {
        title:
          "{{ user.profile.name }} marked {{ action.type }} as {{ status_after }}",
      },
    },
    ctx: {
      user: { profile: { name: "Sam" } },
      action: { type: "install-step" },
      status_after: "done",
    },
  });
  expect(out.demo.title).toBe("Sam marked install-step as done");
});

test("returns {} when there is no display block", () => {
  expect(renderEventDisplay({ display: null, ctx: {} })).toEqual({});
});
