import { CITY } from "./layout";

// A soundscape that follows the visitor through the city: waves on the quay, the Gate
// Square fountain, gulls over the harbour, birdsong in the park, a murmur in the market,
// a soft organ in the cathedral, drips in the cistern, water in the canal and the bell
// tower now and then. Everything is synthesized, so nothing needs to download.
type Point = { x: number; z: number };
const c = CITY;
const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const near = (p: Point, at: Point, radius: number) => 1 - smooth(radius * 0.35, radius, Math.hypot(p.x - at.x, p.z - at.z));
const inBox = (p: Point, box: { x0: number; x1: number; z0: number; z1: number }, fade = 8) =>
  Math.min(smooth(box.x0 - fade, box.x0, p.x), 1 - smooth(box.x1, box.x1 + fade, p.x), smooth(box.z0 - fade, box.z0, p.z), 1 - smooth(box.z1, box.z1 + fade, p.z));

function noiseBuffer(ctx: AudioContext, seconds = 4, brown = false) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) { last = (last + 0.02 * white) / 1.02; data[i] = last * 3.5; } else data[i] = white;
  }
  return buffer;
}

export class Soundscape {
  private master: GainNode;
  private beds: { gain: GainNode; level: (p: Point) => number; volume: number }[] = [];
  private stoppers: (() => void)[] = [];
  private position: Point = { x: 0, z: 58 };
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  private echo: DelayNode;

  constructor(private ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    // A long, dark echo for the stone interiors (cathedral and cistern).
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.23;
    const feedback = ctx.createGain(), tone = ctx.createBiquadFilter();
    feedback.gain.value = 0.45; tone.type = "lowpass"; tone.frequency.value = 1800;
    this.echo.connect(tone).connect(feedback).connect(this.echo);
    tone.connect(this.master);
    const white = noiseBuffer(ctx), brown = noiseBuffer(ctx, 6, true);

    // Waves: brown noise swelling slowly, strongest on the quay and the mole.
    this.bed(brown, "lowpass", 520, 0.7, 0.12, (p) => Math.max(1 - smooth(4, 70, c.seaEdge - p.z), near(p, { x: 68, z: 85 }, 60)), 0.11);
    // The fountain: bright, fast-flickering water.
    this.bed(white, "bandpass", 2600, 0.8, 0.05, (p) => near(p, c.square.fountain, 22), 0);
    // Canal water through the Old Town.
    this.bed(white, "bandpass", 900, 0.6, 0.035, (p) => inBox(p, { x0: -c.canal.street, x1: c.canal.street, z0: c.canal.z0, z1: c.canal.z1 }, 14), 0);
    // Market murmur: voices at a distance, modulated like conversation.
    this.bed(brown, "bandpass", 480, 1.2, 0.2, (p) => inBox(p, c.market, 14), 0.9);
    // A breeze everywhere outdoors keeps the silence soft.
    this.bed(brown, "lowpass", 260, 0.5, 0.05, () => 1, 0.05);
    // Cathedral organ: a quiet open fifth that swells and fades.
    this.organ((p) => inBox(p, { x0: -c.cathedral.x, x1: c.cathedral.x, z0: c.cathedral.z0, z1: c.cathedral.z1 }, 6));

    this.every(5, 13, () => { const g = this.level((p) => Math.max(1 - smooth(10, 60, c.seaEdge - p.z), near(p, c.lighthouse, 70))); if (g > 0.05) this.gull(g); });
    this.every(1.5, 5, () => {
      const g = this.level((p) => Math.max(inBox(p, c.park, 10), 0.35 * inBox(p, { x0: -c.wallX, x1: c.wallX, z0: c.wallNorth, z1: c.promenade.z0 }, 0)));
      if (g > 0.05) this.chirp(g);
    });
    this.every(2.5, 6, () => { const g = this.level((p) => inBox(p, c.cistern, 3)); if (g > 0.05) this.drip(g); });
    this.every(40, 70, () => {
      const g = this.level((p) => Math.max(near(p, c.bellTower, 160) * 0.8, inBox(p, { x0: -c.cathedralSquare.x, x1: c.cathedralSquare.x, z0: c.cathedralSquare.z0, z1: c.cathedralSquare.z1 }, 20) * 0.6));
      if (g > 0.05) [0, 1.6, 3.2].forEach((delay, i) => this.bell(g * (1 - i * 0.15), delay, i === 1 ? 392 : 329.6));
    });
  }

  private level(fn: (p: Point) => number) { return Math.max(0, Math.min(1, fn(this.position))); }

  private bed(buffer: AudioBuffer, type: BiquadFilterType, frequency: number, q: number, volume: number, level: (p: Point) => number, swell: number) {
    const source = this.ctx.createBufferSource(), filter = this.ctx.createBiquadFilter(), gain = this.ctx.createGain();
    source.buffer = buffer; source.loop = true; source.playbackRate.value = 0.9 + Math.random() * 0.2;
    filter.type = type; filter.frequency.value = frequency; filter.Q.value = q;
    gain.gain.value = 0;
    source.connect(filter);
    let out: AudioNode = filter;
    if (swell) {
      // A slow tremolo gives waves their rhythm and the market its chatter.
      const tremolo = this.ctx.createGain(), lfo = this.ctx.createOscillator(), depth = this.ctx.createGain();
      tremolo.gain.value = 1 - swell / 2; lfo.frequency.value = frequency < 300 ? 0.09 : frequency < 600 ? 0.13 : 2.3; depth.gain.value = swell / 2;
      lfo.connect(depth).connect(tremolo.gain); filter.connect(tremolo); out = tremolo; lfo.start();
      this.stoppers.push(() => lfo.stop());
    }
    out.connect(gain).connect(this.master);
    source.start();
    this.stoppers.push(() => source.stop());
    this.beds.push({ gain, level, volume });
  }

  private organ(level: (p: Point) => number) {
    const gain = this.ctx.createGain(), filter = this.ctx.createBiquadFilter();
    gain.gain.value = 0; filter.type = "lowpass"; filter.frequency.value = 900;
    filter.connect(gain); gain.connect(this.master); gain.connect(this.echo);
    for (const [f, v] of [[110, 0.5], [164.8, 0.35], [220, 0.25], [329.6, 0.08]]) {
      const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
      osc.type = "triangle"; osc.frequency.value = f; g.gain.value = v;
      const lfo = this.ctx.createOscillator(), depth = this.ctx.createGain();
      lfo.frequency.value = 0.05 + f / 10000; depth.gain.value = v * 0.6;
      lfo.connect(depth).connect(g.gain);
      osc.connect(g).connect(filter); osc.start(); lfo.start();
      this.stoppers.push(() => { osc.stop(); lfo.stop(); });
    }
    this.beds.push({ gain, level, volume: 0.035 });
  }

  private every(min: number, max: number, play: () => void) {
    const slot = this.timers.size;
    const schedule = () => {
      this.timers.set(slot, setTimeout(() => { if (this.ctx.state === "running") play(); schedule(); }, (min + Math.random() * (max - min)) * 1000));
    };
    schedule();
  }

  private voice(frequency: number, at: number, length: number, volume: number, type: OscillatorType = "sine", to?: number, target: AudioNode = this.master) {
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(frequency, at);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, at + length);
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.03, length / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
    osc.connect(gain).connect(target);
    osc.start(at); osc.stop(at + length + 0.05);
  }
  private gull(level: number) {
    const now = this.ctx.currentTime, calls = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < calls; i++) this.voice(1500 + Math.random() * 300, now + i * 0.28, 0.24, 0.018 * level, "sawtooth", 1000);
  }
  private chirp(level: number) {
    const now = this.ctx.currentTime, base = 3200 + Math.random() * 1600, notes = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < notes; i++) this.voice(base * (1 + (i % 2) * 0.12), now + i * 0.09, 0.07, 0.012 * level, "sine", base * 1.3);
  }
  private drip(level: number) {
    const now = this.ctx.currentTime, f = 900 + Math.random() * 700;
    this.voice(f, now, 0.12, 0.03 * level, "sine", f * 1.8, this.echo);
    this.voice(f, now, 0.12, 0.02 * level, "sine", f * 1.8);
  }
  private bell(level: number, delay: number, pitch: number) {
    const at = this.ctx.currentTime + delay;
    // A bell's partials: hum, prime, tierce, quint and nominal.
    for (const [ratio, volume, length] of [[0.5, 0.5, 5], [1, 0.8, 4], [1.2, 0.35, 3], [1.5, 0.25, 2.5], [2, 0.3, 2], [2.76, 0.12, 1.2]])
      this.voice(pitch * ratio, at, length, 0.02 * level * volume);
  }

  /** Follow the visitor; beds fade smoothly between places. */
  setPosition(position: Point) {
    this.position = position;
    const now = this.ctx.currentTime;
    for (const bed of this.beds) bed.gain.gain.setTargetAtTime(bed.volume * this.level(bed.level), now, 0.6);
  }
  setVolume(volume: number) { this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.2); }
  dispose() {
    this.timers.forEach((timer) => clearTimeout(timer)); this.timers.clear();
    this.stoppers.forEach((stop) => { try { stop(); } catch { /* already stopped */ } });
    this.master.disconnect();
  }
}
