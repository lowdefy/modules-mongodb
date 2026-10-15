// A short two-tone chirp synthesised with the Web Audio API, so there is no
// audio file to ship. One AudioContext serves every NotificationSound on the
// page. A browser keeps it suspended until the viewer interacts with the page;
// the first pointer or key press resumes it, and a chirp asked for before then
// plays nothing.
let context = null;

function audioContext() {
  if (typeof window === "undefined") return null;
  if (context) return context;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  try {
    context = new AudioContext();
  } catch {
    return null;
  }
  return context;
}

export function unlockAudio() {
  const ctx = audioContext();
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
}

if (typeof window !== "undefined") {
  const unlock = () => {
    unlockAudio();
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
}

const TONES = [
  { frequency: 1318.5, start: 0, length: 0.09 },
  { frequency: 1760, start: 0.11, length: 0.12 },
];

export function playChirp({ volume = 0.15 } = {}) {
  const ctx = audioContext();
  if (!ctx || ctx.state !== "running") return false;
  const at = ctx.currentTime + 0.01;
  TONES.forEach(({ frequency, start, length }) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, at + start);
    gain.gain.setValueAtTime(0.0001, at + start);
    gain.gain.exponentialRampToValueAtTime(volume, at + start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + start + length);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(at + start);
    oscillator.stop(at + start + length + 0.02);
  });
  return true;
}
