// The whole pedal, in Web Audio nodes.
//
// signal path:
//   guitar (mic/interface)
//     → inputGain
//     ├─ dry path ─────────────→ dryGain ┐
//     └─ WaveShaper (distortion)          │
//          → EQ low → mid → high → wetGain ┤
//                                          ├→ master → analyser → speakers
//
// bypass = turn wetGain off / dryGain on. that's it.

export type EqBand = "low" | "mid" | "high";

// A soft-clipping distortion curve built from tanh.
// `drive` 0..1 → how hard we push the signal into the curve.
// tanh squashes big values toward ±1 → rounded, warm clipping (not harsh).
function makeDistortionCurve(drive: number): Float32Array<ArrayBuffer> {
  const n = 2048;
  // build on an explicit ArrayBuffer so the type matches WaveShaperNode.curve
  const curve = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT));
  const k = 1 + drive * 40; // 1 (clean) → 41 (very driven)
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1; // input sample, -1..1
    curve[i] = Math.tanh(k * x) / Math.tanh(k); // normalize so peak stays ~1
  }
  return curve;
}

export class PedalEngine {
  ctx: AudioContext;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;

  private inputGain: GainNode;
  private splitter?: ChannelSplitterNode;
  private inputChannel: 0 | 1 = 0; // 0 = Behringer Input 1, 1 = Input 2
  private shaper: WaveShaperNode;
  private eq: Record<EqBand, BiquadFilterNode>;
  private wetGain: GainNode;
  private dryGain: GainNode;
  private master: GainNode;
  analyser: AnalyserNode;

  private drive = 0.5;
  bypassed = false;

  constructor() {
    this.ctx = new AudioContext({ latencyHint: "interactive" });

    this.inputGain = this.ctx.createGain();
    this.inputGain.gain.value = 1;

    // --- distortion ---
    this.shaper = this.ctx.createWaveShaper();
    this.shaper.curve = makeDistortionCurve(this.drive);
    this.shaper.oversample = "4x"; // cleaner clipping, less aliasing

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

    // --- mix / bypass ---
    this.wetGain = this.ctx.createGain();
    this.dryGain = this.ctx.createGain();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;

    // --- the visual tap ---
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    // wire the effects chain: shaper → low → mid → high → wetGain
    this.shaper.connect(low);
    low.connect(mid);
    mid.connect(high);
    high.connect(this.wetGain);

    // both paths meet at master, then analyser, then speakers
    this.wetGain.connect(this.master);
    this.dryGain.connect(this.master);
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.setBypass(false);
  }

  /** Ask for the guitar input and start passing sound through. Needs a user click. */
  async start(): Promise<void> {
    if (this.source) {
      // already started; just make sure the context is running
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // CRITICAL for guitar: turn off the phone/voice processing,
        // or the browser "cleans" your signal and kills sustain/tone.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // ask for BOTH channels so we can pick Input 1 vs Input 2
        channelCount: 2,
      },
      video: false,
    });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    // split the stereo interface into its two mono inputs...
    this.splitter = this.ctx.createChannelSplitter(2);
    this.source.connect(this.splitter);
    // ...and feed only the selected one forward
    this.splitter.connect(this.inputGain, this.inputChannel, 0);
    // feed input into BOTH the dry path and the distortion path
    this.inputGain.connect(this.shaper);
    this.inputGain.connect(this.dryGain);
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /** Stop the audio and release the mic. */
  async stop(): Promise<void> {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source?.disconnect();
    this.splitter?.disconnect();
    this.inputGain.disconnect();
    this.stream = undefined;
    this.source = undefined;
    this.splitter = undefined;
    await this.ctx.suspend();
  }

  /** Pick which Behringer input to listen to: 0 = Input 1, 1 = Input 2. */
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

  setBypass(on: boolean): void {
    this.bypassed = on;
    const t = this.ctx.currentTime;
    // short ramp avoids a click when switching
    this.wetGain.gain.setTargetAtTime(on ? 0 : 1, t, 0.01);
    this.dryGain.gain.setTargetAtTime(on ? 1 : 0, t, 0.01);
  }

  get running(): boolean {
    return !!this.source && this.ctx.state === "running";
  }
}
