import { useEffect, useRef } from "react";

// A horizontal input-level meter. Green while healthy, amber loud,
// red when it's about to clip — the thing you watch while gain-staging.
export function Meter({ analyser }: { analyser: AnalyserNode | null }) {
  const barRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!analyser) return;
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;
    let clipHold = 0;

    const tick = () => {
      raf = requestAnimationFrame(tick);
      analyser.getFloatTimeDomainData(buf);
      // peak of this frame, 0..1
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const a = Math.abs(buf[i]);
        if (a > peak) peak = a;
      }
      const bar = barRef.current;
      if (bar) {
        bar.style.width = `${Math.min(100, peak * 100)}%`;
        bar.style.background =
          peak > 0.9 ? "#e0684c" : peak > 0.6 ? "#e8b64c" : "#7fe08a";
      }
      // latch the clip light briefly when it pins near 1
      if (peak > 0.98) clipHold = 45;
      const clip = clipRef.current;
      if (clip) clip.style.opacity = clipHold > 0 ? "1" : "0.25";
      if (clipHold > 0) clipHold--;
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [analyser]);

  return (
    <div className="meter" aria-label="input level">
      <span className="meter-label">IN</span>
      <div className="meter-track">
        <div ref={barRef} className="meter-bar" />
      </div>
      <span ref={clipRef} className="meter-clip">
        CLIP
      </span>
    </div>
  );
}
