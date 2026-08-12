# distbox

A guitar pedal I built in the browser instead of buying one.

I saw a video where someone made distortion just by writing code — no pedal, no
amp, just math on the audio signal — and wanted to know if I could do the same.
Turns out you can. This runs in the browser: you plug a guitar into an interface,
open the page, and it distorts and EQs your sound in real time while a spectrum
moves along with what you play.

<!-- I'll drop a screen recording here once I deploy it:
     ![distbox](docs/demo.gif) -->

## What it does

- **Drive** — the distortion. Turn it up and the sound clips harder.
- **Low / Mid / High** — a basic EQ to shape the tone.
- **On / Bypass** footswitch — flip between the effect and your clean sound.
- **Live spectrum** — the bars react to whatever you're playing.
- **CH1 / CH2** — my interface (a Behringer UMC202HD) has two inputs, so this
  lets me pick the one the guitar is actually plugged into.

## How it actually works

The signal runs through a chain of Web Audio nodes:

```
guitar (mic input)
  → split the two interface inputs, keep the one I picked
  → distortion  (a tanh curve — this is the part from that video)
  → EQ          (three filters: low, mid, high)
  → dry/wet mix (that's the bypass switch)
  → analyser    (feeds the spectrum)
  → speakers
```

The distortion is the fun part. Every sample of the sound (a number between −1
and 1) gets pushed through `tanh`. `tanh` flattens big values toward ±1, so the
peaks of the wave get squashed — and squashed peaks *is* distortion. The Drive
knob just controls how hard I push into it. No pedal doing it, just that.

The EQ is three filters stacked. Bypass is a crossfade between the clean signal
and the processed one. I also had to tell the browser to stop "cleaning up" the
mic input (it does echo cancellation and noise reduction by default), otherwise
it kills the sustain and the tone goes thin.

## Running it

```bash
npm install
npm run dev
```

Open the URL it prints, hit start, allow the mic.

A few things I learned the hard way:
- Pick your interface as the input in your system sound settings.
- Wear headphones or the speakers feed back into the input.
- Turn the interface's gain up enough, or the signal's too weak to distort.

One honest caveat: there's a bit of latency going through the browser, so this
is more a "look what I made" project than something I'd track a real cover
through. For recording I still use GarageBand.

## Built with

Web Audio API, React, TypeScript, Vite.

## Still want to add

- Actual knobs you turn, instead of sliders
- A delay/echo
- Saving presets so I can keep a tone per artist
- Getting it deployed somewhere
- Working out the distortion curve in Python first, for my DSP course

---

by [Dilara](https://github.com/dlrztrk00)
