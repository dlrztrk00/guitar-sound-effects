import { useRef, useState } from "react";
import { PedalEngine } from "./audio/engine";
import { Spectrum } from "./Spectrum";
import "./App.css";

export default function App() {
  // the engine lives across renders but isn't state (it's not for the UI to diff)
  const engineRef = useRef<PedalEngine | null>(null);
  const [running, setRunning] = useState(false);
  const [bypassed, setBypassed] = useState(false);
  const [drive, setDrive] = useState(0.5);
  const [eq, setEq] = useState({ low: 0, mid: 0, high: 0 });
  const [input, setInput] = useState<0 | 1>(0); // 0 = Behringer Input 1
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setError(null);
    try {
      // AudioContext must be created from a user gesture (this click)
      if (!engineRef.current) engineRef.current = new PedalEngine();
      await engineRef.current.start();
      setRunning(true);
    } catch (e) {
      setError(
        "Couldn't open the guitar input. Check the mic permission and that the Behringer is selected as input."
      );
      console.error(e);
    }
  }

  async function handleStop() {
    await engineRef.current?.stop();
    setRunning(false);
  }

  function toggleBypass() {
    const next = !bypassed;
    setBypassed(next);
    engineRef.current?.setBypass(next);
  }

  function onDrive(v: number) {
    setDrive(v);
    engineRef.current?.setDrive(v);
  }

  function onEq(band: "low" | "mid" | "high", db: number) {
    setEq((p) => ({ ...p, [band]: db }));
    engineRef.current?.setEq(band, db);
  }

  function onInput(ch: 0 | 1) {
    setInput(ch);
    engineRef.current?.setInput(ch);
  }

  return (
    <div className="app">
      <header>
        <h1>
          dist<span className="accent">//</span>box
        </h1>
        <p className="sub">a guitar pedal, coded — Web Audio</p>
      </header>

      <div className={`pedal ${bypassed ? "off" : "on"}`}>
        {/* which Behringer input the guitar is plugged into */}
        <div className="inputs">
          <span className="inputs-label">INPUT</span>
          <div className="seg">
            <button
              className={input === 0 ? "seg-on" : ""}
              onClick={() => onInput(0)}
            >
              CH 1
            </button>
            <button
              className={input === 1 ? "seg-on" : ""}
              onClick={() => onInput(1)}
            >
              CH 2
            </button>
          </div>
        </div>

        {/* the visual */}
        <Spectrum analyser={running ? engineRef.current!.analyser : null} />

        {/* knobs */}
        <div className="knobs">
          <Control
            label="DRIVE"
            value={drive}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(drive * 100)}%`}
            onChange={onDrive}
          />
          <Control
            label="LOW"
            value={eq.low}
            min={-18}
            max={18}
            step={1}
            display={`${eq.low > 0 ? "+" : ""}${eq.low} dB`}
            onChange={(v) => onEq("low", v)}
          />
          <Control
            label="MID"
            value={eq.mid}
            min={-18}
            max={18}
            step={1}
            display={`${eq.mid > 0 ? "+" : ""}${eq.mid} dB`}
            onChange={(v) => onEq("mid", v)}
          />
          <Control
            label="HIGH"
            value={eq.high}
            min={-18}
            max={18}
            step={1}
            display={`${eq.high > 0 ? "+" : ""}${eq.high} dB`}
            onChange={(v) => onEq("high", v)}
          />
        </div>

        {/* footswitch */}
        <button
          className={`stomp ${bypassed ? "" : "lit"}`}
          onClick={toggleBypass}
          disabled={!running}
        >
          <span className="led" />
          {bypassed ? "BYPASS" : "ON"}
        </button>
      </div>

      {/* transport */}
      <div className="transport">
        {!running ? (
          <button className="primary" onClick={handleStart}>
            ▶ start — plug in & allow mic
          </button>
        ) : (
          <button className="ghost" onClick={handleStop}>
            ■ stop
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <footer>
        <p>
          guitar → Behringer → browser. turn DRIVE up and hear the tanh
          waveshaper clip. this is step 1–5 of the build.
        </p>
      </footer>
    </div>
  );
}

// One labelled slider. (Step 6 in your list makes these look like real knobs.)
function Control(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="control">
      <span className="ctl-label">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(parseFloat(e.target.value))}
      />
      <span className="ctl-value">{props.display}</span>
    </label>
  );
}
