// The whole pedal, in Web Audio nodes.
//
// signal path:
//   guitar (interface) → splitter (pick CH) → inputGain ─┬─ dry ─────────────┐
//                                                        │                   │
//                                    inputAnalyser (tap) ┘                   │
//                                                                            │
//   inputGain → shaper (distortion) → low → mid → high ─┬─────────→ wetGain ─┤
//                                                        └→ delay ↺ → wetGain │
//                                                                            │
//   wet + dry → master → limiter → analyser → speakers                       │
//                                └→ recorder tap (download)  ─────────────────┘
//
// bypass = wetGain off / dryGain on.

export type EqBand = "low" | "mid" | "high";

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

export type DistType = "soft" | "hard" | "fuzz";

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

  private shaper: WaveShaperNode;
  private eq: Record<EqBand, BiquadFilterNode>;

  // delay send
  private delay: DelayNode;
  private delayFeedback: GainNode;
  private delayMix: GainNode;

  // reverb send
  private reverb: ConvolverNode;
  private reverbGain: GainNode;

  // cabinet / speaker sim (switchable)
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

  analyser: AnalyserNode; // output spectrum
  inputAnalyser: AnalyserNode; // input level meter
  tunerAnalyser: AnalyserNode; // larger window for pitch detection

  private drive = 0.5;
  private distType: DistType = "soft";
  bypassed = false;

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

    // --- distortion ---
    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = makeDistortionCurve(this.drive, this.distType);
    this.shaper.oversample = "4x";

    // --- 3-band EQ ---
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

    // --- delay send (echo) ---
    this.delay = this.ctx.createDelay(1.0);
    this.delay.delayTime.value = 0.3;
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = 0.35;
    this.delayMix = this.ctx.createGain();
    this.delayMix.gain.value = 0; // off by default

    // --- reverb send ---
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = makeReverbIR(this.ctx, 2.4, 3.0);
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0; // off by default

    // --- cabinet / speaker sim (switchable) ---
    // rolls off fizzy highs and boomy lows like a real guitar speaker
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
    this.cabDip.gain.value = -4; // tame harsh presence
    this.cabWet = this.ctx.createGain();
    this.cabWet.gain.value = 0; // cab off by default
    this.cabDry = this.ctx.createGain();
    this.cabDry.gain.value = 1;
    this.cabOut = this.ctx.createGain();

    // --- mix / bypass / output ---
    this.wetGain = this.ctx.createGain();
    this.dryGain = this.ctx.createGain();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    // a limiter on the output so stacked drive + EQ can't nasty-clip
    this.limiter = this.ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.25;

    // output spectrum tap
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // recording tap: pull raw PCM off the output so we can encode MP3
    this.recNode = this.ctx.createScriptProcessor(4096, 1, 1);
    this.recSilent = this.ctx.createGain();
    this.recSilent.gain.value = 0;
    this.recNode.onaudioprocess = (e) => {
      if (!this.capturing) return;
      this.recChunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };

    // noise gate: a native GainNode opened/closed by watching the input level
    // (no ScriptProcessor in the signal path, so it adds no latency)
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
      // open fast, close a little slower to avoid chatter
      this.gateGain.gain.setTargetAtTime(open ? 1 : 0, now, open ? 0.005 : 0.06);
    };
    gateTick();

    // permanent wiring (input source gets attached later, in openStream)
    this.inputGain.connect(this.gateGain);
    this.gateGain.connect(this.shaper);
    this.gateGain.connect(this.dryGain);

    this.shaper.connect(low);
    low.connect(mid);
    mid.connect(high);

    // cabinet block: high → [wet: HP→LP→dip] / [dry] → cabOut
    high.connect(this.cabHP);
    this.cabHP.connect(this.cabLP);
    this.cabLP.connect(this.cabDip);
    this.cabDip.connect(this.cabWet);
    this.cabWet.connect(this.cabOut);
    high.connect(this.cabDry);
    this.cabDry.connect(this.cabOut);
    this.cabOut.connect(this.wetGain);

    // delay send off the cab output, with a feedback loop
    this.cabOut.connect(this.delay);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayMix);
    this.delayMix.connect(this.wetGain);

    this.wetGain.connect(this.master);
    this.dryGain.connect(this.master);

    // reverb send off the wet signal
    this.wetGain.connect(this.reverb);
    this.reverb.connect(this.reverbGain);
    this.reverbGain.connect(this.master);

    this.master.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    // the recorder tap is only wired up while recording (see startCapture),
    // so no ScriptProcessor sits in the graph during normal playing

    this.setBypass(false);
  }

  /** (Re)open the mic/interface stream and wire it into the graph. */
  private async openStream(): Promise<void> {
    // tear down any previous input
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

  /** List the available audio input devices (labels appear after permission). */
  async listInputs(): Promise<MediaDeviceInfo[]> {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === "audioinput");
  }

  /** Switch to a specific input device and reconnect live. */
  async setDevice(id: string): Promise<void> {
    this.deviceId = id || undefined;
    if (this.source) await this.openStream();
  }

  /** Pick which interface input to listen to: 0 = Input 1, 1 = Input 2. */
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

  /** Distortion character: soft (tanh), hard (clip), or fuzz (asymmetric). */
  setDistType(type: DistType): void {
    this.distType = type;
    this.shaper.curve = makeDistortionCurve(this.drive, this.distType);
  }

  setDrive(v: number): void {
    this.drive = Math.max(0, Math.min(1, v));
    this.shaper.curve = makeDistortionCurve(this.drive, this.distType);
  }

  /** EQ gain in dB, -18..+18. */
  setEq(band: EqBand, db: number): void {
    this.eq[band].gain.value = db;
  }

  /** Delay wet amount 0..1. */
  setDelayMix(v: number): void {
    this.delayMix.gain.value = Math.max(0, Math.min(1, v));
  }
  /** Delay time in seconds, 0..1. */
  setDelayTime(s: number): void {
    this.delay.delayTime.value = Math.max(0, Math.min(1, s));
  }
  /** Delay feedback 0..0.9 (higher = more repeats). */
  setDelayFeedback(v: number): void {
    this.delayFeedback.gain.value = Math.max(0, Math.min(0.9, v));
  }

  setBypass(on: boolean): void {
    this.bypassed = on;
    const t = this.ctx.currentTime;
    this.wetGain.gain.setTargetAtTime(on ? 0 : 1, t, 0.01);
    this.dryGain.gain.setTargetAtTime(on ? 1 : 0, t, 0.01);
  }

  /** Output volume, 0..1.4 (the limiter still catches anything hot). */
  setLevel(v: number): void {
    this.master.gain.value = Math.max(0, Math.min(1.4, v));
  }

  /** Reverb wet amount, 0..1. */
  setReverbMix(v: number): void {
    this.reverbGain.gain.value = Math.max(0, Math.min(1, v));
  }

  /** Noise gate amount, 0..1 (0 = off). Higher closes on louder residual noise. */
  setGate(v: number): void {
    const x = Math.max(0, Math.min(1, v));
    this.gateThreshold = x * x * 0.12; // squared for finer control down low
  }

  /** Cabinet / speaker sim on or off. */
  setCab(on: boolean): void {
    const t = this.ctx.currentTime;
    this.cabWet.gain.setTargetAtTime(on ? 1 : 0, t, 0.01);
    this.cabDry.gain.setTargetAtTime(on ? 0 : 1, t, 0.01);
  }

  /** Start collecting raw PCM from the output (for MP3 encoding). */
  startCapture(): void {
    this.recChunks = [];
    this.capturing = true;
    // wire the recorder into the graph only for the duration of the recording
    this.limiter.connect(this.recNode);
    this.recNode.connect(this.recSilent);
    this.recSilent.connect(this.ctx.destination);
  }

  /** Stop and return the captured PCM plus its sample rate. */
  stopCapture(): { chunks: Float32Array[]; sampleRate: number } {
    this.capturing = false;
    // pull the recorder back out of the graph
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

  get running(): boolean {
    return !!this.source && this.ctx.state === "running";
  }
}
