# soundbox

A guitar pedal I built in the browser.

I saw a video where someone made distortion just by writing code no pedal, no
amp, just math on the audio signal and wanted to know if I could do the same.

This runs in the browser: you plug a guitar into an interface (I used behringer umc202hd with 2 inputs),
open the page, and it distorts and EQs your sound in real time while a spectrum
moves along with what you play.

**Try it: https://dlrztrk00.github.io/guitar-sound-effects/** — plug in a guitar
and allow the mic when it asks.

<!-- I'll drop a screen recording here:
     ![distbox](docs/demo.gif) -->

## What it does

- **Drive** — the distortion. Turn it up and the sound clips harder.
- **Low / Mid / High** — a basic EQ to shape the tone.
- **On / Bypass** footswitch — flip between the effect and your clean sound.
- **Live spectrum** — the bars react to whatever you're playing.
- **CH1 / CH2** — my interface (a Behringer UMC202HD) has two inputs, so this
  lets me pick the one the guitar is actually plugged into.


## Running it

```bash
npm install
npm run dev
```

Open the URL it prints, hit start, allow the mic.

## Built with

Web Audio API, React, TypeScript, Vite.

## Still want to add

- Actual knobs you turn, instead of sliders
- A delay/echo
- Saving presets so I can keep a tone per artist
- Working out the distortion curve in Python first, for my DSP course

---

by [Dilara](https://github.com/dlrztrk00)
