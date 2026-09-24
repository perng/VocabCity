import { useSyncExternalStore } from "react";

// Short synthesized cues give every discovery, answer and stamp a little voice of its own.
// They are generated with Web Audio, so there are no files to load, and they stay quiet
// enough to sit under the original word recordings.
export type Cue = "discover" | "correct" | "wrong" | "learned" | "stamp" | "complete" | "tap";
const KEY = "vocabhall.sfx.v1";
let ctx: AudioContext | null = null;
let enabled = (() => {
  try { return localStorage.getItem(KEY) !== "off"; } catch { return true; }
})();
const listeners = new Set<() => void>();

export function sfxEnabled() { return enabled; }
export function setSfxEnabled(value: boolean) {
  enabled = value;
  try { localStorage.setItem(KEY, value ? "on" : "off"); } catch { /* The choice lasts for this visit. */ }
  listeners.forEach((listener) => listener());
}
export function useSfxEnabled() {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    sfxEnabled,
  );
}

function context() {
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(audio: AudioContext, frequency: number, start: number, length: number, volume: number,
  type: OscillatorType = "sine", glideTo?: number) {
  const oscillator = audio.createOscillator(), gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (glideTo) oscillator.frequency.exponentialRampToValueAtTime(glideTo, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(start);
  oscillator.stop(start + length + 0.05);
}

function thump(audio: AudioContext, start: number) {
  const length = 0.16, buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * length), audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  const noise = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
  noise.buffer = buffer; filter.type = "lowpass"; filter.frequency.value = 900; gain.gain.value = 0.22;
  noise.connect(filter).connect(gain).connect(audio.destination);
  noise.start(start);
  tone(audio, 110, start, 0.18, 0.12, "sine", 70);
}

export function playSfx(cue: Cue) {
  if (!enabled) return;
  try {
    const audio = context();
    if (!audio) return;
    const now = audio.currentTime + 0.01;
    switch (cue) {
      case "tap": tone(audio, 1560, now, 0.05, 0.025, "triangle"); break;
      case "discover":
        tone(audio, 1318.5, now, 0.55, 0.03);
        tone(audio, 1975.5, now + 0.07, 0.5, 0.018);
        break;
      case "correct":
        tone(audio, 783.99, now, 0.16, 0.05, "triangle");
        tone(audio, 1174.66, now + 0.1, 0.3, 0.05, "triangle");
        break;
      case "wrong": tone(audio, 246.94, now, 0.22, 0.045, "sine", 196); break;
      case "learned":
        [1046.5, 1318.5, 1568, 2093].forEach((f, i) => tone(audio, f, now + i * 0.055, 0.35, 0.03));
        break;
      case "stamp":
        thump(audio, now);
        tone(audio, 1568, now + 0.16, 0.4, 0.025);
        break;
      case "complete":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(audio, f, now + i * 0.09, 0.7 - i * 0.05, 0.045, "triangle"));
        tone(audio, 1318.5, now + 0.4, 0.8, 0.025);
        break;
    }
  } catch {
    /* Sound effects are decoration; the visit continues silently. */
  }
}
