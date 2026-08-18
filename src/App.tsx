import { useRef, useState } from "react";
import { PedalEngine } from "./audio/engine";
import { Spectrum } from "./Spectrum";
import { Meter } from "./Meter";
import "./App.css";

export default function App() {
  const engineRef = useRef<PedalEngine | null>(null);
  const [running, setRunning] = useState(false);
  const [bypassed, setBypassed] = useState(false);
  const [drive, setDrive] = useState(0.5);
  const [eq, setEq] = useState({ low: 0, mid: 0, high: 0 });
  const [delay, setDelay] = useState({ mix: 0, time: 0.3, fb: 0.35 });
  const [input, setInput] = useState<0 | 1>(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function handleStart() {
    setError(null);
    try {
      if (!engineRef.current) engineRef.current = new PedalEngine();
      await engineRef.current.start();
      setRunning(true);
      // labels only appear once permission is granted
      setDevices(await engineRef.current.listInputs());
    } catch (e) {
      setError(
        "Couldn't open the guitar input. Check the mic permission and that your interface is selected."
      );
      console.error(e);
    }
  }

  async function handleStop() {
    if (recording) stopRecording();
    await engineRef.current?.stop();
    setRunning(false);
  }

  async function onDevice(id: string) {
    setDeviceId(id);
    await engineRef.current?.setDevice(id);
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

  function onDelay(k: "mix" | "time" | "fb", v: number) {
    setDelay((p) => ({ ...p, [k]: v }));
    const e = engineRef.current;
    if (!e) return;
    if (k === "mix") e.setDelayMix(v);
    if (k === "time") e.setDelayTime(v);
    if (k === "fb") e.setDelayFeedback(v);
  }

  function onInput(ch: 0 | 1) {
    setInput(ch);
    engineRef.current?.setInput(ch);
  }

  function toggleRecord() {
    if (recording) {
      stopRecording();
      return;
    }
    const e = engineRef.current;
    if (!e || !running) return;
    const rec = new MediaRecorder(e.recordStream);
    chunksRef.current = [];
    rec.ondataavailable = (ev) => {
      if (ev.data.size) chunksRef.current.push(ev.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: rec.mimeType || "audio/webm",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `soundbox-${new Date().toISOString().slice(0, 19)}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };
    rec.start();
    recRef.current = rec;
    setRecording(true);
  }

  function stopRecording() {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  }

  return (
    <div className="app">
      <header>
        <h1>
          sound<span className="accent">//</span>box
        </h1>
        <p className="sub">a guitar pedal, coded — Web Audio</p>
      </header>

      <div className={`pedal ${bypassed ? "off" : "on"}`}>
        {/* input device + channel */}
        <div className="io">
          <label className="device">
            <span className="inputs-label">DEVICE</span>
            <select
              value={deviceId}
              onChange={(e) => onDevice(e.target.value)}
              disabled={!running || devices.length === 0}
            >
              <option value="">
                {running ? "system default" : "start to list inputs"}
              </option>
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `input ${i + 1}`}
                </option>
              ))}
            </select>
          </label>

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
        </div>

        {/* input level meter */}
        <Meter analyser={running ? engineRef.current!.inputAnalyser : null} />

        {/* the visual */}
        <Spectrum analyser={running ? engineRef.current!.analyser : null} />

        {/* tone knobs */}
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

        {/* delay */}
        <div className="knobs delay-row">
          <Control
            label="DELAY"
            value={delay.mix}
            min={0}
            max={1}
            step={0.01}
            display={`${Math.round(delay.mix * 100)}%`}
            onChange={(v) => onDelay("mix", v)}
          />
          <Control
            label="TIME"
            value={delay.time}
            min={0.02}
            max={1}
            step={0.01}
            display={`${Math.round(delay.time * 1000)} ms`}
            onChange={(v) => onDelay("time", v)}
          />
          <Control
            label="F.BACK"
            value={delay.fb}
            min={0}
            max={0.9}
            step={0.01}
            display={`${Math.round(delay.fb * 100)}%`}
            onChange={(v) => onDelay("fb", v)}
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
          <div className="transport-row">
            <button className="ghost" onClick={handleStop}>
              ■ stop
            </button>
            <button
              className={`rec ${recording ? "on" : ""}`}
              onClick={toggleRecord}
            >
              {recording ? "■ stop & save" : "● record"}
            </button>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <footer>
        <p>
          guitar → interface → browser. pick your device, watch the IN meter,
          shape the tone, add a little delay — and hit record to save a riff.
        </p>
      </footer>
    </div>
  );
}

// One labelled slider.
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
