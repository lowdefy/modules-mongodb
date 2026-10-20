// The sounds an app offers, as the block's `sounds` property: [{ id, title,
// description?, src? }]. The first is the default, and one without `src` is
// the synthesised chirp.
//
// Sound files are decoded into the chirp's AudioContext rather than played
// through an audio element: the viewer's first click or key press unlocks that
// context once for the page, whereas Safari wants a gesture for each element,
// and a notification arriving over the live feed brings none.
import { audioContext, playChirp } from "./chirp.js";

// The viewer's stored pick, or the first sound when the pick is not offered
// (any more). Null when the app offers no sounds.
export function resolveSound(sounds, id) {
  const list = Array.isArray(sounds) ? sounds : [];
  return list.find((sound) => sound?.id === id) ?? list[0] ?? null;
}

const buffers = new Map();

// Fetches and decodes a sound file once per page. A failed load is forgotten,
// so a later play tries again.
export function loadSound(src) {
  const ctx = audioContext();
  if (!ctx || !src) return Promise.resolve(null);
  if (!buffers.has(src)) {
    const loading = fetch(src)
      .then((response) => {
        if (!response.ok) throw new Error(`${response.status} ${src}`);
        return response.arrayBuffer();
      })
      // The callback form: Safari's prefixed webkitAudioContext has no
      // promise form.
      .then(
        (data) =>
          new Promise((resolve, reject) =>
            ctx.decodeAudioData(data, resolve, reject),
          ),
      )
      .catch(() => {
        buffers.delete(src);
        return null;
      });
    buffers.set(src, loading);
  }
  return buffers.get(src);
}

// Plays a sound, the chirp for one without `src` (or for no sound at all).
// Resolves false when the audio is still locked or the file did not load.
export async function playSound(sound) {
  if (!sound?.src) return playChirp();
  const ctx = audioContext();
  if (!ctx || ctx.state !== "running") return false;
  const buffer = await loadSound(sound.src);
  if (!buffer) return false;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
  return true;
}
