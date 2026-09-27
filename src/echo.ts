import { shuffle } from "./games";
import { assetUrl, type Exhibit } from "./types";

// Cistern echoes: a word's original recording, played back through a long stone echo.
// Visitors listen and pick the word they heard (or click its painting in the cistern).
export const ECHOES_KEY = "vocabhall.echoes.v1";
export const ECHO_ROUNDS = 3;
export type EchoRound = { answer: Exhibit; choices: Exhibit[] };
let ctx: AudioContext | null = null;
let playing: AudioBufferSourceNode | null = null;
const cache = new Map<string, AudioBuffer>();

function impulse(audio: BaseAudioContext, seconds: number) {
  const b = audio.createBuffer(2, Math.ceil(audio.sampleRate * seconds), audio.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.4);
  }
  return b;
}

/** Play a recording as if called across a flooded stone hall. Resolves when the echo has died away. */
export async function playEcho(url: string): Promise<void> {
  stopEcho();
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  let buffer = cache.get(url);
  if (!buffer) {
    const response = await fetch(assetUrl(url));
    if (!response.ok) throw new Error(String(response.status));
    buffer = await ctx.decodeAudioData(await response.arrayBuffer());
    cache.set(url, buffer);
  }
  const source = ctx.createBufferSource(); source.buffer = buffer;
  const dry = ctx.createGain(); dry.gain.value = 0.55;
  // Slap-back repeats off the far wall, each a little darker, plus a long wash of reverb.
  const delay = ctx.createDelay(1); delay.delayTime.value = 0.38;
  const feedback = ctx.createGain(); feedback.gain.value = 0.48;
  const darken = ctx.createBiquadFilter(); darken.type = "lowpass"; darken.frequency.value = 2400;
  const repeats = ctx.createGain(); repeats.gain.value = 0.7;
  const hall = ctx.createConvolver(); hall.buffer = impulse(ctx, 3.8);
  const wash = ctx.createGain(); wash.gain.value = 0.55;
  source.connect(dry).connect(ctx.destination);
  source.connect(delay); delay.connect(darken).connect(feedback).connect(delay); darken.connect(repeats).connect(ctx.destination);
  source.connect(hall).connect(wash).connect(ctx.destination);
  playing = source;
  source.start();
  await new Promise((resolve) => setTimeout(resolve, (buffer!.duration + 2.2) * 1000));
  if (playing === source) playing = null;
}
export function stopEcho() {
  try { playing?.stop(); } catch { /* already finished */ }
  playing = null;
}

/** Three rounds from the cistern's words, each with four choices. */
export function echoRounds(pool: Exhibit[], checked: string[]): EchoRound[] {
  const unique = pool.filter((e, i) => e.audio && pool.findIndex((o) => o.word.toLowerCase() === e.word.toLowerCase()) === i);
  if (unique.length < 4) return [];
  const targets = [...shuffle(unique.filter((e) => !checked.includes(e.id))), ...shuffle(unique.filter((e) => checked.includes(e.id)))].slice(0, ECHO_ROUNDS);
  return targets.map((answer) => ({ answer, choices: shuffle([answer, ...shuffle(unique.filter((e) => e.id !== answer.id)).slice(0, 3)]) }));
}
export function readEchoes() {
  try { const n = Number(JSON.parse(localStorage.getItem(ECHOES_KEY) || "0")); return Number.isSafeInteger(n) && n > 0 ? n : 0; } catch { return 0; }
}
export function saveEchoes(total: number) { try { localStorage.setItem(ECHOES_KEY, JSON.stringify(total)); } catch { /* Kept for this visit. */ } }
