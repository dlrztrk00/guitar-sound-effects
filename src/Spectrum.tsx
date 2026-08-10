import { useEffect, useRef } from "react";

// Draws the live frequency spectrum from the analyser, every animation frame.
// Bars on the left = low notes, right = high. Green = your terminal palette.
export function Spectrum({ analyser }: { analyser: AnalyserNode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!analyser) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const bins = analyser.frequencyBinCount; // = fftSize / 2
    const data = new Uint8Array(bins);
    let raf = 0;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(data);

      const { width: w, height: h } = canvas;
      ctx.clearRect(0, 0, w, h);

      // only show the useful low ~half of the spectrum (guitar lives there)
      const shown = Math.floor(bins * 0.55);
      const barW = w / shown;
      for (let i = 0; i < shown; i++) {
        const v = data[i] / 255; // 0..1
        const barH = v * h;
        // brighter green as it gets louder
        ctx.fillStyle = `rgb(${Math.round(60 + v * 60)}, ${Math.round(
          150 + v * 90
        )}, ${Math.round(100 + v * 50)})`;
        ctx.fillRect(i * barW, h - barH, barW * 0.85, barH);
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
      aria-label="live audio spectrum"
    />
  );
}
