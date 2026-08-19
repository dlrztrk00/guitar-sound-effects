import { useRef, useState } from "react";
import { PedalEngine } from "./audio/engine";
import { Spectrum } from "./Spectrum";
import { Meter } from "./Meter";
import { Knob } from "./Knob";
import { PRESETS, DEFAULT_PRESET, type Tone } from "./presets";
import "./App.css";

function applyTone(e: PedalEngine, t: Tone) {
  e.setDrive(t.drive);
  e.setEq("low", t.low);
  e.setEq("mid", t.mid);
  e.setEq("high", t.high);
  e.setDelayMix(t.delayMix);
  e.setDelayTime(t.delayTime);
  e.setDelayFeedback(t.delayFb);
}

export default function App() {
  const engineRef = useRef<PedalEngine | null>(null);
  const [running, setRunning] = useState(false);
  const [bypassed, setBypassed] = useState(false);
  const [presetId, setPresetId] = useState(DEFAULT_PRESET);
  const [tone, setTone] = useState<Tone>(
    () => PRESETS.find((p) => p.id === DEFAULT_PRESET)!.tone
  );
  const [input, setInput] = useState<0 | 1>(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const preset = PRESETS.find((p) => p.id === presetId)!;
  const base = import.meta.env.BASE_URL;
  const faceBg = preset.skin.image
    ? `linear-gradient(180deg, rgba(0,0,0,.30), rgba(0,0,0,.62)), url("${base}${preset.skin.image}") center/cover, ${preset.skin.faceplate}`
    : preset.skin.faceplate;

  async function handleStart() {
    setError(null);
    try {
      if (!engineRef.current) engineRef.current = new PedalEngine();
      await engineRef.current.start();
      applyTone(engineRef.current, tone);
      engineRef.current.setBypass(bypassed);
      setRunning(true);
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

  function selectPreset(id: string) {
    const p = PRESETS.find((x) => x.id === id)!;
    setPresetId(id);
    setTone(p.tone);
    if (engineRef.current) applyTone(engineRef.current, p.tone);
  }

  function setToneVal(k: keyof Tone, v: number) {
    setTone((prev) => ({ ...prev, [k]: v }));
    const e = engineRef.current;
    if (!e) return;
    if (k === "drive") e.setDrive(v);
    else if (k === "low" || k === "mid" || k === "high") e.setEq(k, v);
    else if (k === "delayMix") e.setDelayMix(v);
    else if (k === "delayTime") e.setDelayTime(v);
    else if (k === "delayFb") e.setDelayFeedback(v);
  }

  async function onDevice(id: string) {
    setDeviceId(id);
    await engineRef.current?.setDevice(id);
  }

  function toggleBypass() {
    if (!running) return;
    const next = !bypassed;
    setBypassed(next);
    engineRef.current?.setBypass(next);
  }

  function onInput(ch: 0 | 1) {
    setInput(ch);
    engineRef.current?.setInput(ch);
  }

  function toggleRecord() {
    if (recording) return stopRecording();
    const e = engineRef.current;
    if (!e || !running) return;
    const rec = new MediaRecorder(e.recordStream);
    chunksRef.current = [];
    rec.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
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

  const on = running && !bypassed;

  return (
    <div className="app">
      <header>
        <h1>
          sound<span className="accent">//</span>box
        </h1>
        <p className="sub">a guitar pedal, coded — Web Audio</p>
      </header>

      {/* preset selector */}
      <div className="presets">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`preset ${p.id === presetId ? "sel" : ""}`}
            style={{ ["--accent" as string]: p.skin.accent }}
            onClick={() => selectPreset(p.id)}
          >
            {p.name}
          </button>
        ))}
      </div>

      {/* the pedal */}
      <div
        className={`pedal ${on ? "on" : "off"}`}
        style={{
          background: preset.skin.chassis,
          ["--accent" as string]: preset.skin.accent,
          ["--ink" as string]: preset.skin.ink,
        }}
      >
        <span className="screw tl" />
        <span className="screw tr" />
        <span className="screw bl" />
        <span className="screw br" />

        <div className="brand">SOUND//BOX</div>

        {/* faceplate — art + preset name + a little screen */}
        <div className="faceplate" style={{ background: faceBg }}>
          <div className="face-top">
            <span className="preset-name">{preset.name}</span>
            <span className={`dot ${on ? "lit" : ""}`} />
          </div>
          <p className="preset-tag">{preset.tag}</p>
          <div className="screen">
            <Spectrum analyser={running ? engineRef.current!.analyser : null} />
          </div>
        </div>

        {/* knob deck */}
        <div className="deck">
          <Knob label="DRIVE" value={tone.drive} min={0} max={1} step={0.01}
            display={`${Math.round(tone.drive * 100)}%`} accent={preset.skin.accent}
            onChange={(v) => setToneVal("drive", v)} />
          <Knob label="LOW" value={tone.low} min={-18} max={18} step={1}
            display={`${tone.low > 0 ? "+" : ""}${tone.low}`} accent={preset.skin.accent}
            onChange={(v) => setToneVal("low", v)} />
          <Knob label="MID" value={tone.mid} min={-18} max={18} step={1}
            display={`${tone.mid > 0 ? "+" : ""}${tone.mid}`} accent={preset.skin.accent}
            onChange={(v) => setToneVal("mid", v)} />
          <Knob label="HIGH" value={tone.high} min={-18} max={18} step={1}
            display={`${tone.high > 0 ? "+" : ""}${tone.high}`} accent={preset.skin.accent}
            onChange={(v) => setToneVal("high", v)} />
          <Knob label="DELAY" value={tone.delayMix} min={0} max={1} step={0.01}
            display={`${Math.round(tone.delayMix * 100)}%`} accent={preset.skin.accent}
            onChange={(v) => setToneVal("delayMix", v)} />
          <Knob label="TIME" value={tone.delayTime} min={0.02} max={1} step={0.01}
            display={`${Math.round(tone.delayTime * 1000)}ms`} accent={preset.skin.accent}
            onChange={(v) => setToneVal("delayTime", v)} />
          <Knob label="F.BACK" value={tone.delayFb} min={0} max={0.9} step={0.01}
            display={`${Math.round(tone.delayFb * 100)}%`} accent={preset.skin.accent}
            onChange={(v) => setToneVal("delayFb", v)} />
        </div>

        {/* footswitch */}
        <button className={`stomp ${on ? "lit" : ""}`} onClick={toggleBypass} disabled={!running}>
          <span className="stomp-ring" />
          {bypassed ? "BYPASS" : "ON"}
        </button>
      </div>

      {/* rack — the utility gear around the pedal */}
      <div className="rack">
        <div className="rack-row">
          <label className="device">
            <span className="rack-label">DEVICE</span>
            <select value={deviceId} onChange={(e) => onDevice(e.target.value)}
              disabled={!running || devices.length === 0}>
              <option value="">{running ? "system default" : "power on to list"}</option>
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || `input ${i + 1}`}</option>
              ))}
            </select>
          </label>
          <div className="inputs">
            <span className="rack-label">IN</span>
            <div className="seg">
              <button className={input === 0 ? "seg-on" : ""} onClick={() => onInput(0)}>CH 1</button>
              <button className={input === 1 ? "seg-on" : ""} onClick={() => onInput(1)}>CH 2</button>
            </div>
          </div>
        </div>

        <Meter analyser={running ? engineRef.current!.inputAnalyser : null} />

        <div className="rack-row">
          {!running ? (
            <button className="primary" onClick={handleStart}>▶ power on — plug in & allow mic</button>
          ) : (
            <>
              <button className="ghost" onClick={handleStop}>■ power off</button>
              <button className={`rec ${recording ? "on" : ""}`} onClick={toggleRecord}>
                {recording ? "■ stop & save" : "● record"}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <footer>
        <p>
          pick a preset — the pedal re-dials and re-skins. drag the knobs to tweak,
          watch the IN meter, hit record to save a riff.
        </p>
      </footer>
    </div>
  );
}
