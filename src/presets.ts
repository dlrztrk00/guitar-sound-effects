import type { DistType } from "./audio/engine";

// Presets are two levels: pick an artist (sets the skin), then a song (sets the tone).

export type Tone = {
  drive: number; // 0..1
  low: number; // dB, -18..18
  mid: number;
  high: number;
  delayMix: number; // 0..1
  delayTime: number; // 0..1 (seconds)
  delayFb: number; // 0..0.9
  reverb?: number; // 0..1 (defaults to 0)
  gate?: number; // 0..1 (defaults to 0)
  cab?: boolean; // cabinet/speaker sim (defaults to off)
  dist?: DistType; // distortion character (defaults to "soft")
  chorus?: number; // 0..1 (defaults to 0)
  comp?: number; // 0..1 compressor amount (defaults to 0)
};

export type Skin = {
  chassis: string; // enclosure background (CSS)
  faceplate: string; // faceplate background (CSS) — the fallback
  image?: string; // optional faceplate art, path under public/ (relative to BASE_URL)
  imagePos?: string; // background-position for the art (default "center")
  accent: string; // knobs, LED, indicators
  ink: string; // text on the pedal
};

export type Song = { id: string; name: string; tone: Tone };
export type Artist = { id: string; name: string; skin: Skin; songs: Song[] };

const t = (
  drive: number, low: number, mid: number, high: number,
  delayMix: number, delayTime: number, delayFb: number,
  reverb = 0, gate = 0, cab = false, chorus = 0, comp = 0
): Tone => ({ drive, low, mid, high, delayMix, delayTime, delayFb, reverb, gate, cab, chorus, comp });

export const ARTISTS: Artist[] = [
  {
    id: "clean",
    name: "Clean",
    skin: {
      chassis: "linear-gradient(#20272a, #12181a)",
      faceplate: "radial-gradient(130% 110% at 50% -10%, #1a271c, #0b120d)",
      accent: "#7fe08a",
      ink: "#dbe7d2",
    },
    songs: [{ id: "clean", name: "Clean", tone: t(0, 0, 0, 0, 0, 0.3, 0.35) }],
  },
  {
    id: "top",
    name: "Twenty One Pilots",
    skin: {
      chassis: "linear-gradient(#2a1210, #150706)",
      faceplate: "radial-gradient(130% 110% at 50% -10%, #5a130d, #1a0605)",
      image: "presets/top.jpg",
      accent: "#e5443c",
      ink: "#f2ddd6",
    },
    // songs where there's actually a guitar to shape (not Jumpsuit)
    songs: [
      { id: "shy-away", name: "Shy Away", tone: t(0.45, 0, 2, 4, 0.16, 0.3, 0.3, 0.18) },
      { id: "saturday", name: "Saturday", tone: t(0.28, -2, 3, 3, 0.1, 0.25, 0.2) },
      { id: "the-outside", name: "The Outside", tone: t(0.55, 2, 1, 1, 0.1, 0.28, 0.25) },
      { id: "heathens", name: "Heathens", tone: t(0.34, 4, -2, -2, 0.3, 0.4, 0.4, 0.4) },
    ],
  },
  {
    id: "strokes",
    name: "The Strokes",
    skin: {
      chassis: "linear-gradient(#33281c, #1c150d)",
      faceplate:
        "repeating-linear-gradient(45deg, #2b2118, #2b2118 9px, #261d14 9px, #261d14 18px)",
      image: "presets/strokes.jpg",
      accent: "#e8b64c",
      ink: "#f1e6cf",
    },
    songs: [
      { id: "reptilia", name: "Reptilia", tone: t(0.5, -5, 2, 6, 0.05, 0.22, 0.15) },
      { id: "last-nite", name: "Last Nite", tone: t(0.4, -4, 3, 5, 0.05, 0.2, 0.12) },
      { id: "juicebox", name: "Juicebox", tone: { ...t(0.66, 2, 2, 3, 0.04, 0.2, 0.1), dist: "hard" } },
      { id: "yoli", name: "You Only Live Once", tone: t(0.5, -2, 3, 4, 0.06, 0.24, 0.15) },
    ],
  },
  {
    id: "am",
    name: "Arctic Monkeys",
    skin: {
      chassis: "linear-gradient(#20182a, #100a16)",
      faceplate: "radial-gradient(130% 110% at 50% -10%, #341640, #120a18)",
      image: "presets/am.jpg",
      accent: "#c65b7e",
      ink: "#ecd8e6",
    },
    songs: [
      { id: "diwk", name: "Do I Wanna Know?", tone: { ...t(0.6, 4, 1, 0, 0.1, 0.3, 0.25), dist: "fuzz" } },
      { id: "ru-mine", name: "R U Mine?", tone: { ...t(0.75, 3, 2, 0, 0.08, 0.25, 0.2), dist: "fuzz" } },
      { id: "brianstorm", name: "Brianstorm", tone: t(0.62, 0, 3, 4, 0.06, 0.2, 0.15) },
      { id: "505", name: "505", tone: t(0.35, 1, 1, 1, 0.16, 0.35, 0.35, 0.28) },
    ],
  },
  {
    id: "catfish",
    name: "Catfish & the Bottlemen",
    skin: {
      chassis: "linear-gradient(#14202a, #0a1016)",
      faceplate: "radial-gradient(130% 110% at 50% -10%, #16323f, #0a1218)",
      image: "presets/catfish.jpg",
      imagePos: "center 25%",
      accent: "#5fb0c9",
      ink: "#d6ecf2",
    },
    songs: [
      { id: "kathleen", name: "Kathleen", tone: t(0.55, -1, 3, 4, 0.08, 0.24, 0.18) },
      { id: "cocoon", name: "Cocoon", tone: t(0.4, 0, 2, 4, 0.12, 0.3, 0.25, 0.2) },
      { id: "soundcheck", name: "Soundcheck", tone: t(0.6, 2, 2, 2, 0.08, 0.24, 0.2) },
      { id: "seven", name: "7", tone: t(0.5, 1, 3, 3, 0.1, 0.28, 0.22) },
    ],
  },
  {
    id: "fike",
    name: "Dominic Fike",
    skin: {
      chassis: "linear-gradient(#2a1c12, #150c07)",
      faceplate: "radial-gradient(130% 110% at 50% -10%, #5a3418, #1c1008)",
      image: "presets/fike.jpg",
      imagePos: "center 30%",
      accent: "#e69a3c",
      ink: "#f2e2cf",
    },
    // clean, bright, jangly bedroom-pop — lots of chorus shimmer & light echo
    songs: [
      { id: "3-nights", name: "3 Nights", tone: t(0.18, -1, 1, 4, 0.12, 0.28, 0.25, 0.22, 0, false, 0.3, 0.25) },
      { id: "chicken-tenders", name: "Chicken Tenders", tone: t(0.15, -2, 2, 5, 0.08, 0.22, 0.15, 0.14, 0, false, 0.18, 0.4) },
      { id: "babydoll", name: "Babydoll", tone: t(0.34, 2, 2, 1, 0.1, 0.3, 0.25, 0.3, 0, false, 0.2, 0.2) },
      { id: "phone-numbers", name: "Phone Numbers", tone: t(0.2, 0, 1, 3, 0.16, 0.34, 0.3, 0.28, 0, false, 0.35, 0.2) },
      { id: "westcoast-collective", name: "Westcoast Collective", tone: t(0.22, 1, 1, 3, 0.12, 0.3, 0.28, 0.26, 0, false, 0.3, 0.22) },
      { id: "king-of-everything", name: "King of Everything", tone: t(0.4, 1, 3, 2, 0.1, 0.28, 0.25, 0.2, 0, false, 0.18, 0.2) },
      { id: "misses", name: "Misses", tone: t(0.2, 2, 1, 1, 0.14, 0.34, 0.3, 0.34, 0, false, 0.28, 0.2) },
      { id: "4x4", name: "4x4", tone: t(0.16, -1, 2, 5, 0.08, 0.24, 0.18, 0.16, 0, false, 0.22, 0.35) },
    ],
  },
  {
    id: "fender",
    name: "Sam Fender",
    skin: {
      chassis: "linear-gradient(#2a1414, #150807)",
      faceplate: "radial-gradient(130% 110% at 50% -10%, #5a1c18, #1a0807)",
      image: "presets/fender.jpg",
      imagePos: "center 32%",
      accent: "#d94a3f",
      ink: "#f2d9d3",
    },
    // bright, driven heartland-rock Strat — chime, jangle & anthemic delay
    songs: [
      { id: "seventeen", name: "Seventeen Going Under", tone: t(0.42, 0, 2, 4, 0.1, 0.28, 0.28, 0.22) },
      { id: "hypersonic", name: "Hypersonic Missiles", tone: t(0.5, 1, 2, 3, 0.08, 0.25, 0.22, 0.18) },
      { id: "will-we-talk", name: "Will We Talk?", tone: t(0.4, -1, 2, 5, 0.06, 0.22, 0.2, 0.16) },
      { id: "getting-started", name: "Getting Started", tone: t(0.48, 1, 3, 2, 0.08, 0.26, 0.24, 0.18) },
      { id: "the-borders", name: "The Borders", tone: t(0.38, 1, 1, 3, 0.16, 0.36, 0.34, 0.28) },
    ],
  },
  {
    id: "5sos",
    name: "5 Seconds of Summer",
    skin: {
      chassis: "linear-gradient(#141a1a, #080b0b)",
      faceplate: "radial-gradient(130% 110% at 50% -10%, #16302c, #070d0c)",
      image: "presets/5sos.jpg?v=2",
      imagePos: "center 38%",
      accent: "#4fb0a0",
      ink: "#dcefe9",
    },
    // punchy pop-punk power chords — bright, crunchy, cab-driven
    songs: [
      { id: "slsp", name: "She Looks So Perfect", tone: t(0.6, 2, 1, 3, 0.05, 0.2, 0.15, 0.12, 0, true) },
      { id: "youngblood", name: "Youngblood", tone: t(0.5, 3, 2, 1, 0.06, 0.22, 0.18, 0.1, 0, true) },
      { id: "shes-kinda-hot", name: "She's Kinda Hot", tone: { ...t(0.68, 2, 2, 3, 0.04, 0.2, 0.12, 0.1, 0, true), dist: "hard" } },
      { id: "jet-black-heart", name: "Jet Black Heart", tone: t(0.55, 2, 1, 2, 0.1, 0.28, 0.25, 0.24, 0, true) },
      { id: "dont-stop", name: "Don't Stop", tone: t(0.58, 1, 2, 3, 0.05, 0.2, 0.15, 0.12, 0, true) },
    ],
  },
];

export const DEFAULT_ARTIST = "clean";
export const DEFAULT_SONG = "clean";

// ── user-saved presets (localStorage) ───────────────────────────
export type Custom = { id: string; name: string; tone: Tone; skin: Skin };

const LS_KEY = "soundbox.customs.v1";

export function loadCustoms(): Custom[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Custom[]) : [];
  } catch {
    return [];
  }
}

export function saveCustoms(list: Custom[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked — ignore */
  }
}

// ── shareable tone links ────────────────────────────────────────
export type Shared = { name: string; skin: Skin; tone: Tone };

function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(b)));
}

export function encodeTone(name: string, skin: Skin, tone: Tone): string {
  return b64urlEncode(JSON.stringify({ n: name, s: skin, t: tone }));
}

export function decodeTone(code: string): Shared | null {
  try {
    const p = JSON.parse(b64urlDecode(code));
    if (!p || !p.t || !p.s) return null;
    return { name: p.n ?? "Shared tone", skin: p.s as Skin, tone: p.t as Tone };
  } catch {
    return null;
  }
}

export function sharedFromHash(): Shared | null {
  if (typeof location === "undefined") return null;
  const m = location.hash.match(/[#&]t=([^&]+)/);
  return m ? decodeTone(m[1]) : null;
}

export const SAVED_SKIN: Skin = {
  chassis: "linear-gradient(#26262c, #141419)",
  faceplate: "radial-gradient(130% 110% at 50% -10%, #2b2b33, #121216)",
  accent: "#d9c37a",
  ink: "#efeae0",
};
