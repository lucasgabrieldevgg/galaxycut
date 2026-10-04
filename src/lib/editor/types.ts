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
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetY?: number;
  bg: string; // "" = sem caixa
  bgPad: number;
  bgRadius: number;
  // ---- efeito de máquina de escrever (typewriter) ----
  typewriter?: boolean;
  typewriterSpeed?: number;
  // ---- karaokê / destaque de palavra ativa ----
  words?: KaraokeWord[]; // tempos por palavra (gerado pela IA ou estimado)
  highlight: boolean; // destacar palavra atual
  highlightColor: string; // cor da palavra ativa ("" = usar highlightGradient)
  highlightGradient: string; // cores separadas por "," p/ modo arco-íris
  highlightScale: number; // 1 = normal, 1.15 = pop
  highlightAnim: "none" | "colorOnly" | "pop" | "bounce" | "pulse" | "box" | "glow" | "typewriter";
  highlightBg?: string; // cor de fundo da palavra ativa (quando highlightAnim === "box")
  highlightBgPad?: number;
  highlightBgRadius?: number;
  uppercase?: boolean;
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

// ---------- KEYFRAMES (CapCut Quadros-chave ◆) ----------
export type KeyframeEasing = "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring" | "bounce";

export interface Keyframe {
  id: string;
  time: number; // segundos relativos ao início do clipe (0..duration)
  x?: number; // posição horizontal -1..1
  y?: number; // posição vertical -1..1
  scale?: number; // escala/zoom (0.1..4)
  rotation?: number; // rotação em graus (-180..180)
  opacity?: number; // opacidade 0..1
  blur?: number; // desfoque px @1080
  brightness?: number; // brilho
  contrast?: number; // contraste
  saturation?: number; // saturação
  hue?: number; // matiz
  easing?: KeyframeEasing;
}

// ---------- ANIMAÇÕES PRONTAS (CapCut Estilo 1-clique) ----------
export type AnimationInType =
  | "none"
  | "typewriter"
  | "zoomIn"
  | "zoomOut"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "slideDown"
  | "spinIn"
  | "bounceIn"
  | "fadeIn"
  | "wipeRight"
  | "dropIn"
  | "popIn"
  | "blurIn"
  | "shakeIn"
  | "flipInX"
  | "flipInY";

export type AnimationOutType =
  | "none"
  | "zoomOut"
  | "slideLeft"
  | "slideRight"
  | "slideUp"
  | "slideDown"
  | "spinOut"
  | "fadeOut"
  | "sinkDown"
  | "blurOut"
  | "popOut";

export type AnimationComboType =
  | "none"
  | "pulse"
  | "float"
  | "shake"
  | "swing"
  | "spin"
  | "heartbeat"
  | "glitchHop"
  | "wave"
  | "breathe"
  | "pendulum";

export interface ClipAnimation {
  inType?: AnimationInType;
  inDuration?: number; // segundos (ex: 0.5)
  outType?: AnimationOutType;
  outDuration?: number; // segundos (ex: 0.5)
  comboType?: AnimationComboType;
  comboSpeed?: number; // 0.5..2 (default 1)
}

export const ANIMATIONS_IN: { type: AnimationInType; label: string; icon: string }[] = [
  { type: "none", label: "Nenhuma", icon: "∅" },
  { type: "typewriter", label: "Máquina de Escrever", icon: "⌨️" },
  { type: "zoomIn", label: "Zoom Entrada", icon: "🔍" },
  { type: "zoomOut", label: "Zoom Afastando", icon: "🔎" },
  { type: "slideLeft", label: "Deslizar Esquerda", icon: "⬅️" },
  { type: "slideRight", label: "Deslizar Direita", icon: "➡️" },
  { type: "slideUp", label: "Subir", icon: "⬆️" },
  { type: "slideDown", label: "Descer", icon: "⬇️" },
  { type: "spinIn", label: "Giro 360°", icon: "🔄" },
  { type: "bounceIn", label: "Pulo Elástico", icon: "⚡" },
  { type: "fadeIn", label: "Fade Suave", icon: "✨" },
  { type: "wipeRight", label: "Cortina", icon: "📑" },
  { type: "dropIn", label: "Queda de Cima", icon: "🎯" },
  { type: "popIn", label: "Pop / Impacto", icon: "💥" },
  { type: "blurIn", label: "Foco Nítido", icon: "🌫️" },
  { type: "shakeIn", label: "Entrada com Tremor", icon: "📳" },
  { type: "flipInX", label: "Giro 3D Vertical", icon: "🔁" },
  { type: "flipInY", label: "Giro 3D Horizontal", icon: "🔂" },
];

export const ANIMATIONS_OUT: { type: AnimationOutType; label: string; icon: string }[] = [
  { type: "none", label: "Nenhuma", icon: "∅" },
  { type: "zoomOut", label: "Zoom Saída", icon: "🔍" },
  { type: "slideLeft", label: "Sair Esquerda", icon: "⬅️" },
  { type: "slideRight", label: "Sair Direita", icon: "➡️" },
  { type: "slideUp", label: "Subir Fora", icon: "⬆️" },
  { type: "slideDown", label: "Descer Fora", icon: "⬇️" },
  { type: "spinOut", label: "Giro Saída", icon: "🔄" },
  { type: "fadeOut", label: "Fade Saída", icon: "✨" },
  { type: "sinkDown", label: "Afundar", icon: "⚓" },
  { type: "blurOut", label: "Desfoque Saída", icon: "🌫️" },
  { type: "popOut", label: "Encolher Rápido", icon: "💥" },
];

export const ANIMATIONS_COMBO: { type: AnimationComboType; label: string; icon: string }[] = [
  { type: "none", label: "Nenhum", icon: "∅" },
  { type: "pulse", label: "Pulsar Batida", icon: "💓" },
  { type: "float", label: "Flutuar Suave", icon: "🎈" },
  { type: "shake", label: "Vibração Contínua", icon: "📳" },
  { type: "swing", label: "Balanço Pêndulo", icon: "🔔" },
  { type: "spin", label: "Giro Contínuo", icon: "🎡" },
  { type: "heartbeat", label: "Batimento Cardíaco", icon: "❤️" },
  { type: "glitchHop", label: "Glitch Pulando", icon: "👾" },
  { type: "wave", label: "Onda Senoidal", icon: "🌊" },
  { type: "breathe", label: "Respiração Zoom", icon: "🫁" },
  { type: "pendulum", label: "Pêndulo Lateral", icon: "🕰️" },
];

// ---------- EFEITOS VISUAIS (Continuous Post-Processing Effects) ----------
export type EffectType =
  | "shake"
  | "glitch"
  | "chromatic"
  | "vhs"
  | "flash"
  | "glow"
  | "vignette"
  | "radialBlur"
  | "pixelate"
  | "lightLeak"
  | "wave"
  | "fisheye"
  | "thermal"
  | "filmGrain"
  | "neonEdge"
  | "mirror"
  | "tiltShift"
  | "cyberpunk"
  | "noir"
  | "tealOrange"
  | "goldenHour"
  | "matrix"
  | "invert"
  | "duotone"
  | "emboss";

export interface ClipEffect {
  id: string;
  type: EffectType;
  enabled: boolean;
  intensity: number; // 0..2 (1 = padrão)
  speed?: number; // 0.1..3 (1 = normal)
  start?: number; // início relativo ao clipe em segundos (ex: 0 = início)
  duration?: number; // duração do efeito em segundos (undefined = clipe inteiro)
  params?: Record<string, number | string | boolean>;
}

export interface EffectMeta {
  type: EffectType;
  name: string;
  category: "motion" | "retro" | "light" | "stylize";
  icon: string;
  description: string;
  defaultIntensity: number;
}

export const EFFECT_CATALOG: EffectMeta[] = [
  // Impacto & Movimento
  { type: "shake", name: "Tremor de Câmera", category: "motion", icon: "📳", description: "Vibração e solavancos para ação, batidas musicais e sustos", defaultIntensity: 1 },
  { type: "glitch", name: "Glitch Digital", category: "motion", icon: "👾", description: "Distorção cibernética com cortes de linhas e interferência RGB", defaultIntensity: 1 },
  { type: "chromatic", name: "RGB Split (Aberração)", category: "motion", icon: "🌈", description: "Separação estilizada de canais vermelho, verde e azul", defaultIntensity: 1 },
  { type: "flash", name: "Flash Estroboscópico", category: "motion", icon: "⚡", description: "Clarões intensos periódicos para o ritmo das batidas", defaultIntensity: 1 },
  { type: "radialBlur", name: "Desfoque de Impacto", category: "motion", icon: "💥", description: "Zoom radial explosivo do centro para fora", defaultIntensity: 1 },
  { type: "wave", name: "Onda Líquida", category: "motion", icon: "🌊", description: "Distorção senoidal ondulada simulando água ou calor", defaultIntensity: 1 },

  // Retrô & VHS
  { type: "vhs", name: "Fita VHS / TV Antiga", category: "retro", icon: "📼", description: "Linhas de scanlines horizontais, ruído magnético e look vintage anos 80", defaultIntensity: 1 },
  { type: "filmGrain", name: "Granulação de Cinema", category: "retro", icon: "🎞️", description: "Textura orgânica de película cinematográfica 35mm", defaultIntensity: 1 },
  { type: "matrix", name: "Código Matrix", category: "retro", icon: "💻", description: "Tonalidade verde futurista com visual hacker", defaultIntensity: 1 },
  { type: "pixelate", name: "Pixel Art / 8-Bit", category: "retro", icon: "🕹️", description: "Pixelização retrô estilo videogame arcade e censura", defaultIntensity: 1 },

  // Luz & Brilho
  { type: "glow", name: "Brilho Neon / Bloom", category: "light", icon: "✨", description: "Aura luminosa suave e difusa nas áreas claras da cena", defaultIntensity: 1 },
  { type: "lightLeak", name: "Vazamento de Luz Solar", category: "light", icon: "☀️", description: "Feixes dourados e flares orgânicos de luz quente", defaultIntensity: 1 },
  { type: "vignette", name: "Vinheta Escura", category: "light", icon: "🎯", description: "Escurecimento suave nas bordas para focar no centro da ação", defaultIntensity: 1 },
  { type: "invert", name: "Negativo / Inversão", category: "light", icon: "🌓", description: "Inversão completa de cores para impacto visual ou pesadelo", defaultIntensity: 1 },

  // Cinema & Estilização
  { type: "tealOrange", name: "Teal & Orange", category: "stylize", icon: "🎬", description: "Color grading moderno de Hollywood (sombras ciano, tons quentes)", defaultIntensity: 1 },
  { type: "cyberpunk", name: "Cyberpunk Neon", category: "stylize", icon: "🌆", description: "Contraste vibrante azul ciano e rosa magenta futurista", defaultIntensity: 1 },
  { type: "goldenHour", name: "Golden Hour (Pôr do Sol)", category: "stylize", icon: "🌅", description: "Iluminação cinematográfica quente e tons dourados", defaultIntensity: 1 },
  { type: "noir", name: "Preto & Branco Noir", category: "stylize", icon: "🎩", description: "Preto e branco dramático de alto contraste com pretos profundos", defaultIntensity: 1 },
  { type: "duotone", name: "Duotone Pop", category: "stylize", icon: "🎨", description: "Bicolorização artística moderna de duas tonalidades", defaultIntensity: 1 },
  { type: "neonEdge", name: "Contorno Neon / Cyber", category: "stylize", icon: "⚡", description: "Detecção de bordas brilhantes estilo raio-x futurista", defaultIntensity: 1 },
  { type: "mirror", name: "Espelho Caledoscópio", category: "stylize", icon: "🪞", description: "Reflexão simétrica quádrupla hipnotizante", defaultIntensity: 1 },
  { type: "tiltShift", name: "Miniatura Tilt-Shift", category: "stylize", icon: "📸", description: "Desfoque seletivo superior/inferior simulando mundo miniatura", defaultIntensity: 1 },
  { type: "fisheye", name: "Lente Olho de Peixe", category: "stylize", icon: "🐟", description: "Curvatura convexa de lente ultra-angular estilo GoPro", defaultIntensity: 1 },
  { type: "thermal", name: "Visão Térmica", category: "stylize", icon: "🌡️", description: "Mapa de calor infravermelho simulando câmera militar", defaultIntensity: 1 },
  { type: "emboss", name: "Relevo 3D Metálico", category: "stylize", icon: "🗿", description: "Textura escultural em baixo-relevo de metal escovado", defaultIntensity: 1 },
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
  /** detector de silêncio: true = ESTE pedaço é um trecho sem som (a seleção
   *  pós-detecção marca só esses — Delete apaga o silêncio, não a faixa toda) */
  silenceMark?: boolean;
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
  keyframes?: Keyframe[]; // CapCut Keyframes (losangos ◆)
  animation?: ClipAnimation; // Animações de Entrada / Saída / Combo
  effects?: ClipEffect[]; // Efeitos Visuais Contínuos (Shake, Glitch, VHS, RGB, etc.)
}

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted: boolean;
  hidden: boolean;
}

export type VideoFormat = "mp4" | "webm9" | "webm8" | "mov" | "mkv" | "gif" | "wav" | "mp3" | "png" | "jpg";

export interface ProjectMeta {
  name: string;
  width: number;
  height: number;
  fps: number;
}

export interface MediaFolder {
  id: string;
  name: string;
  parentId: string | null; // null = raiz
  createdAt: number;
}

export interface MediaClipboard {
  mode: "cut" | "copy";
  mediaId: string;
  sourceFolderId: string | null;
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
  folderId?: string | null; // id da pasta onde esta mídia está guardada (null = raiz)
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
    id: "seca",
    name: "Seca (Sem Saltos)",
    props: {
      font: "Anton, Impact, sans-serif",
      size: 68,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeW: 8,
      shadow: true,
      bold: true,
      highlight: false,
      highlightScale: 1.0,
      highlightAnim: "none",
    },
  },
  {
    id: "karaoke-suave",
    name: "Karaokê Suave",
    props: {
      font: "Anton, Impact, sans-serif",
      size: 70,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeW: 8,
      shadow: true,
      bold: true,
      highlight: true,
      highlightColor: "#FACC15",
      highlightScale: 1.0,
      highlightAnim: "colorOnly",
    },
  },
  {
    id: "amarelo",
    name: "TikTok Reels",
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
    id: "box-word",
    name: "Caixa na Palavra",
    props: {
      font: "Impact, Haettenschweiler, 'Arial Black', sans-serif",
      size: 70,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeW: 0,
      shadow: true,
      bold: true,
      highlight: true,
      highlightColor: "#000000",
      highlightBg: "#FACC15",
      highlightBgPad: 8,
      highlightBgRadius: 6,
      highlightScale: 1.12,
      highlightAnim: "box",
    },
  },
  {
    id: "hormozi",
    name: "Viral Hormozi",
    props: {
      font: "Impact, Haettenschweiler, 'Arial Black', sans-serif",
      size: 74,
      color: "#000000",
      strokeColor: "#000000",
      strokeW: 0,
      shadow: false,
      bg: "#FACC15",
      bgPad: 20,
      bgRadius: 8,
      bold: true,
      highlight: true,
      highlightColor: "#FFFFFF",
      highlightScale: 1.25,
      highlightAnim: "pop",
    },
  },
  {
    id: "typewriterStyle",
    name: "Máquina de Escrever",
    props: {
      font: "'Courier New', Courier, monospace",
      size: 58,
      color: "#34D399",
      bg: "#064E3BCC",
      bgPad: 16,
      bgRadius: 6,
      strokeW: 0,
      bold: true,
      typewriter: true,
      highlight: false,
    },
  },
  {
    id: "cinema-box",
    name: "Tarja de Cinema",
    props: {
      font: "Arial, Helvetica, sans-serif",
      size: 54,
      color: "#FFFFFF",
      strokeW: 0,
      shadow: false,
      bg: "#000000B3",
      bgPad: 18,
      bgRadius: 8,
      bold: true,
      highlight: false,
    },
  },
  {
    id: "comic",
    name: "Comic / HQ",
    props: {
      font: "Bangers, Impact, cursive",
      size: 76,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeW: 10,
      shadow: true,
      bold: true,
      highlight: true,
      highlightColor: "#EF4444",
      highlightScale: 1.25,
      highlightAnim: "bounce",
    },
  },
  {
    id: "neon-glow",
    name: "Neon Cyber Glow",
    props: {
      font: "Bebas Neue, Arial, sans-serif",
      size: 76,
      color: "#38BDF8",
      strokeColor: "#0369A1",
      strokeW: 6,
      shadow: true,
      highlight: true,
      highlightColor: "#38BDF8",
      highlightScale: 1.15,
      highlightAnim: "glow",
    },
  },
  {
    id: "karaoke-verde",
    name: "Karaokê Verde",
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
    id: "minimal",
    name: "Minimalista Clean",
    props: {
      font: "Arial, Helvetica, sans-serif",
      size: 60,
      color: "#FFFFFF",
      strokeColor: "#000000",
      strokeW: 4,
      shadow: true,
      bold: false,
      highlight: false,
    },
  },
  {
    id: "vermelho",
    name: "Alerta Vermelho",
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

// ============================================================================
// MATEMÁTICA DE KEYFRAMES & ANIMAÇÕES (Curvas de interpolação & Easing)
// ============================================================================

export function applyEasing(p: number, easing?: KeyframeEasing): number {
  const t = Math.max(0, Math.min(1, p));
  switch (easing) {
    case "linear":
      return t;
    case "easeIn":
      return t * t * t;
    case "easeOut":
      return 1 - Math.pow(1 - t, 3);
    case "easeInOut":
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case "spring": {
      const c4 = (2 * Math.PI) / 3;
      return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }
    case "bounce": {
      const n1 = 7.5625;
      const d1 = 2.75;
      let cur = t;
      if (cur < 1 / d1) return n1 * cur * cur;
      if (cur < 2 / d1) return n1 * (cur -= 1.5 / d1) * cur + 0.75;
      if (cur < 2.5 / d1) return n1 * (cur -= 2.25 / d1) * cur + 0.9375;
      return n1 * (cur -= 2.625 / d1) * cur + 0.984375;
    }
    default:
      // Padrão suave (easeInOut) estilo CapCut
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  }
}

export function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

export function easeOutBounce(t: number): number {
  return applyEasing(t, "bounce");
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInCubic(t: number): number {
  return t * t * t;
}

export interface EvaluatedTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  blur: number;
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  sepia: number;
  grayscale: number;
  // Modificadores adicionais de animações/efeitos
  extraDx: number;
  extraDy: number;
  extraScale: number;
  extraScaleX: number;
  extraScaleY: number;
  extraRot: number;
  extraAlpha: number;
  extraBlur: number;
  shakeOffsetX: number;
  shakeOffsetY: number;
  shakeRot: number;
  flashAlpha: number;
}

/**
 * Avalia o estado exato de transformação e filtros de um clipe no tempo `t` da timeline.
 * Combina:
 * 1. Base values do Clip
 * 2. Interpolação suave de Keyframes (losangos ◆) se existirem
 * 3. Animações de Entrada / Saída / Combo estilo CapCut
 * 4. Efeitos contínuos de movimento (Shake, Flash)
 */
export function evaluateClipState(c: Clip, t: number): EvaluatedTransform {
  const tRel = Math.max(0, Math.min(c.duration, t - c.start));

  let x = c.x;
  let y = c.y;
  let scale = c.scale;
  let rotation = c.rotation;
  let opacity = c.opacity;
  let blur = c.blur;
  let brightness = c.brightness;
  let contrast = c.contrast;
  let saturation = c.saturation;
  let hue = c.hue;
  const sepia = c.sepia;
  const grayscale = c.grayscale;

  // 1. Interpolação de Keyframes ◆
  const kfs = (c.keyframes || []).slice().sort((a, b) => a.time - b.time);
  if (kfs.length > 0) {
    if (tRel <= kfs[0].time) {
      // Antes do primeiro keyframe
      const k = kfs[0];
      if (k.x !== undefined) x = k.x;
      if (k.y !== undefined) y = k.y;
      if (k.scale !== undefined) scale = k.scale;
      if (k.rotation !== undefined) rotation = k.rotation;
      if (k.opacity !== undefined) opacity = k.opacity;
      if (k.blur !== undefined) blur = k.blur;
      if (k.brightness !== undefined) brightness = k.brightness;
      if (k.contrast !== undefined) contrast = k.contrast;
      if (k.saturation !== undefined) saturation = k.saturation;
      if (k.hue !== undefined) hue = k.hue;
    } else if (tRel >= kfs[kfs.length - 1].time) {
      // Depois do último keyframe
      const k = kfs[kfs.length - 1];
      if (k.x !== undefined) x = k.x;
      if (k.y !== undefined) y = k.y;
      if (k.scale !== undefined) scale = k.scale;
      if (k.rotation !== undefined) rotation = k.rotation;
      if (k.opacity !== undefined) opacity = k.opacity;
      if (k.blur !== undefined) blur = k.blur;
      if (k.brightness !== undefined) brightness = k.brightness;
      if (k.contrast !== undefined) contrast = k.contrast;
      if (k.saturation !== undefined) saturation = k.saturation;
      if (k.hue !== undefined) hue = k.hue;
    } else {
      // Entre dois keyframes: interpolação suave
      let idx = 0;
      for (let i = 0; i < kfs.length - 1; i++) {
        if (tRel >= kfs[i].time && tRel <= kfs[i + 1].time) {
          idx = i;
          break;
        }
      }
      const k0 = kfs[idx];
      const k1 = kfs[idx + 1];
      const dt = k1.time - k0.time;
      const rawP = dt > 0.0001 ? (tRel - k0.time) / dt : 1;
      const p = applyEasing(rawP, k0.easing || "easeInOut");

      const k0x = k0.x !== undefined ? k0.x : c.x;
      const k1x = k1.x !== undefined ? k1.x : c.x;
      x = k0x + (k1x - k0x) * p;

      const k0y = k0.y !== undefined ? k0.y : c.y;
      const k1y = k1.y !== undefined ? k1.y : c.y;
      y = k0y + (k1y - k0y) * p;

      const k0s = k0.scale !== undefined ? k0.scale : c.scale;
      const k1s = k1.scale !== undefined ? k1.scale : c.scale;
      scale = k0s + (k1s - k0s) * p;

      const k0r = k0.rotation !== undefined ? k0.rotation : c.rotation;
      const k1r = k1.rotation !== undefined ? k1.rotation : c.rotation;
      rotation = k0r + (k1r - k0r) * p;

      const k0o = k0.opacity !== undefined ? k0.opacity : c.opacity;
      const k1o = k1.opacity !== undefined ? k1.opacity : c.opacity;
      opacity = k0o + (k1o - k0o) * p;

      const k0b = k0.blur !== undefined ? k0.blur : c.blur;
      const k1b = k1.blur !== undefined ? k1.blur : c.blur;
      blur = k0b + (k1b - k0b) * p;

      const k0br = k0.brightness !== undefined ? k0.brightness : c.brightness;
      const k1br = k1.brightness !== undefined ? k1.brightness : c.brightness;
      brightness = k0br + (k1br - k0br) * p;

      const k0ct = k0.contrast !== undefined ? k0.contrast : c.contrast;
      const k1ct = k1.contrast !== undefined ? k1.contrast : c.contrast;
      contrast = k0ct + (k1ct - k0ct) * p;

      const k0st = k0.saturation !== undefined ? k0.saturation : c.saturation;
      const k1st = k1.saturation !== undefined ? k1.saturation : c.saturation;
      saturation = k0st + (k1st - k0st) * p;

      const k0h = k0.hue !== undefined ? k0.hue : c.hue;
      const k1h = k1.hue !== undefined ? k1.hue : c.hue;
      hue = k0h + (k1h - k0h) * p;
    }
  }

  let extraDx = 0;
  let extraDy = 0;
  let extraScale = 1;
  let extraScaleX = 1;
  let extraScaleY = 1;
  let extraRot = 0;
  let extraAlpha = 1;
  let extraBlur = 0;

  // 2. Animação de Entrada (In)
  const anim = c.animation;
  if (anim?.inType && anim.inType !== "none") {
    const inDur = Math.min(c.duration * 0.95, anim.inDuration ?? 0.5);
    if (tRel < inDur && inDur > 0.001) {
      const p = Math.max(0, Math.min(1, tRel / inDur));
      switch (anim.inType) {
        case "zoomIn":
          extraScale *= 0.15 + 0.85 * easeOutBack(p);
          extraAlpha *= Math.min(1, p * 2);
          break;
        case "zoomOut":
          extraScale *= 1.8 - 0.8 * easeOutCubic(p);
          extraAlpha *= Math.min(1, p * 2);
          break;
        case "slideLeft":
          extraDx += (1 - easeOutCubic(p)) * 2;
          break;
        case "slideRight":
          extraDx -= (1 - easeOutCubic(p)) * 2;
          break;
        case "slideUp":
          extraDy += (1 - easeOutCubic(p)) * 2;
          break;
        case "slideDown":
          extraDy -= (1 - easeOutCubic(p)) * 2;
          break;
        case "spinIn":
          extraRot += (1 - easeOutCubic(p)) * 360;
          extraScale *= p;
          break;
        case "bounceIn":
          extraScale *= easeOutBounce(p);
          break;
        case "fadeIn":
          extraAlpha *= applyEasing(p, "easeInOut");
          break;
        case "dropIn":
          extraDy -= (1 - easeOutBounce(p)) * 2;
          break;
        case "popIn":
          extraScale *= easeOutBack(p);
          break;
        case "blurIn":
          extraBlur += (1 - p) * 20;
          extraAlpha *= Math.min(1, p * 1.5);
          break;
        case "shakeIn":
          extraDx += Math.sin(p * Math.PI * 8) * (1 - p) * 0.15;
          extraScale *= 0.7 + 0.3 * p;
          break;
        case "flipInX":
          extraScaleY *= Math.max(0.001, Math.cos((1 - p) * Math.PI * 0.5));
          extraRot += Math.sin((1 - p) * Math.PI * 0.5) * 18;
          extraAlpha *= Math.min(1, p * 2.5);
          break;
        case "flipInY":
          extraScaleX *= Math.max(0.001, Math.cos((1 - p) * Math.PI * 0.5));
          extraRot += Math.sin((1 - p) * Math.PI * 0.5) * -18;
          extraAlpha *= Math.min(1, p * 2.5);
          break;
        case "wipeRight":
          extraDx -= (1 - easeOutCubic(p)) * 1.5;
          extraAlpha *= p;
          break;
      }
    }
  }

  // 3. Animação de Saída (Out)
  if (anim?.outType && anim.outType !== "none") {
    const outDur = Math.min(c.duration * 0.95, anim.outDuration ?? 0.5);
    const timeLeft = c.duration - tRel;
    if (timeLeft < outDur && outDur > 0.001) {
      const p = Math.max(0, Math.min(1, (outDur - timeLeft) / outDur)); // 0 no início da saída, 1 no final
      switch (anim.outType) {
        case "zoomOut":
          extraScale *= Math.max(0.01, 1 - p * 0.85);
          extraAlpha *= Math.max(0, 1 - p * 1.5);
          break;
        case "slideLeft":
          extraDx -= easeInCubic(p) * 2;
          break;
        case "slideRight":
          extraDx += easeInCubic(p) * 2;
          break;
        case "slideUp":
          extraDy -= easeInCubic(p) * 2;
          break;
        case "slideDown":
          extraDy += easeInCubic(p) * 2;
          break;
        case "spinOut":
          extraRot += easeInCubic(p) * 360;
          extraScale *= Math.max(0.01, 1 - p);
          break;
        case "fadeOut":
          extraAlpha *= Math.max(0, 1 - p);
          break;
        case "sinkDown":
          extraDy += easeInCubic(p) * 2;
          extraAlpha *= Math.max(0, 1 - p);
          break;
        case "blurOut":
          extraBlur += p * 24;
          extraAlpha *= Math.max(0, 1 - p);
          break;
        case "popOut":
          extraScale *= Math.max(0.01, 1 - p * 1.1);
          break;
      }
    }
  }

  // 4. Animação Combo / Loop
  if (anim?.comboType && anim.comboType !== "none") {
    const spd = anim.comboSpeed ?? 1;
    const phase = tRel * spd * Math.PI * 2;
    switch (anim.comboType) {
      case "pulse":
        extraScale *= 1 + 0.09 * Math.sin(phase * 1.8);
        break;
      case "float":
        extraDy += Math.sin(phase * 0.8) * 0.04;
        extraDx += Math.cos(phase * 0.4) * 0.02;
        break;
      case "shake":
        extraDx += Math.sin(phase * 8) * 0.025;
        extraDy += Math.cos(phase * 9.5) * 0.025;
        extraRot += Math.sin(phase * 7) * 1.8;
        break;
      case "swing":
        extraRot += Math.sin(phase * 1.2) * 8;
        break;
      case "spin":
        extraRot += (tRel * spd * 90) % 360;
        break;
      case "heartbeat": {
        const hb = Math.sin(phase * 2);
        extraScale *= 1 + (hb > 0.4 ? 0.12 * Math.sin((hb - 0.4) * Math.PI * 1.66) : 0);
        break;
      }
      case "glitchHop": {
        const step = Math.floor(tRel * spd * 6);
        const rnd = Math.sin(step * 999);
        if (rnd > 0.6) {
          extraDx += (rnd - 0.6) * 0.15;
          extraDy += Math.cos(step * 777) * 0.08;
        }
        break;
      }
      case "wave":
        extraDy += Math.sin(phase * 1.5) * 0.05;
        extraRot += Math.cos(phase * 1.2) * 3.5;
        break;
      case "breathe":
        extraScale *= 1 + 0.06 * Math.sin(phase * 0.6);
        break;
      case "pendulum":
        extraDx += Math.sin(phase) * 0.1;
        extraRot += Math.sin(phase) * 6;
        break;
    }
  }

  // 5. Efeitos contínuos de movimento (Shake / Flash)
  let shakeOffsetX = 0;
  let shakeOffsetY = 0;
  let shakeRot = 0;
  let flashAlpha = 0;

  const effects = c.effects || [];
  for (const eff of effects) {
    if (!eff.enabled) continue;
    const effStart = eff.start ?? 0;
    const effDur = eff.duration != null ? eff.duration : (c.duration - effStart);
    if (tRel < effStart || tRel > effStart + effDur) continue;

    const intensity = eff.intensity ?? 1;
    const spd = eff.speed ?? 1;
    if (eff.type === "shake") {
      const p1 = tRel * spd * 28;
      const p2 = tRel * spd * 34;
      shakeOffsetX += (Math.sin(p1) * 0.6 + Math.cos(p2 * 1.4) * 0.4) * 0.06 * intensity;
      shakeOffsetY += (Math.cos(p1 * 1.2) * 0.6 + Math.sin(p2) * 0.4) * 0.06 * intensity;
      shakeRot += (Math.sin(p1 * 0.8) * 3) * intensity;
    } else if (eff.type === "flash") {
      const fPhase = (tRel * spd * 2.5) % 1;
      if (fPhase < 0.25) {
        flashAlpha = Math.max(flashAlpha, Math.sin(fPhase * 4 * Math.PI * 0.5) * 0.8 * intensity);
      }
    }
  }

  return {
    x,
    y,
    scale,
    rotation,
    opacity,
    blur,
    brightness,
    contrast,
    saturation,
    hue,
    sepia,
    grayscale,
    extraDx,
    extraDy,
    extraScale,
    extraScaleX,
    extraScaleY,
    extraRot,
    extraAlpha,
    extraBlur,
    shakeOffsetX,
    shakeOffsetY,
    shakeRot,
    flashAlpha,
  };
}
