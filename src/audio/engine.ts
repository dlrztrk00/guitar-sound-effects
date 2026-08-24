// The whole pedal, in Web Audio nodes.
//
// signal path:
//   guitar (interface) → splitter → inputGain ─┬─ dryGain (clean bypass) ──────┐
//                                              │                               │
//                              taps: input/tuner analysers                     │
//                                              │                               │
//   inputGain → gateGain → [ pedal chain, reorderable ] → EQ(low/mid/high)     │
//                            comp · drive · chorus · delay      → cab → wetGain │
//                                                                              │
//   wet + dry → master → limiter → analyser → speakers                        │
//                     └→ reverb send (off wet)  ────────────────────────────────┘
//
// The four pedals are discrete blocks (each with an `in` and `out` node) wired
// in series in `pedalOrder`; reordering just rewires that series.

export type EqBand = "low" | "mid" | "high";
export type DistType = "soft" | "hard" | "fuzz";
export type PedalId = "comp" | "drive" | "chorus" | "delay";

type Block = { in: AudioNode; out: AudioNode };

// Build a simple reverb impulse: decaying noise. Stereo for a bit of width.
function makeReverbIR(
  ctx: BaseAudioContext,
  seconds: number,
  decay: number
): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

// Distortion curve. soft = round tanh clip, hard = square-ish clip,
// fuzz = asymmetric high-gain (adds buzzy even harmonics).
function makeDistortionCurve(
  drive: number,
  type: DistType
): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT));
  const k = 1 + drive * 40;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    let y: number;
    if (type === "hard") {
      const g = 1 + drive * 30;
      y = Math.max(-1, Math.min(1, g * x));
    } else if (type === "fuzz") {
      const gp = 1 + drive * 90;
      const gn = 1 + drive * 45;
      y = x >= 0 ? Math.tanh(gp * x) : Math.tanh(gn * x);
    } else {
      y = Math.tanh(k * x) / Math.tanh(k);
    }
    curve[i] = y;
  }
  return curve;
}

// A straight passthrough curve — used when the drive pedal is switched off.
function makeLinearCurve(): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT));
  for (let i = 0; i < n; i++) curve[i] = (i * 2) / n - 1;
  return curve;
}

export class PedalEngine {
  ctx: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private splitter?: ChannelSplitterNode;

  private inputGain: GainNode;
  private inputChannel: 0 | 1 = 0;
  private deviceId?: string;

  // noise gate — a native GainNode driven by an analyser (adds no latency)
  private gateGain: GainNode;
  private gateThreshold = 0; // linear amplitude; 0 = open (off)
  private gateBuf = new Float32Array(1024);

  // ── pedal block: COMP ──
  private comp: DynamicsCompressorNode;
  private compMakeup: GainNode;

  // ── pedal block: DRIVE ──
  private shaper: WaveShaperNode;

  // ── pedal block: CHORUS (in → dry+wet → out) ──
  private chorusIn: GainNode;
  private chorusOut: GainNode;
  private chorusDelay: DelayNode;
  private chorusLFO: OscillatorNode;
  private chorusDepth: GainNode;
  private chorusWet: GainNode;

  // ── pedal block: DELAY (in → dry+wet → out) ──
  private delayIn: GainNode;
  private delayOut: GainNode;
  private delay: DelayNode;
  private delayFeedback: GainNode;
  private delayWet: GainNode;

  // amp side
  private eq: Record<EqBand, BiquadFilterNode>;
  private reverb: ConvolverNode;
  private reverbGain: GainNode;
  private cabHP: BiquadFilterNode;
  private cabLP: BiquadFilterNode;
  private cabDip: BiquadFilterNode;
  private cabWet: GainNode;
  private cabDry: GainNode;
  private cabOut: GainNode;

  private wetGain: GainNode;
  private dryGain: GainNode;
  private master: GainNode;
  private limiter: DynamicsCompressorNode;
  private recNode: ScriptProcessorNode;
  private recSilent: GainNode;
  private capturing = false;
  private recChunks: Float32Array[] = [];

  // looper
  private loopGain: GainNode;
  private loopSource?: AudioBufferSourceNode;

  analyser: AnalyserNode; // output spectrum
  inputAnalyser: AnalyserNode; // input level meter
  tunerAnalyser: AnalyserNode; // larger window for pitch detection

  private drive = 0.5;
  private distType: DistType = "soft";
  bypassed = false;

  // per-pedal on/off + stored amounts
  private compVal = 0;
  private compOn = true;
  private driveOn = true;
  private chorusVal = 0;
  private chorusOn = true;
  private delayVal = 0;
  private delayOn = true;

  // the order the four pedals are wired in (front of the board → amp)
  private pedalOrder: PedalId[] = ["comp", "drive", "chorus", "delay"];
  private blocks!: Record<PedalId, Block>;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });

    this.inputGain = this.ctx.createGain();

    // input level tap (doesn't alter the signal)
    this.inputAnalyser = this.ctx.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputAnalyser.smoothingTimeConstant = 0.3;
    this.inputGain.connect(this.inputAnalyser);

    // a larger, un-smoothed window for the tuner's pitch detection
    this.tunerAnalyser = this.ctx.createAnalyser();
    this.tunerAnalyser.fftSize = 2048;
    this.inputGain.connect(this.tunerAnalyser);

    // ── COMP block ──
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = 0;
    this.comp.ratio.value = 1;
    this.comp.knee.value = 6;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.25;
    this.compMakeup = this.ctx.createGain();
    this.compMakeup.gain.value = 1;
    this.comp.connect(this.compMakeup);

    // ── DRIVE block ──
    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = makeDistortionCurve(this.drive, this.distType);
    this.shaper.oversample = "4x";

    // ── CHORUS block: in → out (dry) and in → modDelay → wet → out ──
    this.chorusIn = this.ctx.createGain();
    this.chorusOut = this.ctx.createGain();
    this.chorusDelay = this.ctx.createDelay(0.05);
    this.chorusDelay.delayTime.value = 0.025;
    this.chorusLFO = this.ctx.createOscillator();
    this.chorusLFO.frequency.value = 0.8;
    this.chorusDepth = this.ctx.createGain();
    this.chorusDepth.gain.value = 0.003;
    this.chorusWet = this.ctx.createGain();
    this.chorusWet.gain.value = 0; // off by default
    this.chorusLFO.connect(this.chorusDepth);
    this.chorusDepth.connect(this.chorusDelay.delayTime);
    this.chorusLFO.start();
    this.chorusIn.connect(this.chorusOut); // dry
    this.chorusIn.connect(this.chorusDelay);
    this.chorusDelay.connect(this.chorusWet);
    this.chorusWet.connect(this.chorusOut);

    // ── DELAY block: in → out (dry) and in → delay(↺) → wet → out ──
    this.delayIn = this.ctx.createGain();
    this.delayOut = this.ctx.createGain();
    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.3;
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = 0.35;
    this.delayWet = this.ctx.createGain();
    this.delayWet.gain.value = 0; // off by default
    this.delayIn.connect(this.delayOut); // dry
    this.delayIn.connect(this.delay);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayWet);
    this.delayWet.connect(this.delayOut);

    this.blocks = {
      comp: { in: this.comp, out: this.compMakeup },
      drive: { in: this.shaper, out: this.shaper },
      chorus: { in: this.chorusIn, out: this.chorusOut },
      delay: { in: this.delayIn, out: this.delayOut },
    };

    // ── amp: 3-band EQ ──
    const low = this.ctx.createBiquadFilter();
    low.type = "lowshelf";
    low.frequency.value = 200;
    const mid = this.ctx.createBiquadFilter();
    mid.type = "peaking";
    mid.frequency.value = 1000;
    mid.Q.value = 1;
    const high = this.ctx.createBiquadFilter();
    high.type = "highshelf";
    high.frequency.value = 3500;
    this.eq = { low, mid, high };

    // ── amp: reverb send ──
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = makeReverbIR(this.ctx, 2.4, 3.0);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0;

    // ── amp: cabinet / speaker sim (switchable) ──
    this.cabHP = this.ctx.createBiquadFilter();
    this.cabHP.type = "highpass";
    this.cabHP.frequency.value = 85;
    this.cabLP = this.ctx.createBiquadFilter();
    this.cabLP.type = "lowpass";
    this.cabLP.frequency.value = 4500;
    this.cabDip = this.ctx.createBiquadFilter();
    this.cabDip.type = "peaking";
    this.cabDip.frequency.value = 2800;
    this.cabDip.Q.value = 1.5;
    this.cabDip.gain.value = -4;
    this.cabWet = this.ctx.createGain();
    this.cabWet.gain.value = 0;
    this.cabDry = this.ctx.createGain();
    this.cabDry.gain.value = 1;
    this.cabOut = this.ctx.createGain();

    // ── mix / bypass / output ──
    this.wetGain = this.ctx.createGain();
    this.dryGain = this.ctx.createGain();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    this.recNode = this.ctx.createScriptProcessor(4096, 1, 1);
    this.recSilent = this.ctx.createGain();
    this.recSilent.gain.value = 0;
    this.recNode.onaudioprocess = (e) => {
      if (!this.capturing) return;
      this.recChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    // noise gate: a native GainNode opened/closed by watching the input level
    this.gateGain = this.ctx.createGain();
    this.gateGain.gain.value = 1;
    const gateTick = () => {
      requestAnimationFrame(gateTick);
      const now = this.ctx.currentTime;
      const thr = this.gateThreshold;
      if (thr <= 0) {
        this.gateGain.gain.setTargetAtTime(1, now, 0.01);
        return;
      }
      this.inputAnalyser.getFloatTimeDomainData(this.gateBuf);
      let peak = 0;
      for (let i = 0; i < this.gateBuf.length; i++) {
        const a = Math.abs(this.gateBuf[i]);
        if (a > peak) peak = a;
      }
      const open = peak > thr;
      this.gateGain.gain.setTargetAtTime(open ? 1 : 0, now, open ? 0.005 : 0.06);
    };
    gateTick();

    // permanent wiring (input source attaches later, in openStream)
    this.inputGain.connect(this.gateGain);
    this.inputGain.connect(this.dryGain); // clean bypass path

    // amp: EQ → cab → wet
    low.connect(mid);
    mid.connect(high);
    high.connect(this.cabHP);
    this.cabHP.connect(this.cabLP);
    this.cabLP.connect(this.cabDip);
    this.cabDip.connect(this.cabWet);
    this.cabWet.connect(this.cabOut);
    high.connect(this.cabDry);
    this.cabDry.connect(this.cabOut);
    this.cabOut.connect(this.wetGain);

    this.wetGain.connect(this.master);
    this.dryGain.connect(this.master);

    // reverb send off the wet signal
    this.wetGain.connect(this.reverb);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.master.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    // looper
    this.loopGain = this.ctx.createGain();
    this.loopGain.gain.value = 0.85;
    this.loopGain.connect(this.master);

    // wire the pedal chain (gate → pedals → EQ) in the default order
    this.rewireChain();

    this.setBypass(false);
  }

  /** Rewire the four pedal blocks in series according to `pedalOrder`. */
  private rewireChain(): void {
    // tear down the chain's external links
    this.gateGain.disconnect();
    for (const id of ["comp", "drive", "chorus", "delay"] as PedalId[]) {
      this.blocks[id].out.disconnect();
    }
    // reconnect: gate → b0 → b1 → … → EQ.low
    let prev: AudioNode = this.gateGain;
    for (const id of this.pedalOrder) {
      const b = this.blocks[id];
      prev.connect(b.in);
      prev = b.out;
    }
    prev.connect(this.eq.low);
  }

  /** Set the pedal chain order, e.g. ["drive","comp","delay","chorus"]. */
  setPedalOrder(order: PedalId[]): void {
    // keep only known ids, and make sure all four are present
    const seen = new Set<PedalId>();
    const next: PedalId[] = [];
    for (const id of order) {
      if (this.blocks[id] && !seen.has(id)) {
        seen.add(id);
        next.push(id);
      }
    }
    for (const id of ["comp", "drive", "chorus", "delay"] as PedalId[]) {
      if (!seen.has(id)) next.push(id);
    }
    this.pedalOrder = next;
    this.rewireChain();
  }

  getPedalOrder(): PedalId[] {
    return [...this.pedalOrder];
  }

  /** (Re)open the mic/interface stream and wire it into the graph. */
  private async openStream(): Promise<void> {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.splitter?.disconnect();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : {}),
      },
      video: false,
    });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.splitter = this.ctx.createChannelSplitter(2);
    this.source.connect(this.splitter);
    this.splitter.connect(this.inputGain, this.inputChannel, 0);
  }

  async start(): Promise<void> {
    if (!this.source) await this.openStream();
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  async stop(): Promise<void> {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.splitter?.disconnect();
    this.stream = undefined;
    this.source = undefined;
    this.splitter = undefined;
    await this.ctx.suspend();
  }

  async listInputs(): Promise<MediaDeviceInfo[]> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === "audioinput");
  }

  async setDevice(id: string): Promise<void> {
    this.deviceId = id || undefined;
    if (this.source) await this.openStream();
  }

  setInput(ch: 0 | 1): void {
    this.inputChannel = ch;
    if (this.splitter) {
      this.splitter.disconnect(this.inputGain);
      this.splitter.connect(this.inputGain, ch, 0);
    }
  }

  get input(): 0 | 1 {
    return this.inputChannel;
  }

  setDistType(type: DistType): void {
    this.distType = type;
    this.updateShaper();
  }

  setDrive(v: number): void {
    this.drive = Math.max(0, Math.min(1, v));
    this.updateShaper();
  }

  private updateShaper(): void {
    this.shaper.curve = this.driveOn
      ? makeDistortionCurve(this.drive, this.distType)
      : makeLinearCurve();
  }

  /** DRIVE pedal footswitch — off = clean passthrough. */
  setDriveEnabled(on: boolean): void {
    this.driveOn = on;
    this.updateShaper();
  }

  setEq(band: EqBand, db: number): void {
    this.eq[band].gain.value = db;
  }

  /** Delay wet amount 0..1. */
  setDelayMix(v: number): void {
    this.delayVal = Math.max(0, Math.min(1, v));
    this.delayWet.gain.value = this.delayOn ? this.delayVal : 0;
  }
  setDelayEnabled(on: boolean): void {
    this.delayOn = on;
    this.delayWet.gain.value = on ? this.delayVal : 0;
  }
  setDelayTime(s: number): void {
    this.delay.delayTime.value = Math.max(0, Math.min(1, s));
  }
  setDelayFeedback(v: number): void {
    this.delayFeedback.gain.value = Math.max(0, Math.min(0.9, v));
  }

  setBypass(on: boolean): void {
    this.bypassed = on;
    const t = this.ctx.currentTime;
    this.wetGain.gain.setTargetAtTime(on ? 0 : 1, t, 0.01);
    this.dryGain.gain.setTargetAtTime(on ? 1 : 0, t, 0.01);
  }

  setLevel(v: number): void {
    this.master.gain.value = Math.max(0, Math.min(1.4, v));
  }

  setReverbMix(v: number): void {
    this.reverbGain.gain.value = Math.max(0, Math.min(1, v));
  }

  setGate(v: number): void {
    const x = Math.max(0, Math.min(1, v));
    this.gateThreshold = x * x * 0.12;
  }

  /** Chorus wet amount, 0..1. */
  setChorus(v: number): void {
    this.chorusVal = Math.max(0, Math.min(1, v));
    this.chorusWet.gain.value = this.chorusOn ? this.chorusVal : 0;
  }
  setChorusEnabled(on: boolean): void {
    this.chorusOn = on;
    this.chorusWet.gain.value = on ? this.chorusVal : 0;
  }

  /** Compressor amount, 0..1 (0 = transparent). */
  setComp(v: number): void {
    this.compVal = Math.max(0, Math.min(1, v));
    this.applyComp();
  }
  setCompEnabled(on: boolean): void {
    this.compOn = on;
    this.applyComp();
  }
  private applyComp(): void {
    const x = this.compOn ? this.compVal : 0;
    const t = this.ctx.currentTime;
    this.comp.threshold.setTargetAtTime(-40 * x, t, 0.01);
    this.comp.ratio.setTargetAtTime(1 + 11 * x, t, 0.01);
    this.compMakeup.gain.setTargetAtTime(1 + 1.5 * x, t, 0.01);
  }

  setCab(on: boolean): void {
    const t = this.ctx.currentTime;
    this.cabWet.gain.setTargetAtTime(on ? 1 : 0, t, 0.01);
    this.cabDry.gain.setTargetAtTime(on ? 0 : 1, t, 0.01);
  }

  startCapture(): void {
    this.recChunks = [];
    this.capturing = true;
    this.limiter.connect(this.recNode);
    this.recNode.connect(this.recSilent);
    this.recSilent.connect(this.ctx.destination);
  }

  stopCapture(): { chunks: Float32Array[]; sampleRate: number } {
    this.capturing = false;
    try {
      this.limiter.disconnect(this.recNode);
      this.recNode.disconnect();
      this.recSilent.disconnect();
    } catch {
      /* already disconnected */
    }
    const chunks = this.recChunks;
    this.recChunks = [];
    return { chunks, sampleRate: this.ctx.sampleRate };
  }

  startLoop(): void {
    this.startCapture();
  }

  finishLoop(): void {
    const { chunks, sampleRate } = this.stopCapture();
    this.stopLoop();
    const total = chunks.reduce((n, c) => n + c.length, 0);
    if (!total) return;
    const buf = this.ctx.createBuffer(1, total, sampleRate);
    const d = buf.getChannelData(0);
    let off = 0;
    for (const c of chunks) {
      d.set(c, off);
      off += c.length;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(this.loopGain);
    src.start();
    this.loopSource = src;
  }

  stopLoop(): void {
    try {
      this.loopSource?.stop();
    } catch {
      /* not started */
    }
    this.loopSource?.disconnect();
    this.loopSource = undefined;
  }

  get running(): boolean {
    return !!this.source && this.ctx.state === "running";
  }
}
