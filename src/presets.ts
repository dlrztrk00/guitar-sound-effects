// A preset is a tone (knob settings) + a skin (how the pedal looks).
// Selecting one re-dials the pedal AND re-skins it.

export type Tone = {
  drive: number; // 0..1
  low: number; // dB, -18..18
  mid: number;
  high: number;
  delayMix: number; // 0..1
  delayTime: number; // 0..1 (seconds)
  delayFb: number; // 0..0.9
};

export type Skin = {
  chassis: string; // enclosure background (CSS)
  faceplate: string; // faceplate background (CSS gradient/pattern) — the fallback
  image?: string; // optional faceplate art, path under public/ (relative to BASE_URL)
  accent: string; // knobs, LED, indicators
  ink: string; // text on the pedal
};

export type Preset = {
  id: string;
  name: string;
  tag: string; // one-line vibe
  tone: Tone;
  skin: Skin;
};

export const PRESETS: Preset[] = [
  {
    id: "clean",
    name: "Clean",
    tag: "no drive · your untouched signal",
    tone: { drive: 0, low: 0, mid: 0, high: 0, delayMix: 0, delayTime: 0.3, delayFb: 0.35 },
    skin: {
      chassis: "linear-gradient(#20272a, #12181a)",
      faceplate: "radial-gradient(130% 110% at 50% -10%, #1a271c, #0b120d)",
      accent: "#7fe08a",
      ink: "#dbe7d2",
    },
  },
  {
    id: "top",
    name: "Twenty One Pilots",
    tag: "trench · heavy dark fuzz, bass-driven (Jumpsuit-ish)",
    tone: { drive: 0.86, low: 7, mid: -2, high: -3, delayMix: 0.07, delayTime: 0.3, delayFb: 0.2 },
    skin: {
      chassis: "linear-gradient(#2a1210, #150706)",
      // red/black flame fallback until the photo is dropped in
      faceplate: "radial-gradient(130% 110% at 50% -10%, #5a130d, #1a0605)",
      image: "presets/top.jpg",
      accent: "#e5443c",
      ink: "#f2ddd6",
    },
  },
  {
    id: "strokes",
    name: "The Strokes",
    tag: "garage crunch · bright, thin telecaster bite (Reptilia-ish)",
    tone: { drive: 0.5, low: -6, mid: 2, high: 6, delayMix: 0.05, delayTime: 0.22, delayFb: 0.15 },
    skin: {
      chassis: "linear-gradient(#33281c, #1c150d)",
      faceplate:
        "repeating-linear-gradient(45deg, #2b2118, #2b2118 9px, #261d14 9px, #261d14 18px)",
      accent: "#e8b64c",
      ink: "#f1e6cf",
    },
  },
  {
    id: "am",
    name: "Arctic Monkeys",
    tag: "AM fuzz · thick, saturated",
    tone: { drive: 0.75, low: 4, mid: 1, high: -1, delayMix: 0.15, delayTime: 0.3, delayFb: 0.3 },
    skin: {
      chassis: "linear-gradient(#20182a, #100a16)",
      faceplate: "radial-gradient(130% 110% at 50% -10%, #341640, #120a18)",
      accent: "#c65b7e",
      ink: "#ecd8e6",
    },
  },
];

export const DEFAULT_PRESET = "clean";
