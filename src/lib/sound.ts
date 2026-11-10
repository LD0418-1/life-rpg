"use client";

// Small game sounds, made on the fly with the Web Audio API (no audio files).
// Short, quiet, and only after you've tapped something (browsers require that).
// Turn them off in the sidebar or Settings.
import { soundEnabled } from "./prefs";

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined" || !soundEnabled()) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null; // no audio on this device
  }
}

/** One note: frequency in Hz, start and length in seconds from now. */
function note(ac: AudioContext, freq: number, start: number, length: number, opts: { type?: OscillatorType; volume?: number; slideTo?: number } = {}) {
  const t = ac.currentTime + start;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = opts.type ?? "square";
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + length);
  const volume = opts.volume ?? 0.05;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + length + 0.02);
}

function play(fn: (ac: AudioContext) => void) {
  const ac = audio();
  if (ac) fn(ac);
}

export const sounds = {
  /** XP gained: a quick rising blip. */
  xp: () => play((ac) => note(ac, 660, 0, 0.09, { slideTo: 990, volume: 0.04 })),
  /** Quest or daily done, reward earned: two coin notes. */
  coin: () =>
    play((ac) => {
      note(ac, 988, 0, 0.07, { volume: 0.04 });
      note(ac, 1319, 0.07, 0.18, { volume: 0.04 });
    }),
  /** Level up: a short rising fanfare. */
  levelUp: () =>
    play((ac) => {
      [523, 659, 784, 1047].forEach((f, i) => note(ac, f, i * 0.09, 0.16, { volume: 0.05 }));
      note(ac, 1047, 0.36, 0.45, { type: "triangle", volume: 0.06 });
    }),
  /** Boss defeated: a heavier fanfare. */
  victory: () =>
    play((ac) => {
      note(ac, 98, 0, 0.35, { type: "sawtooth", volume: 0.05, slideTo: 196 });
      [392, 523, 659, 784, 1047].forEach((f, i) => note(ac, f, 0.12 + i * 0.1, 0.2, { volume: 0.05 }));
      note(ac, 1568, 0.65, 0.6, { type: "triangle", volume: 0.05 });
    }),
  /** Achievement or other banner: a bright chime. */
  chime: () =>
    play((ac) => {
      note(ac, 1175, 0, 0.25, { type: "triangle", volume: 0.05 });
      note(ac, 1760, 0.08, 0.35, { type: "triangle", volume: 0.04 });
    }),
  /** Something went wrong: a low buzz. */
  error: () => play((ac) => note(ac, 180, 0, 0.18, { type: "sawtooth", volume: 0.035, slideTo: 110 })),
};
