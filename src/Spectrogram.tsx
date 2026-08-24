import { useEffect, useRef } from "react";

// A scrolling spectrogram (waterfall): time flows left→right, frequency is the
// vertical axis (low at the bottom), and colour = how loud that frequency is.
// Each frame we shift the whole image one pixel left and paint a fresh column
// on the right edge.
export function Spectrogram({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const bins = analyser.frequencyBinCount; // fftSize / 2
    const data = new Uint8Array(bins);
    const { width: w, height: h } = canvas;
    // guitar energy lives in the low ~half of the spectrum
    const shown = Math.floor(bins * 0.5);
    let raf = 0;

    // magnitude 0..1 → a dark-to-hot colour ramp on the terminal-green palette
    const colour = (v: number): string => {
      if (v < 0.02) return "rgb(4,7,10)";
      if (v < 0.4) {
        const t = v / 0.4; // black → green
        return `rgb(${Math.round(10 + t * 40)}, ${Math.round(20 + t * 170)}, ${Math.round(20 + t * 80)})`;
      }
      if (v < 0.75) {
        const t = (v - 0.4) / 0.35; // green → amber
        return `rgb(${Math.round(50 + t * 180)}, ${Math.round(190 + t * 30)}, ${Math.round(100 - t * 60)})`;
      }
      const t = (v - 0.75) / 0.25; // amber → hot red
      return `rgb(${Math.round(230 + t * 25)}, ${Math.round(220 - t * 150)}, ${Math.round(40 - t * 40)})`;
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);

      // scroll everything one pixel to the left
      const prev = ctx.getImageData(1, 0, w - 1, h);
      ctx.putImageData(prev, 0, 0);

      // paint the newest column on the right edge
      for (let y = 0; y < h; y++) {
        // bottom of the canvas = low frequencies
        const idx = Math.floor((1 - y / h) * shown);
        const v = data[idx] / 255;
        ctx.fillStyle = colour(v);
        ctx.fillRect(w - 1, y, 1, 1);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return (
    <canvas
      ref={canvasRef}
      width={560}
      height={140}
      className="spectrum"
      aria-label="live spectrogram"
    />
  );
}
