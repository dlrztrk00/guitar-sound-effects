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

// A soft-clipping distortion curve built from tanh.
function makeDistortionCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  const curve = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT));
  const k = 1 + drive * 40; // 1 (clean) → 41 (very driven)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k); // normalize peak to ~1
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

  private shaper: WaveShaperNode;
  private eq: Record<EqBand, BiquadFilterNode>;

  // delay send
  private delay: DelayNode;
  private delayFeedback: GainNode;
  private delayMix: GainNode;

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

  private drive = 0.5;
  bypassed = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });

    this.inputGain = this.ctx.createGain();

    // input level tap (doesn't alter the signal)
    this.inputAnalyser = this.ctx.createAnalyser();
    this.inputAnalyser.fftSize = 256;
    this.inputAnalyser.smoothingTimeConstant = 0.3;
    this.inputGain.connect(this.inputAnalyser);

    // --- distortion ---
    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = makeDistortionCurve(this.drive);
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

    // permanent wiring (input source gets attached later, in openStream)
    this.inputGain.connect(this.shaper);
    this.inputGain.connect(this.dryGain);

    this.shaper.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(this.wetGain);

    // delay send off the end of the EQ, with a feedback loop
    high.connect(this.delay);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayMix);
    this.delayMix.connect(this.wetGain);

    this.wetGain.connect(this.master);
    this.dryGain.connect(this.master);

    this.master.connect(this.limiter);
    this.limiter.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    // recorder tap runs into a silent gain so it processes without doubling output
    this.limiter.connect(this.recNode);
    this.recNode.connect(this.recSilent);
    this.recSilent.connect(this.ctx.destination);

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

  setDrive(v: number): void {
    this.drive = Math.max(0, Math.min(1, v));
    this.shaper.curve = makeDistortionCurve(this.drive);
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

  /** Start collecting raw PCM from the output (for MP3 encoding). */
  startCapture(): void {
    this.recChunks = [];
    this.capturing = true;
  }

  /** Stop and return the captured PCM plus its sample rate. */
  stopCapture(): { chunks: Float32Array[]; sampleRate: number } {
    this.capturing = false;
    const chunks = this.recChunks;
    this.recChunks = [];
    return { chunks, sampleRate: this.ctx.sampleRate };
  }

  get running(): boolean {
    return !!this.source && this.ctx.state === "running";
  }
}
