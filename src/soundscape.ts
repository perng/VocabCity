import { CITY } from "./layout";

// A soundscape that follows the visitor through the city. Everything is synthesized in the
// browser, but shaped after real recordings: waves that build and break at uneven intervals,
// gusting wind, a splashing fountain, a crowd murmur with the rhythm of speech, birdsong
// phrases, gull calls, a stone hush with footsteps in the cathedral, drips in the cistern,
// distant bells, and crickets after dusk. Sources sit in stereo with a touch of reverb.
type Point = { x: number; z: number };
const c = CITY;
const smooth = (edge0: number, edge1: number, value: number) => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
const near = (p: Point, at: Point, radius: number) => 1 - smooth(radius * 0.35, radius, Math.hypot(p.x - at.x, p.z - at.z));
const inBox = (p: Point, box: { x0: number; x1: number; z0: number; z1: number }, fade = 8) =>
  Math.min(smooth(box.x0 - fade, box.x0, p.x), 1 - smooth(box.x1, box.x1 + fade, p.x), smooth(box.z0 - fade, box.z0, p.z), 1 - smooth(box.z1, box.z1 + fade, p.z));
const rand = (min: number, max: number) => min + Math.random() * (max - min);

const seaLevel = (p: Point) => Math.max(1 - smooth(4, 70, c.seaEdge - p.z), near(p, { x: 68, z: 85 }, 60));
const parkLevel = (p: Point) => inBox(p, c.park, 12);
const gardenLevel = (p: Point) => Math.max(parkLevel(p), 0.45 * inBox(p, { x0: -c.wallX, x1: c.wallX, z0: c.wallNorth, z1: c.promenade.z0 }, 0));
const cathedralLevel = (p: Point) => inBox(p, { x0: -c.cathedral.x, x1: c.cathedral.x, z0: c.cathedral.z0, z1: c.cathedral.z1 }, 6);
const indoorLevel = (p: Point) => Math.max(cathedralLevel(p), inBox(p, c.cistern, 3));

function buffer(ctx: BaseAudioContext, seconds: number, fill: (data: Float32Array, rate: number) => void) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  fill(b.getChannelData(0), ctx.sampleRate);
  return b;
}
const normalize = (data: Float32Array) => { let peak = 0; for (const v of data) peak = Math.max(peak, Math.abs(v)); if (peak) for (let i = 0; i < data.length; i++) data[i] /= peak; };
// Pink noise (Paul Kellet's filter): the even, natural hiss of wind and surf.
const pink = (ctx: BaseAudioContext) => buffer(ctx, 8, (d) => {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < d.length; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
  }
  normalize(d);
});
const brown = (ctx: BaseAudioContext) => buffer(ctx, 8, (d) => {
  let last = 0;
  for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last; }
  normalize(d);
});
// A smooth random curve between 0 and 1, `rate` new values per second: gusts, splashes, syllables.
const wander = (ctx: BaseAudioContext, seconds: number, rate: number) => buffer(ctx, seconds, (d, sr) => {
  const step = Math.max(1, Math.round(sr / rate)); let from = Math.random(), to = Math.random();
  for (let i = 0; i < d.length; i++) {
    const k = i % step; if (k === 0 && i) { from = to; to = Math.random(); }
    d[i] = from + (to - from) * (0.5 - 0.5 * Math.cos((Math.PI * k) / step));
  }
});
// Waves: each one swells for a few seconds, breaks, and drains away before the next.
const surf = (ctx: BaseAudioContext) => buffer(ctx, 120, (d, sr) => {
  let i = 0;
  while (i < d.length) {
    const rise = rand(2.2, 4.2) * sr, fall = rand(2.5, 5) * sr, rest = rand(0.4, 2.5) * sr, peak = rand(0.55, 1);
    for (let k = 0; k < rise && i < d.length; k++, i++) d[i] = peak * Math.pow(Math.sin((Math.PI / 2) * (k / rise)), 2);
    for (let k = 0; k < fall && i < d.length; k++, i++) d[i] = peak * Math.exp(-3.2 * (k / fall));
    for (let k = 0; k < rest && i < d.length; k++, i++) d[i] = peak * Math.exp(-3.2) * (1 - k / rest);
  }
});
// A decaying stereo noise impulse makes a simple reverb.
function impulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const b = ctx.createBuffer(2, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, decay);
  }
  return b;
}

export class Soundscape {
  private master: GainNode;
  private air: GainNode;
  private hall: GainNode;
  private beds: { gain: GainNode; level: (p: Point) => number; volume: number }[] = [];
  private stoppers: (() => void)[] = [];
  private position: Point = { x: 0, z: 58 };
  private timers = new Map<number, ReturnType<typeof setTimeout>>();
  private evening = false;
  private buffers: { pink: AudioBuffer; brown: AudioBuffer };

  constructor(private ctx: BaseAudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    // Two reverbs: a short open-air one for distance, and a long stone one for interiors.
    this.air = this.reverb(1.6, 3, 0.35);
    this.hall = this.reverb(4.2, 2.2, 0.8);
    this.buffers = { pink: pink(ctx), brown: brown(ctx) };

    this.sea();
    this.wind();
    this.fountain();
    this.canal();
    this.crowd();
    this.stoneHush();

    this.every(3, 11, () => { const g = this.level(seaLevel); if (g > 0.08 && !(this.evening && Math.random() < 0.6)) this.gull(g); });
    this.every(0.8, 4, () => { const g = this.level(gardenLevel); if (g > 0.05 && !this.evening) this.birdsong(g); });
    this.every(0.35, 1.1, () => { const g = this.level(gardenLevel); if (g > 0.05 && this.evening) this.cricket(g); });
    this.every(1.5, 5, () => { const g = this.level((p) => inBox(p, c.cistern, 3)); if (g > 0.05) this.drip(g); });
    this.every(2.5, 7, () => { const g = this.level(cathedralLevel); if (g > 0.1) this.footsteps(g); });
    this.every(50, 90, () => {
      const g = this.level((p) => Math.max(near(p, c.bellTower, 170) * 0.8, inBox(p, { x0: -c.cathedralSquare.x, x1: c.cathedralSquare.x, z0: c.cathedralSquare.z0, z1: c.cathedralSquare.z1 }, 25) * 0.6));
      if (g > 0.05) for (let i = 0; i < 3; i++) this.bell(g * (1 - i * 0.12), this.ctx.currentTime + i * 2.1, i === 1 ? 392 : 329.6);
    });
  }

  private reverb(seconds: number, decay: number, wet: number) {
    const input = this.ctx.createGain(), convolver = this.ctx.createConvolver(), out = this.ctx.createGain();
    convolver.buffer = impulse(this.ctx, seconds, decay); out.gain.value = wet;
    input.connect(convolver).connect(out).connect(this.master);
    return input;
  }
  private level(fn: (p: Point) => number) { return Math.max(0, Math.min(1, fn(this.position))); }
  private loop(buffer: AudioBuffer, rate = 1) {
    const source = this.ctx.createBufferSource();
    source.buffer = buffer; source.loop = true; source.playbackRate.value = rate;
    source.start(0, Math.random() * buffer.duration);
    this.stoppers.push(() => source.stop());
    return source;
  }
  /** Drive an AudioParam around `base` with a slow random (or surf-shaped) curve. */
  private modulate(param: AudioParam, base: number, depth: number, curve: AudioBuffer, rate = 1) {
    param.value = base;
    const amount = this.ctx.createGain(); amount.gain.value = depth;
    this.loop(curve, rate).connect(amount).connect(param);
  }
  private filter(type: BiquadFilterType, frequency: number, q = 0.7) {
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = frequency; f.Q.value = q; return f;
  }
  private pan(value: number) { const p = this.ctx.createStereoPanner(); p.pan.value = value; return p; }
  private bed(node: AudioNode, level: (p: Point) => number, volume: number, sends: [GainNode, number][] = []) {
    const gain = this.ctx.createGain(); gain.gain.value = 0;
    node.connect(gain).connect(this.master);
    for (const [bus, amount] of sends) { const send = this.ctx.createGain(); send.gain.value = amount; gain.connect(send).connect(bus); }
    this.beds.push({ gain, level, volume });
  }

  // Surf: a low rumble and a bright wash that rise with each wave, in two slightly offset layers.
  private sea() {
    for (const [side, offset] of [[-0.55, 1], [0.55, 0.93]] as const) {
      const waves = surf(this.ctx);
      const rumble = this.filter("lowpass", 260, 0.5), rumbleGain = this.ctx.createGain();
      this.loop(this.buffers.brown, offset).connect(rumble).connect(rumbleGain);
      this.modulate(rumbleGain.gain, 0.25, 0.75, waves, offset);
      this.modulate(rumble.frequency, 220, 380, waves, offset);
      const wash = this.filter("bandpass", 1500, 0.45), washGain = this.ctx.createGain(), hiss = this.filter("highpass", 500);
      const top = this.filter("lowpass", 5000, 0.5);
      this.loop(this.buffers.pink, offset).connect(hiss).connect(wash).connect(top).connect(washGain);
      this.modulate(washGain.gain, 0.02, 0.55, waves, offset * 1.0004);
      const mix = this.ctx.createGain(), panner = this.pan(side);
      rumbleGain.connect(mix); washGain.connect(mix); mix.connect(panner);
      this.bed(panner, seaLevel, 0.19, [[this.air, 0.3]]);
    }
  }
  // Wind: a band of noise whose pitch and strength wander in gusts; always softly present outdoors.
  private wind() {
    const band = this.filter("bandpass", 420, 1.1), gain = this.ctx.createGain(), panner = this.pan(0);
    this.loop(this.buffers.pink).connect(band).connect(gain).connect(panner);
    this.modulate(band.frequency, 260, 520, wander(this.ctx, 40, 0.35));
    this.modulate(gain.gain, 0.2, 0.8, wander(this.ctx, 40, 0.25));
    this.modulate(panner.pan, -0.5, 1, wander(this.ctx, 40, 0.1));
    this.bed(panner, (p) => 1 - 0.8 * indoorLevel(p), 0.05);
  }
  // Fountain: falling water is broadband hiss with fast, uneven splashes.
  private fountain() {
    const high = this.filter("highpass", 700), tone = this.filter("peaking", 3200, 0.8), splash = this.ctx.createGain();
    tone.gain.value = 5;
    // Real falling water has little above 8 kHz; without this roll-off it sounds like static.
    const soft = this.filter("lowpass", 6500, 0.5);
    this.loop(this.buffers.pink).connect(high).connect(tone).connect(soft).connect(splash);
    this.modulate(splash.gain, 0.55, 0.45, wander(this.ctx, 12, 18));
    const body = this.filter("lowpass", 600), bodyGain = this.ctx.createGain(); bodyGain.gain.value = 0.5;
    this.loop(this.buffers.brown, 1.3).connect(body).connect(bodyGain);
    const mix = this.ctx.createGain(); splash.connect(mix); bodyGain.connect(mix);
    this.bed(mix, (p) => near(p, c.square.fountain, 24), 0.1, [[this.air, 0.25]]);
  }
  // Canal: slow lapping against stone.
  private canal() {
    const band = this.filter("bandpass", 480, 0.9), gain = this.ctx.createGain();
    this.loop(this.buffers.brown, 1.6).connect(band).connect(gain);
    this.modulate(gain.gain, 0.15, 0.85, wander(this.ctx, 30, 1.4));
    this.bed(gain, (p) => inBox(p, { x0: -c.canal.street, x1: c.canal.street, z0: c.canal.z0, z1: c.canal.z1 }, 14), 0.06, [[this.air, 0.3]]);
  }
  // Market: several voices, each a band of noise with speech's syllable rhythm, spread across the square.
  private crowd() {
    const mix = this.ctx.createGain();
    [[320, -0.7], [650, 0.4], [1100, -0.2], [1900, 0.7], [520, 0.1], [900, -0.5]].forEach(([frequency, side]) => {
      const band = this.filter("bandpass", frequency, 2.2), voice = this.ctx.createGain(), panner = this.pan(side);
      this.loop(this.buffers.pink, rand(0.9, 1.1)).connect(band).connect(voice).connect(panner).connect(mix);
      this.modulate(voice.gain, 0, 1, wander(this.ctx, 20, rand(3.5, 6)));
    });
    const tone = this.filter("lowpass", 2600);
    mix.connect(tone);
    this.bed(tone, (p) => inBox(p, c.market, 16), 0.22, [[this.air, 0.5]]);
  }
  // Cathedral and cistern: the soft, low hush of a large stone room.
  private stoneHush() {
    const low = this.filter("lowpass", 320), gain = this.ctx.createGain();
    this.loop(this.buffers.brown, 0.8).connect(low).connect(gain);
    this.modulate(gain.gain, 0.6, 0.4, wander(this.ctx, 30, 0.2));
    this.bed(gain, indoorLevel, 0.09, [[this.hall, 0.6]]);
  }

  private every(min: number, max: number, play: () => void) {
    const slot = this.timers.size;
    const schedule = () => {
      this.timers.set(slot, setTimeout(() => { if (this.ctx.state === "running") play(); schedule(); }, rand(min, max) * 1000));
    };
    schedule();
  }
  /** One pitched note with a frequency contour, a quick envelope, a place in stereo and some distance. */
  private note(at: number, length: number, volume: number, contour: number[], options: { type?: OscillatorType; pan?: number; air?: number; bus?: GainNode; vibrato?: number; band?: number } = {}) {
    const osc = this.ctx.createOscillator(), gain = this.ctx.createGain(), panner = this.pan(options.pan ?? rand(-0.8, 0.8));
    osc.type = options.type ?? "sine";
    osc.frequency.setValueCurveAtTime(Float32Array.from(contour), at, length);
    if (options.vibrato) {
      const lfo = this.ctx.createOscillator(), depth = this.ctx.createGain();
      lfo.frequency.value = rand(25, 40); depth.gain.value = options.vibrato;
      lfo.connect(depth).connect(osc.frequency); lfo.start(at); lfo.stop(at + length + 0.05);
    }
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(volume, at + Math.min(0.012, length / 4));
    gain.gain.setTargetAtTime(0.0001, at + length * 0.55, length / 5);
    let out: AudioNode = gain;
    if (options.band) { const band = this.filter("bandpass", options.band, 1.4); gain.connect(band); out = band; }
    out.connect(panner).connect(this.master);
    const send = this.ctx.createGain(); send.gain.value = options.air ?? 0.4; panner.connect(send).connect(options.bus ?? this.air);
    osc.connect(gain);
    osc.start(at); osc.stop(at + length * 1.6 + 0.1);
  }

  // A songbird phrase: one of a few patterns, sung by a bird somewhere to the left or right.
  birdsong(level: number, at = this.ctx.currentTime) {
    const pan = rand(-0.9, 0.9), base = rand(2800, 4600), v = 0.045 * level;
    const kind = Math.floor(Math.random() * 3);
    if (kind === 0) { // A clear whistled phrase of rising and falling notes.
      let t = at;
      for (let i = 0, n = 3 + Math.floor(Math.random() * 4); i < n; i++) {
        const f = base * rand(0.8, 1.25), len = rand(0.07, 0.16);
        this.note(t, len, v, [f * 0.9, f * 1.15, f], { pan, vibrato: f * 0.02 }); t += len + rand(0.03, 0.09);
      }
    } else if (kind === 1) { // "tee-cher tee-cher": two-note calls.
      for (let i = 0, n = 2 + Math.floor(Math.random() * 3); i < n; i++) {
        const t = at + i * 0.34;
        this.note(t, 0.12, v, [base * 1.2, base * 1.25], { pan }); this.note(t + 0.15, 0.13, v * 0.9, [base * 0.95, base * 0.8], { pan });
      }
    } else { // A fast trill.
      for (let i = 0, n = 10 + Math.floor(Math.random() * 12); i < n; i++) {
        const f = base * (1.1 - i * 0.008);
        this.note(at + i * 0.045, 0.03, v * 0.8, [f * 1.1, f * 0.9], { pan });
      }
    }
  }
  // A herring gull's "kyow", repeated a few times as it passes.
  gull(level: number, at = this.ctx.currentTime) {
    const pan = rand(-0.8, 0.8), start = rand(1150, 1400), calls = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < calls; i++) {
      const f = start * (1 - i * 0.04), t = at + i * rand(0.32, 0.45);
      this.note(t, 0.34, 0.03 * level, [f * 0.72, f, f * 1.05, f * 0.9, f * 0.7], { type: "triangle", pan, band: f * 1.2, vibrato: 18, air: 0.7 });
    }
  }
  // Field crickets: short bursts of three pulses at a high, steady pitch.
  cricket(level: number, at = this.ctx.currentTime) {
    const pan = rand(-0.9, 0.9), f = rand(4300, 4900);
    for (let chirp = 0, n = 2 + Math.floor(Math.random() * 3); chirp < n; chirp++)
      for (let p = 0; p < 3; p++) this.note(at + chirp * 0.26 + p * 0.03, 0.018, 0.028 * level, [f, f], { pan, air: 0.2 });
  }
  drip(level: number, at = this.ctx.currentTime) {
    const f = rand(900, 1700);
    this.note(at, 0.09, 0.05 * level, [f, f * 1.9], { pan: rand(-0.6, 0.6), bus: this.hall, air: 1 });
  }
  // Slow footsteps on stone, somewhere across the nave.
  footsteps(level: number, at = this.ctx.currentTime) {
    const pan = rand(-0.7, 0.7);
    for (let i = 0, n = 3 + Math.floor(Math.random() * 4); i < n; i++) {
      const t = at + i * rand(0.55, 0.7);
      const src = this.ctx.createBufferSource(), band = this.filter("bandpass", rand(700, 1100), 1.2), gain = this.ctx.createGain(), panner = this.pan(pan);
      src.buffer = this.buffers.pink;
      gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.09 * level, t + 0.005); gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      src.connect(band).connect(gain).connect(panner).connect(this.master);
      const send = this.ctx.createGain(); send.gain.value = 1.2; panner.connect(send).connect(this.hall);
      src.start(t, Math.random() * 6, 0.12);
    }
  }
  // A church bell's inharmonic partials, ringing out over the rooftops.
  bell(level: number, at: number, pitch: number) {
    for (const [ratio, volume, length] of [[0.5, 0.5, 9], [1, 0.8, 7], [1.19, 0.4, 5], [1.5, 0.28, 4], [2, 0.3, 3.5], [2.51, 0.14, 2.4], [2.66, 0.1, 2]])
      this.note(at, length, 0.018 * level * volume, [pitch * ratio, pitch * ratio * 0.999], { pan: 0.2, air: 0.9 });
  }

  /** Follow the visitor; each layer fades smoothly between places. */
  setPosition(position: Point) {
    this.position = position;
    const now = this.ctx.currentTime;
    for (const bed of this.beds) bed.gain.gain.setTargetAtTime(bed.volume * this.level(bed.level), now, 0.8);
  }
  /** After dusk the birds go quiet, the gulls roost and the crickets start. */
  setEvening(evening: boolean) { this.evening = evening; }
  setVolume(volume: number) { this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.2); }
  dispose() {
    this.timers.forEach((timer) => clearTimeout(timer)); this.timers.clear();
    this.stoppers.forEach((stop) => { try { stop(); } catch { /* already stopped */ } });
    this.master.disconnect();
  }
}
