// GaláxiaCut — tipos do projeto de edição
export type ClipKind = "video" | "image" | "audio" | "text";
export type TrackKind = "video" | "audio" | "text";

/** Palavra com tempo de fala (karaokê da legenda). Tempos relativos ao INÍCIO do clipe. */
export interface KaraokeWord {
  w: string;
  s: number; // começo (s, relativo ao clipe)
  e: number; // fim (s, relativo ao clipe)
}

export interface TextProps {
  content: string;
  font: string;
  size: number; // px no espaço do projeto
  color: string;
  bold: boolean;
  italic: boolean;
  align: "left" | "center" | "right";
  strokeColor: string;
  strokeW: number;
  shadow: boolean;
  bg: string; // "" = sem caixa
  bgPad: number;
  bgRadius: number;
  // ---- karaokê (destacar a palavra sendo falada) ----
  words?: KaraokeWord[]; // tempos por palavra (gerado pela IA ou estimado)
  highlight: boolean; // destacar palavra atual
  highlightColor: string; // cor da palavra ativa ("" = usar highlightGradient)
  highlightGradient: string; // cores separadas por "," p/ modo arco-íris
  highlightScale: number; // 1 = normal, 1.15 = pop
  highlightAnim: "none" | "pop" | "bounce" | "pulse";
}

// ---------- transições ----------
export type TransitionType =
  | "none"
  | "fade" // fade passando pelo preto
  | "dissolve" // crossfade direto
  | "slideLeft" // entra empurrando da direita
  | "slideRight" // entra empurrando da esquerda
  | "wipeLeft" // cortina revelando da esquerda
  | "wipeRight" // cortina revelando da direita
  | "zoom" // zoom in entrando
  | "flash" // clarão branco
  | "blurIn"; // do borrado pro nítido

export interface Transition {
  type: TransitionType;
  duration: number; // segundos
}

export const TRANSITIONS: { type: TransitionType; label: string; icon: string }[] = [
  { type: "none", label: "Nenhuma", icon: "∅" },
  { type: "dissolve", label: "Dissolver", icon: "◧" },
  { type: "fade", label: "Fade preto", icon: "◐" },
  { type: "slideLeft", label: "Deslizar ←", icon: "⇤" },
  { type: "slideRight", label: "Deslizar →", icon: "⇥" },
  { type: "wipeLeft", label: "Cortina ←", icon: "▤" },
  { type: "wipeRight", label: "Cortina →", icon: "▥" },
  { type: "zoom", label: "Zoom", icon: "⤢" },
  { type: "flash", label: "Clarão", icon: "✦" },
  { type: "blurIn", label: "Desfoque", icon: "≈" },
];

export interface Clip {
  id: string;
  kind: ClipKind;
  mediaId?: string;
  trackId: string;
  start: number; // segundos na timeline
  duration: number; // segundos na timeline (já com speed aplicada)
  inPoint: number; // segundos na fonte
  outPoint: number; // segundos na fonte
  x: number; // -1..1
  y: number; // -1..1
  /** legendas: true = posição própria (ignora a posição global das legendas) */
  posLock?: boolean;
  /** true = é legenda gerada (segue a posição global das legendas) */
  isCaption?: boolean;
  /** vídeo: true = o áudio foi destacado pra uma faixa de áudio (clipes extraídos não mostram waveform) */
  audioDetached?: boolean;
  /** vídeo: true = não desenha o quadro (só o áudio toca) — usado pelo detector de silêncio */
  videoHidden?: boolean;
  scale: number;
  rotation: number; // graus
  opacity: number; // 0..1
  brightness: number; // 1 = original
  contrast: number;
  saturation: number;
  blur: number; // px @1080
  hue: number; // graus
  sepia: number; // 0..1
  grayscale: number; // 0..1
  speed: number; // 0.25..4
  fadeIn: number; // segundos
  fadeOut: number;
  volume: number; // 0..2
  muted: boolean;
  enhance: boolean; // melhoria de áudio (highpass + compressor)
  transitionIn?: Transition; // transição na entrada (na junção com o clipe anterior da faixa)
  text?: TextProps;
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
}

export interface ProjectMeta {
  name: string;
  width: number;
  height: number;
  fps: number;
}

export interface MediaMeta {
  id: string;
  name: string;
  kind: "video" | "image" | "audio";
  duration: number;
  width: number;
  height: number;
  thumbnail?: string; // dataURL
  peaks?: number[]; // picos de áudio 0..1
  missing?: boolean; // blob não disponível (após recarregar)
  decodeError?: boolean; // o navegador não consegue decodificar este arquivo (formato/exceção)
  source?: "local" | "stock";
  stockUrl?: string;
  // ---- licença / direitos autorais ----
  license?: string; // "cc0", "by", "by-nc", "pdm", "pexels", "unknown"...
  licenseLabel?: string; // texto curto p/ exibir
  creator?: string; // autor (pra dar crédito)
}

/** Nível de risco de direito autoral → cor do selo. */
export type LicenseLevel = "free" | "credit" | "nc" | "unknown";
export const LICENSE_STYLE: Record<LicenseLevel, { label: string; cls: string; title: string }> = {
  free: { label: "Livre", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400", title: "Licença aberta — pode usar (CC0/domínio público e afins)" },
  credit: { label: "Crédito", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400", title: "Creative Commons com atribuição — cite o autor na descrição" },
  nc: { label: "Não comercial", cls: "border-orange-500/40 bg-orange-500/10 text-orange-400", title: "CC não-comercial — cuidado se o vídeo for monetizado" },
  unknown: { label: "Possível ©", cls: "border-red-500/40 bg-red-500/10 text-red-400", title: "Licença desconhecida — trate como possíveis direitos autorais" },
};

export function licenseLevel(license?: string): LicenseLevel {
  if (!license) return "unknown";
  const l = license.toLowerCase();
  if (l.includes("cc0") || l.includes("pdm") || l.includes("public") || l.includes("pexels") || l.includes("pixabay") || l.includes("domínio")) return "free";
  if (l.includes("nc") || l.includes("non") || l.includes("não comercial")) return "nc";
  if (l.includes("by") || l.includes("cc") || l.includes("credit")) return "credit";
  return "unknown";
}

export const ASPECTS: Record<string, { w: number; h: number; label: string }> = {
  "9:16": { w: 1080, h: 1920, label: "Vertical (Shorts/Reels/TikTok)" },
  "1:1": { w: 1080, h: 1080, label: "Quadrado (feed)" },
  "16:9": { w: 1920, h: 1080, label: "Horizontal (YouTube)" },
};

/** Todos os formatos de projeto disponíveis na criação (com quadradinho visual). */
export interface AspectChoice {
  key: string;
  w: number;
  h: number;
  label: string;
  hint: string;
  main?: boolean; // aparece como "principal" na tela de novo projeto
}

export const ASPECT_CHOICES: AspectChoice[] = [
  { key: "9:16", w: 1080, h: 1920, label: "9:16", hint: "Shorts · Reels · TikTok", main: true },
  { key: "16:9", w: 1920, h: 1080, label: "16:9", hint: "YouTube · widescreen", main: true },
  { key: "1:1", w: 1080, h: 1080, label: "1:1", hint: "Quadrado (feed)", main: true },
  { key: "4:5", w: 1080, h: 1350, label: "4:5", hint: "Feed do Instagram" },
  { key: "4:3", w: 1440, h: 1080, label: "4:3", hint: "Clássico / gameplay antigo" },
  { key: "3:2", w: 1620, h: 1080, label: "3:2", hint: "Foto / documentary" },
  { key: "21:9", w: 2560, h: 1080, label: "21:9", hint: "Cinema ultrawide" },
  { key: "5:4", w: 1350, h: 1080, label: "5:4", hint: "Retrato suave" },
];

/** chave do ASPECTS que melhor casa com uma proporção w/h (ou null se nenhuma bate). */
export function aspectKeyOf(w: number, h: number): string | null {
  if (!w || !h) return null;
  const r = w / h;
  for (const [k, a] of Object.entries(ASPECTS)) {
    if (Math.abs(r - a.w / a.h) < 0.02) return k;
  }
  return null;
}

/** diferença relativa entre duas proporções (0 = idênticas). */
export function aspectDiff(w1: number, h1: number, w2: number, h2: number): number {
  if (!w1 || !h1 || !w2 || !h2) return 0;
  return Math.abs(w1 / h1 - w2 / h2) / Math.max(w1 / h1, w2 / h2);
}

/** Fontes que já vêm no sistema/Google Fonts — o preview mostra o jeitão real. */
export const FONTS = [
  { value: "Impact, Haettenschweiler, 'Arial Black', sans-serif", label: "Impact (thumbnail)" },
  { value: "Anton, Impact, sans-serif", label: "Anton" },
  { value: "Bangers, Impact, cursive", label: "Bangers (quadrinho)" },
  { value: "'Luckiest Guy', cursive", label: "Luckiest Guy (gordinho)" },
  { value: "'Bebas Neue', Arial, sans-serif", label: "Bebas Neue" },
  { value: "'Arial Black', Arial, sans-serif", label: "Arial Black" },
  { value: "Arial, Helvetica, sans-serif", label: "Arial" },
  { value: "Verdana, Geneva, sans-serif", label: "Verdana" },
  { value: "Georgia, 'Times New Roman', serif", label: "Georgia" },
  { value: "'Courier New', Courier, monospace", label: "Courier New" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet MS" },
  { value: "'Comic Sans MS', 'Comic Sans', cursive", label: "Comic Sans" },
];

export const TEXT_PRESETS: { name: string; props: Partial<TextProps> }[] = [
  {
    name: "Estilo thumbnail",
    props: {
      font: FONTS[0].value,
      size: 96,
      color: "#FACC15",
      strokeColor: "#000000",
      strokeW: 12,
      shadow: true,
      bold: true,
    },
  },
  {
    name: "Legenda padrão",
    props: {
      font: FONTS[6].value,
      size: 64,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeW: 4,
      shadow: false,
      bg: "#00000099",
      bgPad: 18,
      bold: true,
    },
  },
  {
    name: "Destaque verde",
    props: {
      font: FONTS[5].value,
      size: 72,
      color: "#0B1220",
      bg: "#22C55E",
      bgPad: 22,
      strokeW: 0,
      shadow: true,
    },
  },
];

/**
 * Estilos de LEGENDA estilo CapCut — usados nas legendas automáticas.
 * Cada um define o look + como a palavra atual "dança".
 */
export interface CaptionPreset {
  id: string;
  name: string;
  props: Partial<TextProps>;
}

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: "amarelo",
    name: "Amarelão",
    props: {
      font: "Anton, Impact, sans-serif",
      size: 72,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeW: 10,
      shadow: true,
      bold: true,
      highlight: true,
      highlightColor: "#FACC15",
      highlightScale: 1.18,
      highlightAnim: "pop",
    },
  },
  {
    id: "karaoke-verde",
    name: "Karaokê verde",
    props: {
      font: "Anton, Impact, sans-serif",
      size: 72,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeW: 9,
      shadow: true,
      highlight: true,
      highlightColor: "#22C55E",
      highlightScale: 1.12,
      highlightAnim: "bounce",
    },
  },
  {
    id: "arcoiris",
    name: "Arco-íris",
    props: {
      font: "'Luckiest Guy', cursive",
      size: 68,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeW: 9,
      shadow: true,
      highlight: true,
      highlightGradient: "#F87171,#FACC15,#4ADE80,#60A5FA,#C084FC",
      highlightScale: 1.15,
      highlightAnim: "pop",
    },
  },
  {
    id: "branco",
    name: "Branco clássico",
    props: {
      font: "Arial, Helvetica, sans-serif",
      size: 60,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeW: 5,
      shadow: true,
      bold: true,
      highlight: true,
      highlightColor: "#FDE047",
      highlightScale: 1.08,
      highlightAnim: "pulse",
    },
  },
  {
    id: "caixa",
    name: "Caixa escura",
    props: {
      font: "Arial, Helvetica, sans-serif",
      size: 56,
      color: "#FFFFFF",
      strokeW: 0,
      shadow: false,
      bg: "#000000CC",
      bgPad: 22,
      bgRadius: 12,
      bold: true,
      highlight: true,
      highlightColor: "#7DD3FC",
      highlightScale: 1.06,
      highlightAnim: "none",
    },
  },
  {
    id: "neon",
    name: "Neon rosa",
    props: {
      font: "Bebas Neue, Arial, sans-serif",
      size: 78,
      color: "#FFFFFF",
      strokeColor: "#831843",
      strokeW: 8,
      shadow: true,
      highlight: true,
      highlightColor: "#F472B6",
      highlightScale: 1.2,
      highlightAnim: "pop",
    },
  },
  {
    id: "vermelho",
    name: "Alerta vermelho",
    props: {
      font: "'Luckiest Guy', cursive",
      size: 66,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeW: 10,
      shadow: true,
      highlight: true,
      highlightColor: "#EF4444",
      highlightScale: 1.2,
      highlightAnim: "bounce",
    },
  },
  {
    id: "thumbnail",
    name: "Thumbnail amarelo",
    props: {
      font: "Impact, Haettenschweiler, 'Arial Black', sans-serif",
      size: 80,
      color: "#FACC15",
      strokeColor: "#000000",
      strokeW: 12,
      shadow: true,
      bold: true,
      highlight: false,
    },
  },
];

/** Estilo de legenda padrão (escolhido nas configurações). */
export const DEFAULT_CAPTION_PRESET = CAPTION_PRESETS[0];

export function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultTextProps(): TextProps {
  return {
    content: "Texto do GaláxiaCut",
    font: FONTS[6].value,
    size: 64,
    color: "#FFFFFF",
    bold: true,
    italic: false,
    align: "center",
    strokeColor: "#000000",
    strokeW: 4,
    shadow: true,
    bg: "",
    bgPad: 14,
    bgRadius: 10,
    highlight: false,
    highlightColor: "#FACC15",
    highlightGradient: "",
    highlightScale: 1.15,
    highlightAnim: "pop",
  };
}

export function makeClip(partial: Partial<Clip> & Pick<Clip, "kind" | "trackId" | "start" | "duration">): Clip {
  return {
    id: uid(),
    mediaId: undefined,
    inPoint: 0,
    outPoint: 0,
    x: 0,
    y: 0,
    scale: 1,
    rotation: 0,
    opacity: 1,
    brightness: 1,
    contrast: 1,
    saturation: 1,
    blur: 0,
    hue: 0,
    sepia: 0,
    grayscale: 0,
    speed: 1,
    fadeIn: 0,
    fadeOut: 0,
    volume: 1,
    muted: false,
    enhance: false,
    ...partial,
  };
}

export function defaultTracks(): Track[] {
  return [
    { id: "T-texto", kind: "text", name: "Texto", muted: false, hidden: false },
    { id: "V3", kind: "video", name: "Vídeo 3", muted: false, hidden: false },
    { id: "V2", kind: "video", name: "Vídeo 2", muted: false, hidden: false },
    { id: "V1", kind: "video", name: "Vídeo 1 (principal)", muted: false, hidden: false },
    { id: "A3", kind: "audio", name: "Áudio 3", muted: false, hidden: false },
    { id: "A2", kind: "audio", name: "Áudio 2", muted: false, hidden: false },
    { id: "A1", kind: "audio", name: "Áudio 1 (música)", muted: false, hidden: false },
  ];
}

export function clipEnd(c: Clip): number {
  return c.start + c.duration;
}

export function fadeEnvelope(c: Clip, t: number): number {
  const a = c.fadeIn > 0 ? (t - c.start) / c.fadeIn : 1;
  const b = c.fadeOut > 0 ? (clipEnd(c) - t) / c.fadeOut : 1;
  return Math.max(0, Math.min(1, a, b));
}

export function fmtTime(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  const d = Math.floor((t % 1) * 10);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${d}`;
}

export function fmtSrtTime(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  const ms = Math.round((t % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}
