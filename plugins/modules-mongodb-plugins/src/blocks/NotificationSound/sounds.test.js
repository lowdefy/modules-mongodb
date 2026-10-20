import { resolveSound } from "./sounds.js";

const sounds = [
  { id: "chirp", title: "Chirp" },
  { id: "bell", title: "Bell", src: "/sounds/bell.mp3" },
];

test("the viewer's pick is the sound played", () => {
  expect(resolveSound(sounds, "bell")).toBe(sounds[1]);
  expect(resolveSound(sounds, "chirp")).toBe(sounds[0]);
});

test("with no pick, the first sound is played", () => {
  expect(resolveSound(sounds, null)).toBe(sounds[0]);
});

test("a pick the app no longer offers falls back to the first sound", () => {
  expect(resolveSound(sounds, "gong")).toBe(sounds[0]);
});

test("with no sounds offered there is no sound to resolve", () => {
  expect(resolveSound([], "bell")).toBe(null);
  expect(resolveSound(undefined, "bell")).toBe(null);
});
