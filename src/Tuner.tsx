import { useEffect, useState } from "react";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Autocorrelation pitch detector — returns a frequency in Hz, or -1 if unclear.
function autoCorrelate(buf: Float32Array, rate: number): number {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1; // too quiet

  let r1 = 0;
  let r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++)
    if (Math.abs(buf[i]) < thres) {
      r1 = i;
      break;
    }
  for (let i = 1; i < SIZE / 2; i++)
    if (Math.abs(buf[SIZE - i]) < thres) {
      r2 = SIZE - i;
      break;
    }

  const b = buf.slice(r1, r2);
  const n = b.length;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n - i; j++) c[i] += b[j] * b[j + i];

  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < n; i++)
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  if (maxpos <= 0) return -1;

  let T0 = maxpos;
  const x1 = c[T0 - 1];
  const x2 = c[T0];
  const x3 = c[T0 + 1] ?? c[T0];
  const a = (x1 + x3 - 2 * x2) / 2;
  const bb = (x3 - x1) / 2;
  if (a) T0 = T0 - bb / (2 * a);

  return rate / T0;
}

export function Tuner({
  analyser,
  sampleRate,
}: {
  analyser: AnalyserNode | null;
  sampleRate: number;
}) {
  const [note, setNote] = useState("");
  const [cents, setCents] = useState(0);
  const [lit, setLit] = useState(false);

  useEffect(() => {
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    let frame = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (frame++ % 3 !== 0) return; // throttle to ~20fps
      analyser.getFloatTimeDomainData(buf);
      const f = autoCorrelate(buf, sampleRate);
      if (f < 0 || f < 40 || f > 2000) {
        setLit(false);
        return;
      }
      const midi = 69 + 12 * Math.log2(f / 440);
      const rounded = Math.round(midi);
      setNote(NOTES[((rounded % 12) + 12) % 12] + (Math.floor(rounded / 12) - 1));
      setCents(Math.round((midi - rounded) * 100));
      setLit(true);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [analyser, sampleRate]);

  const inTune = lit && Math.abs(cents) <= 5;

  return (
    <div className="tuner">
      <div className={`tuner-note ${inTune ? "in" : ""}`}>
        {lit ? note : "—"}
      </div>
      <div className="tuner-bar">
        <span className="tuner-center" />
        {lit && (
          <span
            className={`tuner-needle ${inTune ? "in" : ""}`}
            style={{ left: `${50 + Math.max(-50, Math.min(50, cents)) / 1}%` }}
          />
        )}
      </div>
      <div className="tuner-cents">
        {lit ? `${cents > 0 ? "+" : ""}${cents}¢` : "play a note"}
      </div>
    </div>
  );
}
