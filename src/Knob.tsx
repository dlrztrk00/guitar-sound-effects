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
          {/* tick track */}
          <path
            d="M 10 38 A 20 20 0 1 1 38 38"
            className="knob-track"
            fill="none"
          />
          {/* filled arc up to the current value */}
          <circle className="knob-body" cx="24" cy="24" r="16" />
          {/* pointer */}
          <line
            className="knob-ind"
            x1="24"
            y1="24"
            x2="24"
            y2="10"
            transform={`rotate(${angle} 24 24)`}
          />
        </svg>
      </div>
      <span className="knob-label">{label}</span>
      <span className="knob-val">{display}</span>
    </div>
  );
}
