import { useRef } from "react";

// A real rotary knob: drag up/down to turn it (or arrow keys).
// Sweeps 270° like a hardware pot.
export function Knob({
  label,
  value,
  min,
  max,
  step = 0.01,
  display,
  accent,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  display: string;
  accent: string;
  onChange: (v: number) => void;
}) {
  const startY = useRef(0);
  const startVal = useRef(0);
  const dragging = useRef(false);

  const t = (value - min) / (max - min); // 0..1
  const angle = -135 + t * 270; // -135°..+135°

  function clampSnap(v: number) {
    v = Math.max(min, Math.min(max, v));
    return Math.round(v / step) * step;
  }

  function onPointerDown(e: React.PointerEvent) {
    dragging.current = true;
    startY.current = e.clientY;
    startVal.current = value;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const dy = startY.current - e.clientY; // up = increase
    const v = startVal.current + (dy / 150) * (max - min);
    onChange(clampSnap(v));
  }
  function onPointerUp(e: React.PointerEvent) {
    dragging.current = false;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      onChange(clampSnap(value + step));
    } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      onChange(clampSnap(value - step));
    }
  }

  return (
    <div className="knob">
      <div
        className="knob-dial"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuenow={Math.round(value * 100) / 100}
        aria-valuemin={min}
        aria-valuemax={max}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        style={{ ["--accent" as string]: accent }}
      >
        <svg viewBox="0 0 48 48" aria-hidden>
          {/* tick marks around the dial */}
          {Array.from({ length: 11 }).map((_, i) => {
            const a = ((-135 + (i / 10) * 270) * Math.PI) / 180;
            const s = Math.sin(a);
            const c = -Math.cos(a);
            return (
              <line
                key={i}
                className="knob-tick"
                x1={24 + s * 21}
                y1={24 + c * 21}
                x2={24 + s * 23.5}
                y2={24 + c * 23.5}
              />
            );
          })}
          {/* value track + filled arc */}
          <path
            d="M 10.5 37.5 A 19 19 0 1 1 37.5 37.5"
            className="knob-track"
            fill="none"
            pathLength={100}
          />
          <path
            d="M 10.5 37.5 A 19 19 0 1 1 37.5 37.5"
            className="knob-fill"
            fill="none"
            pathLength={100}
            strokeDasharray={`${t * 100} 100`}
          />
          {/* pointer notch on the cap */}
          <line
            className="knob-ind"
            x1="24"
            y1="24"
            x2="24"
            y2="12"
            transform={`rotate(${angle} 24 24)`}
          />
        </svg>
      </div>
      <span className="knob-label">{label}</span>
      <span className="knob-val">{display}</span>
    </div>
  );
}
