import { useRef, useState } from "react";
import { PedalEngine } from "./audio/engine";
import { Spectrum } from "./Spectrum";
import { Meter } from "./Meter";
import { Knob } from "./Knob";
import { ARTISTS, DEFAULT_ARTIST, DEFAULT_SONG, type Tone } from "./presets";
import { Mp3Encoder } from "@breezystack/lamejs";
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
  const [artistId, setArtistId] = useState(DEFAULT_ARTIST);
  const [songId, setSongId] = useState(DEFAULT_SONG);
  const [tone, setTone] = useState<Tone>(
    () => ARTISTS.find((a) => a.id === DEFAULT_ARTIST)!.songs[0].tone
  );
  const [input, setInput] = useState<0 | 1>(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const artist = ARTISTS.find((a) => a.id === artistId)!;
  const song = artist.songs.find((s) => s.id === songId) ?? artist.songs[0];
  const base = import.meta.env.BASE_URL;
  const faceBg = artist.skin.image
    ? `linear-gradient(180deg, rgba(0,0,0,.30), rgba(0,0,0,.62)), url("${base}${artist.skin.image}") center/cover, ${artist.skin.faceplate}`
    : artist.skin.faceplate;

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
    if (recording) finishRecording();
    await engineRef.current?.stop();
    setRunning(false);
  }

  function selectArtist(id: string) {
    const a = ARTISTS.find((x) => x.id === id)!;
    const s = a.songs[0];
    setArtistId(id);
    setSongId(s.id);
    setTone(s.tone);
    if (engineRef.current) applyTone(engineRef.current, s.tone);
  }

  function selectSong(id: string) {
    const s = artist.songs.find((x) => x.id === id)!;
    setSongId(id);
    setTone(s.tone);
    if (engineRef.current) applyTone(engineRef.current, s.tone);
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
    if (recording) {
      finishRecording();
      return;
    }
    const e = engineRef.current;
    if (!e || !running) return;
    e.startCapture();
    setRecording(true);
  }

  function finishRecording() {
    const e = engineRef.current;
    if (!e) return;
    const { chunks, sampleRate } = e.stopCapture();
    setRecording(false);
    if (!chunks.length) return;
    setSaving(true);
    setTimeout(() => {
      const total = chunks.reduce((n, c) => n + c.length, 0);
      const pcm = new Int16Array(total);
      let off = 0;
      for (const c of chunks) {
        for (let i = 0; i < c.length; i++) {
          const s = Math.max(-1, Math.min(1, c[i]));
          pcm[off++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
      }
      const enc = new Mp3Encoder(1, sampleRate, 128);
      const parts: Uint8Array[] = [];
      const frame = 1152;
      for (let i = 0; i < pcm.length; i += frame) {
        const buf = enc.encodeBuffer(pcm.subarray(i, i + frame));
        if (buf.length) parts.push(new Uint8Array(buf));
      }
      const end = enc.flush();
      if (end.length) parts.push(new Uint8Array(end));
      const blob = new Blob(parts as unknown as BlobPart[], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `soundbox-${new Date().toISOString().slice(0, 19)}.mp3`;
      a.click();
      URL.revokeObjectURL(url);
      setSaving(false);
    }, 30);
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

      {/* artist selector */}
      <div className="presets">
        {ARTISTS.map((a) => (
          <button
            key={a.id}
            className={`preset ${a.id === artistId ? "sel" : ""}`}
            style={{ ["--accent" as string]: a.skin.accent }}
            onClick={() => selectArtist(a.id)}
          >
            {a.name}
          </button>
        ))}
      </div>

      {/* song selector (only when the artist has more than one) */}
      {artist.songs.length > 1 && (
        <div className="songs">
          {artist.songs.map((s) => (
            <button
              key={s.id}
              className={`song ${s.id === songId ? "sel" : ""}`}
              style={{ ["--accent" as string]: artist.skin.accent }}
              onClick={() => selectSong(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* the pedal */}
      <div
        className={`pedal ${on ? "on" : "off"}`}
        style={{
          background: artist.skin.chassis,
          ["--accent" as string]: artist.skin.accent,
          ["--ink" as string]: artist.skin.ink,
        }}
      >
        <span className="screw tl" />
        <span className="screw tr" />
        <span className="screw bl" />
        <span className="screw br" />

        <div className="brand">SOUND//BOX</div>

        <div className="faceplate" style={{ background: faceBg }}>
          <div className="face-top">
            <span className="preset-name">{artist.name}</span>
            <span className={`dot ${on ? "lit" : ""}`} />
          </div>
          <p className="preset-tag">♪ {song.name}</p>
          <div className="screen">
            <Spectrum analyser={running ? engineRef.current!.analyser : null} />
          </div>
        </div>

        <div className="deck">
          <Knob label="DRIVE" value={tone.drive} min={0} max={1} step={0.01}
            display={`${Math.round(tone.drive * 100)}%`} accent={artist.skin.accent}
            onChange={(v) => setToneVal("drive", v)} />
          <Knob label="LOW" value={tone.low} min={-18} max={18} step={1}
            display={`${tone.low > 0 ? "+" : ""}${tone.low}`} accent={artist.skin.accent}
            onChange={(v) => setToneVal("low", v)} />
          <Knob label="MID" value={tone.mid} min={-18} max={18} step={1}
            display={`${tone.mid > 0 ? "+" : ""}${tone.mid}`} accent={artist.skin.accent}
            onChange={(v) => setToneVal("mid", v)} />
          <Knob label="HIGH" value={tone.high} min={-18} max={18} step={1}
            display={`${tone.high > 0 ? "+" : ""}${tone.high}`} accent={artist.skin.accent}
            onChange={(v) => setToneVal("high", v)} />
          <Knob label="DELAY" value={tone.delayMix} min={0} max={1} step={0.01}
            display={`${Math.round(tone.delayMix * 100)}%`} accent={artist.skin.accent}
            onChange={(v) => setToneVal("delayMix", v)} />
          <Knob label="TIME" value={tone.delayTime} min={0.02} max={1} step={0.01}
            display={`${Math.round(tone.delayTime * 1000)}ms`} accent={artist.skin.accent}
            onChange={(v) => setToneVal("delayTime", v)} />
          <Knob label="F.BACK" value={tone.delayFb} min={0} max={0.9} step={0.01}
            display={`${Math.round(tone.delayFb * 100)}%`} accent={artist.skin.accent}
            onChange={(v) => setToneVal("delayFb", v)} />
        </div>

        <button className={`stomp ${on ? "lit" : ""}`} onClick={toggleBypass} disabled={!running}>
          <span className="stomp-ring" />
          {bypassed ? "BYPASS" : "ON"}
        </button>
      </div>

      {/* rack — utility gear around the pedal */}
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
              <button className={`rec ${recording ? "on" : ""}`} onClick={toggleRecord} disabled={saving}>
                {saving ? "saving mp3…" : recording ? "■ stop & save mp3" : "● record"}
              </button>
            </>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <footer>
        <p>
          pick an artist, then a song — the pedal re-dials and re-skins. drag the
          knobs to tweak, watch the IN meter, hit record to save an mp3.
        </p>
      </footer>
    </div>
  );
}
