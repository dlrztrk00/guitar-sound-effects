# distbox 🎸

A real-time **guitar distortion + EQ pedal** that runs entirely in the browser —
no plugins, no pedal, just code. Built with the **Web Audio API**, React and
TypeScript.

Plug a guitar into an audio interface, open the page, and shape your tone with a
tanh waveshaper and a 3-band EQ while a live spectrum reacts to what you play.

> Built to answer a simple question: *can I make distortion with math instead of
> a stompbox?* Turns out you can — it's a nonlinear transfer function applied to
> the samples.

<!-- Add a screenshot or GIF here once deployed:
     ![distbox](docs/demo.gif) -->

---

## Features

- 🎛 **DRIVE** — soft-clipping distortion from a `tanh` waveshaper curve
- 🎚 **3-band EQ** — low / mid / high, built on `BiquadFilterNode`
- 🦶 **True-bypass footswitch** — A/B the wet and dry signal with no click
- 📊 **Live spectrum** — real-time FFT drawn on a canvas as you play
- 🔀 **CH1 / CH2 input selector** — pick which input of a 2-in interface (e.g.
  Behringer UMC202HD) your guitar is plugged into

## How it works

The whole effect is a chain of Web Audio nodes:

```
guitar (getUserMedia)
  → ChannelSplitter        pick Input 1 or Input 2
  → WaveShaperNode         tanh distortion curve, driven by DRIVE
  → BiquadFilter ×3        low-shelf / peaking / high-shelf EQ
  → dry/wet GainNodes      the bypass switch
  → AnalyserNode           taps the signal for the spectrum
  → speakers
```

**Distortion** is just a lookup curve: each incoming sample `x` (−1…1) is mapped
through `tanh(k·x)`, where `k` grows with the DRIVE knob. `tanh` squashes large
values toward ±1, which is exactly what a rounded, warm clip sounds like — the
higher the drive, the harder it clips.

**EQ** is three biquad filters in series. **Bypass** crossfades between a dry
path and the processed path. The guitar input requests raw audio
(`echoCancellation`, `noiseSuppression`, `autoGainControl` all **off**) so the
browser doesn't "clean up" the signal and kill the sustain.

## Run it locally

```bash
npm install
npm run dev
```

Then open the printed URL, click **start**, and allow microphone access.

**Setup tips**
- Select your audio interface as the system input (macOS: System Settings → Sound → Input).
- Use **headphones** to avoid a feedback loop between speakers and input.
- Turn up the interface's **GAIN** knob so the signal is strong enough to hear the distortion.

> ⚠️ Browser audio has a little input latency — this is a fun, visual, coded
> effects unit, not a replacement for a DAW when actually recording.

## Tech

- **Web Audio API** — `WaveShaperNode`, `BiquadFilterNode`, `AnalyserNode`, `ChannelSplitterNode`
- **React 19 + TypeScript**
- **Vite**

## Roadmap

- [ ] Real rotary knobs (drag to turn) instead of sliders
- [ ] Delay / echo effect (`DelayNode` + feedback)
- [ ] Save & recall presets — one tone per artist
- [ ] Deploy to a public URL
- [ ] Prototype the distortion curve in Python (numpy) first

---

Made by [Dilara Öztürk](https://github.com/dlrztrk00) — where software meets music.
