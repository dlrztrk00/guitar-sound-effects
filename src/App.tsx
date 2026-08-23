import { useRef, useState } from "react";
import { PedalEngine } from "./audio/engine";
import { Spectrum } from "./Spectrum";
import { Meter } from "./Meter";
import { Knob } from "./Knob";
import { Tuner } from "./Tuner";
import {
  ARTISTS,
  DEFAULT_ARTIST,
  DEFAULT_SONG,
  SAVED_SKIN,
  loadCustoms,
  saveCustoms,
  encodeTone,
  sharedFromHash,
  type Tone,
  type Artist,
  type Custom,
} from "./presets";
import { Mp3Encoder } from "@breezystack/lamejs";
import type { DistType } from "./audio/engine";
import "./App.css";

function applyTone(e: PedalEngine, t: Tone) {
  e.setDrive(t.drive);
  e.setEq("low", t.low);
  e.setEq("mid", t.mid);
  e.setEq("high", t.high);
  e.setDelayMix(t.delayMix);
  e.setDelayTime(t.delayTime);
  e.setDelayFeedback(t.delayFb);
  e.setReverbMix(t.reverb ?? 0);
  e.setGate(t.gate ?? 0);
  e.setCab(!!t.cab);
  e.setDistType(t.dist ?? "soft");
  e.setChorus(t.chorus ?? 0);
  e.setComp(t.comp ?? 0);
}

export default function App() {
  const initShared = sharedFromHash();
  const engineRef = useRef<PedalEngine | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [running, setRunning] = useState(false);
  const [bypassed, setBypassed] = useState(false);
  const [artistId, setArtistId] = useState(initShared ? "shared" : DEFAULT_ARTIST);
  const [songId, setSongId] = useState(initShared ? "shared" : DEFAULT_SONG);
  const [tone, setTone] = useState<Tone>(
    () => initShared?.tone ?? ARTISTS.find((a) => a.id === DEFAULT_ARTIST)!.songs[0].tone
  );
  const [shared] = useState(() => initShared);
  const [shareMsg, setShareMsg] = useState("");
  const [customs, setCustoms] = useState<Custom[]>(() => loadCustoms());
  const [presetName, setPresetName] = useState("");
  const [level, setLevel] = useState(0.9);
  const [tunerOn, setTunerOn] = useState(false);
  const [input, setInput] = useState<0 | 1>(0);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loopState, setLoopState] = useState<"idle" | "rec" | "play">("idle");
  const [error, setError] = useState<string | null>(null);
  // each stompbox's footswitch (true = engaged)
  const [fx, setFx] = useState({
    comp: true,
    drive: true,
    chorus: true,
    delay: true,
  });

  // built-in artists + a "Saved" section when the user has presets
  const savedArtist: Artist = {
    id: "saved",
    name: "★ Saved",
    skin: SAVED_SKIN,
    songs: customs.map((c) => ({ id: c.id, name: c.name, tone: c.tone })),
  };
  const sharedArtist: Artist | null = shared
    ? {
        id: "shared",
        name: "⇄ Shared",
        skin: shared.skin,
        songs: [{ id: "shared", name: shared.name, tone: shared.tone }],
      }
    : null;
  const allArtists = [
    ...ARTISTS,
    ...(customs.length ? [savedArtist] : []),
    ...(sharedArtist ? [sharedArtist] : []),
  ];
  const artist = allArtists.find((a) => a.id === artistId) ?? ARTISTS[0];
  const song = artist.songs.find((s) => s.id === songId) ?? artist.songs[0];
  const activeCustom =
    artistId === "saved" ? customs.find((c) => c.id === songId) : undefined;

  const skin = activeCustom ? activeCustom.skin : artist.skin;
  const base = import.meta.env.BASE_URL;
  const imgPos = skin.imagePos ?? "center";
  const faceBg = skin.image
    ? `linear-gradient(180deg, rgba(0,0,0,.10) 0%, rgba(0,0,0,.14) 55%, rgba(0,0,0,.42) 100%), url("${base}${skin.image}") ${imgPos}/cover, ${skin.faceplate}`
    : skin.faceplate;

  async function handleStart() {
    setError(null);
    try {
      if (!engineRef.current) engineRef.current = new PedalEngine();
      await engineRef.current.start();
      applyTone(engineRef.current, tone);
      engineRef.current.setLevel(level);
      engineRef.current.setBypass(bypassed);
      engineRef.current.setCompEnabled(fx.comp);
      engineRef.current.setDriveEnabled(fx.drive);
      engineRef.current.setChorusEnabled(fx.chorus);
      engineRef.current.setDelayEnabled(fx.delay);
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
    engineRef.current?.stopLoop();
    setLoopState("idle");
    await engineRef.current?.stop();
    setRunning(false);
  }

  function toggleLoop() {
    const e = engineRef.current;
    if (!e || !running) return;
    if (loopState === "idle") {
      e.startLoop();
      setLoopState("rec");
    } else if (loopState === "rec") {
      e.finishLoop();
      setLoopState("play");
    } else {
      e.stopLoop();
      setLoopState("idle");
    }
  }

  function selectArtist(id: string) {
    if (id === "shared") {
      if (!shared) return;
      setArtistId("shared");
      setSongId("shared");
      setTone(shared.tone);
      if (engineRef.current) applyTone(engineRef.current, shared.tone);
      return;
    }
    if (id === "saved") {
      if (!customs.length) return;
      const c = customs[0];
      setArtistId("saved");
      setSongId(c.id);
      setTone(c.tone);
      if (engineRef.current) applyTone(engineRef.current, c.tone);
      return;
    }
    const a = ARTISTS.find((x) => x.id === id)!;
    const s = a.songs[0];
    setArtistId(id);
    setSongId(s.id);
    setTone(s.tone);
    if (engineRef.current) applyTone(engineRef.current, s.tone);
  }

  function selectSong(id: string) {
    const s = artist.songs.find((x) => x.id === id);
    if (!s) return;
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
    else if (k === "reverb") e.setReverbMix(v);
    else if (k === "gate") e.setGate(v);
    else if (k === "chorus") e.setChorus(v);
    else if (k === "comp") e.setComp(v);
  }

  function saveCurrent() {
    const name = presetName.trim();
    if (!name) return;
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now());
    const c: Custom = { id, name, tone, skin };
    const next = [...customs, c];
    setCustoms(next);
    saveCustoms(next);
    setPresetName("");
    setArtistId("saved");
    setSongId(id);
  }

  function exportPresets() {
    if (!customs.length) return;
    const blob = new Blob([JSON.stringify(customs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `soundbox-presets-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importPresets(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const incoming = (Array.isArray(parsed) ? parsed : [parsed]) as Custom[];
        // keep only well-formed presets, and drop ids we already have
        const have = new Set(customs.map((c) => c.id));
        const clean = incoming.filter(
          (c) => c && c.id && c.name && c.tone && c.skin && !have.has(c.id)
        );
        if (!clean.length) {
          setShareMsg("nothing new to import");
          setTimeout(() => setShareMsg(""), 2500);
          return;
        }
        const next = [...customs, ...clean];
        setCustoms(next);
        saveCustoms(next);
        setShareMsg(`imported ${clean.length} preset${clean.length > 1 ? "s" : ""}`);
        setTimeout(() => setShareMsg(""), 2500);
      } catch {
        setShareMsg("couldn't read that file");
        setTimeout(() => setShareMsg(""), 2500);
      }
    };
    reader.readAsText(file);
  }

  function deleteCustom(id: string) {
    const next = customs.filter((c) => c.id !== id);
    setCustoms(next);
    saveCustoms(next);
    // fall back to Clean
    setArtistId(DEFAULT_ARTIST);
    setSongId(DEFAULT_SONG);
    const clean = ARTISTS.find((a) => a.id === DEFAULT_ARTIST)!.songs[0];
    setTone(clean.tone);
    if (engineRef.current) applyTone(engineRef.current, clean.tone);
  }

  function onLevel(v: number) {
    setLevel(v);
    engineRef.current?.setLevel(v);
  }

  function toggleCab() {
    const next = !(tone.cab ?? false);
    setTone((prev) => ({ ...prev, cab: next }));
    engineRef.current?.setCab(next);
  }

  function setDist(type: DistType) {
    setTone((prev) => ({ ...prev, dist: type }));
    engineRef.current?.setDistType(type);
  }

  function toggleFx(k: "comp" | "drive" | "chorus" | "delay") {
    setFx((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      const e = engineRef.current;
      if (e) {
        if (k === "comp") e.setCompEnabled(next.comp);
        else if (k === "drive") e.setDriveEnabled(next.drive);
        else if (k === "chorus") e.setChorusEnabled(next.chorus);
        else if (k === "delay") e.setDelayEnabled(next.delay);
      }
      return next;
    });
  }

  function randomTone() {
    const ri = (a: number, b: number) => Math.round(a + Math.random() * (b - a));
    const rf = (a: number, b: number) =>
      +(a + Math.random() * (b - a)).toFixed(2);
    const dists: DistType[] = ["soft", "hard", "fuzz"];
    const nt: Tone = {
      drive: rf(0.1, 0.85),
      low: ri(-8, 8),
      mid: ri(-8, 8),
      high: ri(-8, 8),
      delayMix: rf(0, 0.35),
      delayTime: rf(0.12, 0.5),
      delayFb: rf(0.1, 0.5),
      reverb: rf(0, 0.4),
      gate: 0,
      cab: Math.random() < 0.5,
      dist: dists[Math.floor(Math.random() * dists.length)],
      chorus: rf(0, 0.35),
      comp: rf(0, 0.5),
    };
    setTone(nt);
    if (engineRef.current) applyTone(engineRef.current, nt);
  }

  function shareTone() {
    const label =
      artistId === "shared" && shared
        ? shared.name
        : activeCustom
          ? activeCustom.name
          : `${artist.name} — ${song.name}`;
    const code = encodeTone(label, skin, tone);
    const url = `${location.origin}${location.pathname}#t=${code}`;
    const flash = (m: string) => {
      setShareMsg(m);
      setTimeout(() => setShareMsg(""), 2500);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => flash("link copied!"),
        () => flash("couldn't copy — check the address bar")
      );
    } else {
      flash("copy not supported here");
    }
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
  const faceName =
    artistId === "shared" && shared
      ? shared.name
      : activeCustom
        ? activeCustom.name
        : artist.name;
  const faceTag =
    artistId === "saved"
      ? "★ your preset"
      : artistId === "shared"
        ? "⇄ shared tone"
        : `♪ ${song.name}`;

  return (
    <div className="app">
      <header>
        <h1>
          sound<span className="accent">//</span>box
        </h1>
        <p className="sub">a guitar pedal, coded — Web Audio</p>
      </header>

      {/* artist selector — a single dropdown */}
      <div className="picker">
        <label className="pick" style={{ ["--accent" as string]: skin.accent }}>
          <span className="pick-label">ARTIST</span>
          <select
            className="artist-select"
            value={artistId}
            onChange={(e) => selectArtist(e.target.value)}
          >
            {allArtists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* song selector (or saved presets) */}
      {artist.songs.length > 1 && (
        <div className="songs">
          {artist.songs.map((s) => (
            <button
              key={s.id}
              className={`song ${s.id === songId ? "sel" : ""}`}
              style={{ ["--accent" as string]: skin.accent }}
              onClick={() => selectSong(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* the rig: amp head sitting on a speaker cabinet, then a pedalboard */}
      <div
        className={`rig ${on ? "on" : "off"}`}
        style={{
          ["--accent" as string]: skin.accent,
          ["--ink" as string]: skin.ink,
        }}
      >
        <div className="stack">
        {/* ── amp head ── */}
        <div className="amp" style={{ background: skin.chassis }}>
          <span className="amp-handle" />
          <span className="corner tl" />
          <span className="corner tr" />
          <span className="corner bl" />
          <span className="corner br" />

          <div className="amp-top">
            <div className="amp-logo">SOUND<span>//</span>BOX</div>
            <span className={`jewel ${on ? "lit" : ""}`} />
          </div>

          <div className="amp-panel">
            <div className="amp-screen-wrap">
              <div className="amp-name-row">
                <span className="amp-name">{faceName}</span>
                <span className="amp-tag">{faceTag}</span>
              </div>
              <div className="screen">
                {running && tunerOn ? (
                  <Tuner
                    analyser={engineRef.current!.tunerAnalyser}
                    sampleRate={engineRef.current!.ctx.sampleRate}
                  />
                ) : (
                  <Spectrum analyser={running ? engineRef.current!.analyser : null} />
                )}
              </div>
            </div>

            <div className="amp-knobs">
              <Knob label="GATE" value={tone.gate ?? 0} min={0} max={1} step={0.01}
                display={`${Math.round((tone.gate ?? 0) * 100)}%`} accent={skin.accent}
                onChange={(v) => setToneVal("gate", v)} />
              <Knob label="LOW" value={tone.low} min={-18} max={18} step={1}
                display={`${tone.low > 0 ? "+" : ""}${tone.low}`} accent={skin.accent}
                onChange={(v) => setToneVal("low", v)} />
              <Knob label="MID" value={tone.mid} min={-18} max={18} step={1}
                display={`${tone.mid > 0 ? "+" : ""}${tone.mid}`} accent={skin.accent}
                onChange={(v) => setToneVal("mid", v)} />
              <Knob label="HIGH" value={tone.high} min={-18} max={18} step={1}
                display={`${tone.high > 0 ? "+" : ""}${tone.high}`} accent={skin.accent}
                onChange={(v) => setToneVal("high", v)} />
              <Knob label="REVERB" value={tone.reverb ?? 0} min={0} max={1} step={0.01}
                display={`${Math.round((tone.reverb ?? 0) * 100)}%`} accent={skin.accent}
                onChange={(v) => setToneVal("reverb", v)} />
              <Knob label="MASTER" value={level} min={0} max={1.2} step={0.01}
                display={`${Math.round(level * 100)}%`} accent={skin.accent}
                onChange={onLevel} />
            </div>

            <div className="amp-toggles">
              <button
                className={`toggle ${tone.cab ? "on" : ""}`}
                style={{ ["--accent" as string]: skin.accent }}
                onClick={toggleCab}
              >
                CAB SIM
              </button>
              <button
                className={`toggle ${tunerOn ? "on" : ""}`}
                style={{ ["--accent" as string]: skin.accent }}
                onClick={() => setTunerOn((v) => !v)}
                disabled={!running}
              >
                TUNER
              </button>
            </div>
          </div>
        </div>

        {/* ── 4x12 speaker cabinet (artist art shows through the grille) ── */}
        <div className="cab">
          <div className="grille" style={{ background: faceBg }} />
          <div className="cones">
            <span className="cone" />
            <span className="cone" />
            <span className="cone" />
            <span className="cone" />
          </div>
          <span className="cab-corner tl" />
          <span className="cab-corner tr" />
          <span className="cab-corner bl" />
          <span className="cab-corner br" />
          <div className="cab-badge">{artist.name}</div>
        </div>
        </div>{/* end stack */}

        <div className="controls">
        {/* ── pedalboard ── */}
        <div className="board">
          <div className="board-label">PEDALBOARD</div>
          <div className="pedals">
            {/* COMP */}
            <div
              className={`stompbox ${fx.comp ? "engaged" : ""}`}
              style={{ ["--pc" as string]: "#4a86b0" }}
            >
              <div className="sb-knobs">
                <Knob label="COMP" value={tone.comp ?? 0} min={0} max={1} step={0.01}
                  display={`${Math.round((tone.comp ?? 0) * 100)}%`} accent="#4a86b0"
                  onChange={(v) => setToneVal("comp", v)} />
              </div>
              <div className="sb-name">SQUISH</div>
              <span className={`sb-led ${fx.comp ? "lit" : ""}`} />
              <button className="sb-switch" onClick={() => toggleFx("comp")}
                aria-pressed={fx.comp} title="compressor on/off">
                <span className="sb-cap" />
              </button>
            </div>

            <span className="patch" />

            {/* DRIVE */}
            <div
              className={`stompbox tall ${fx.drive ? "engaged" : ""}`}
              style={{ ["--pc" as string]: "#d98a3d" }}
            >
              <div className="sb-knobs">
                <Knob label="DRIVE" value={tone.drive} min={0} max={1} step={0.01}
                  display={`${Math.round(tone.drive * 100)}%`} accent="#d98a3d"
                  onChange={(v) => setToneVal("drive", v)} />
              </div>
              <div className="seg dist-seg sb-seg">
                {(["soft", "hard", "fuzz"] as const).map((d) => (
                  <button
                    key={d}
                    className={(tone.dist ?? "soft") === d ? "seg-on" : ""}
                    style={{ ["--accent" as string]: "#d98a3d" }}
                    onClick={() => setDist(d)}
                  >
                    {d[0].toUpperCase()}
                  </button>
                ))}
              </div>
              <div className="sb-name">OVERDRIVE</div>
              <span className={`sb-led ${fx.drive ? "lit" : ""}`} />
              <button className="sb-switch" onClick={() => toggleFx("drive")}
                aria-pressed={fx.drive} title="drive on/off">
                <span className="sb-cap" />
              </button>
            </div>

            <span className="patch" />

            {/* CHORUS */}
            <div
              className={`stompbox ${fx.chorus ? "engaged" : ""}`}
              style={{ ["--pc" as string]: "#3aa6a0" }}
            >
              <div className="sb-knobs">
                <Knob label="DEPTH" value={tone.chorus ?? 0} min={0} max={1} step={0.01}
                  display={`${Math.round((tone.chorus ?? 0) * 100)}%`} accent="#3aa6a0"
                  onChange={(v) => setToneVal("chorus", v)} />
              </div>
              <div className="sb-name">SHIMMER</div>
              <span className={`sb-led ${fx.chorus ? "lit" : ""}`} />
              <button className="sb-switch" onClick={() => toggleFx("chorus")}
                aria-pressed={fx.chorus} title="chorus on/off">
                <span className="sb-cap" />
              </button>
            </div>

            <span className="patch" />

            {/* DELAY (a bigger box — three knobs) */}
            <div
              className={`stompbox wide ${fx.delay ? "engaged" : ""}`}
              style={{ ["--pc" as string]: "#6a8f4f" }}
            >
              <div className="sb-knobs">
                <Knob label="MIX" value={tone.delayMix} min={0} max={1} step={0.01}
                  display={`${Math.round(tone.delayMix * 100)}%`} accent="#6a8f4f"
                  onChange={(v) => setToneVal("delayMix", v)} />
                <Knob label="TIME" value={tone.delayTime} min={0.02} max={1} step={0.01}
                  display={`${Math.round(tone.delayTime * 1000)}ms`} accent="#6a8f4f"
                  onChange={(v) => setToneVal("delayTime", v)} />
                <Knob label="RPTS" value={tone.delayFb} min={0} max={0.9} step={0.01}
                  display={`${Math.round(tone.delayFb * 100)}%`} accent="#6a8f4f"
                  onChange={(v) => setToneVal("delayFb", v)} />
              </div>
              <div className="sb-name">ECHO</div>
              <span className={`sb-led ${fx.delay ? "lit" : ""}`} />
              <button className="sb-switch" onClick={() => toggleFx("delay")}
                aria-pressed={fx.delay} title="delay on/off">
                <span className="sb-cap" />
              </button>
            </div>
          </div>

          <button className={`stomp ${on ? "lit" : ""}`} onClick={toggleBypass} disabled={!running}>
            <span className="stomp-ring" />
            {bypassed ? "BYPASS — all off" : "RIG ON"}
          </button>
        </div>

      {/* save the current tone as a preset */}
      <div className="save-row">
        <input
          className="name-in"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          placeholder="name this tone…"
          onKeyDown={(e) => e.key === "Enter" && saveCurrent()}
        />
        <button className="save-btn" onClick={saveCurrent} disabled={!presetName.trim()}>
          save preset
        </button>
        {activeCustom && (
          <button className="del-btn" title="delete this preset"
            onClick={() => deleteCustom(activeCustom.id)}>
            ✕
          </button>
        )}
        <button
          className="io-btn"
          title="export your saved presets to a file"
          onClick={exportPresets}
          disabled={!customs.length}
        >
          ↧ export
        </button>
        <button
          className="io-btn"
          title="import presets from a file"
          onClick={() => fileRef.current?.click()}
        >
          ↥ import
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importPresets(f);
            e.target.value = "";
          }}
        />
      </div>

      <div className="share-row">
        <button className="share-btn" onClick={shareTone}>
          ⇄ share this tone
        </button>
        <button className="share-btn" onClick={randomTone}>
          🎲 random
        </button>
        {shareMsg && <span className="share-msg">{shareMsg}</span>}
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
              <button
                className={`loop ${loopState !== "idle" ? "on" : ""}`}
                onClick={toggleLoop}
                disabled={recording || saving}
              >
                {loopState === "idle"
                  ? "● loop"
                  : loopState === "rec"
                    ? "■ end loop"
                    : "✕ clear loop"}
              </button>
              <button
                className={`rec ${recording ? "on" : ""}`}
                onClick={toggleRecord}
                disabled={saving || loopState !== "idle"}
              >
                {saving ? "saving mp3…" : recording ? "■ stop & save mp3" : "● record"}
              </button>
            </>
          )}
        </div>
      </div>
      </div>{/* end controls */}
      </div>{/* end rig */}

      {error && <p className="error">{error}</p>}

      <footer>
        <p>
          pick an artist &amp; song, tweak the knobs, then name and save your own
          tone — it lands under ★ Saved and sticks around.
        </p>
      </footer>
    </div>
  );
}
