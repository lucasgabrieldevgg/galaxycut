// GalaxyCut — compartilhar edição por link autocontido (ver brain/decisions/ADR-001).
// O projeto inteiro (estrutura, clipes, textos, efeitos — SEM os arquivos de
// mídia) é comprimido com gzip e codificado em base64url no fragmento #s=… do
// link. O fragmento nunca é enviado a servidor nenhum: privacidade por construção.
"use client";

import type { Clip, MediaFolder, MediaMeta, ProjectMeta, Track } from "./types";

export type ShareLevel = "view" | "edit" | "copy";

export interface SharePayload {
  v: 1;
  lvl: ShareLevel;
  name: string;
  made: number;
  app: string;
  project: ProjectMeta;
  tracks: Track[];
  clips: Clip[];
  folders: MediaFolder[];
  media: MediaMeta[];
}

/** tamanho máximo do link codificado — acima disso o link é inviável de colar */
export const MAX_ENCODED_CHARS = 2_500_000;
/** defesa contra link forjado gigante: limite do payload já decodificado */
const MAX_DECODED_BYTES = 20_000_000;
/** limites de sanidade do conteúdo (idem) */
const MAX_CLIPS = 2000;
const MAX_TRACKS = 64;
const MAX_MEDIA = 2000;

/** metadados de UI de cada nível (nome/descrição vêm do i18n) */
export const SHARE_LEVEL_INFO: { id: ShareLevel; nameKey: string; descKey: string }[] = [
  { id: "view", nameKey: "share.lvlView", descKey: "share.lvlViewDesc" },
  { id: "edit", nameKey: "share.lvlEdit", descKey: "share.lvlEditDesc" },
  { id: "copy", nameKey: "share.lvlCopy", descKey: "share.lvlCopyDesc" },
];

export function shareLevelInfo(lvl: ShareLevel) {
  return SHARE_LEVEL_INFO.find((l) => l.id === lvl) ?? SHARE_LEVEL_INFO[0];
}

export function isShareCodecSupported(): boolean {
  return (
    typeof CompressionStream !== "undefined" &&
    typeof DecompressionStream !== "undefined" &&
    typeof Response === "function" &&
    typeof btoa === "function"
  );
}

// ---------- codec (gzip + base64url) ----------

async function gzipText(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzipToText(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return await new Response(stream).text();
}

function toB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  // base64 → base64url (seguro pra URL, sem padding)
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64Url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("share/bad-charset");
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ---------- geração do link ----------

function baseUrl(): string {
  if (typeof location === "undefined") return "https://galaxycut.vercel.app/";
  // no app de desktop (servidor local do Electron) o link aponta pro site público
  if (location.hostname === "127.0.0.1" && location.port === "39871") {
    return "https://galaxycut.vercel.app/";
  }
  return `${location.origin}${location.pathname}`;
}

export async function buildShareLink(payload: SharePayload, opts?: { directVideo?: boolean }): Promise<string> {
  const bytes = await gzipText(JSON.stringify(payload));
  const enc = toB64Url(bytes);
  if (enc.length > MAX_ENCODED_CHARS) throw new Error("share/too-big");
  // &w=1: modo vídeo direto — quem abre cai direto no player, sem a tela de
  // apresentação do link (estilo shorts: só o vídeo, tela cheia)
  return `${baseUrl()}#s=${enc}${opts?.directVideo ? "&w=1" : ""}`;
}

// ---------- leitura do link ----------

export function shareFragmentFromLocation(): string | null {
  if (typeof location === "undefined") return null;
  const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

/** true quando o link pede modo vídeo direto (#s=…&w=1) */
export function shareIsDirectVideo(): boolean {
  if (typeof location === "undefined") return false;
  return /[&?]w=1(?:&|$)/.test(location.hash);
}

export async function parseShareLink(encoded: string): Promise<SharePayload> {
  if (encoded.length > MAX_ENCODED_CHARS) throw new Error("share/too-big");
  const bytes = fromB64Url(encoded);
  if (bytes.length > MAX_DECODED_BYTES) throw new Error("share/too-big");
  let text: string;
  try {
    text = await gunzipToText(bytes);
  } catch {
    throw new Error("share/bad-gzip");
  }
  if (text.length > MAX_DECODED_BYTES) throw new Error("share/too-big");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("share/bad-json");
  }
  return validateSharePayload(raw);
}

// ---------- validação (fronteira de confiança) ----------
// O conteúdo do link é 100% controlado por quem o montou: NADA entra no
// estado do app sem passar por aqui — forma, tipos, limites e saneamento.

function clampDim(v: unknown, dflt: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 16 && n <= 8192 ? Math.round(n) : dflt;
}

function clampFps(v: unknown, dflt: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 12 && n <= 120 ? Math.round(n) : dflt;
}

function isPlausibleClip(c: unknown): c is Clip {
  if (typeof c !== "object" || c === null) return false;
  const k = (c as Clip).kind;
  return typeof (c as Clip).id === "string" && (k === "video" || k === "image" || k === "audio" || k === "text");
}

function sanitizeClip(c: Clip): Clip {
  const start = Number.isFinite(c.start) && c.start > 0 ? c.start : 0;
  const duration = Number.isFinite(c.duration) && c.duration > 0 ? Math.min(c.duration, 3600) : 1;
  return { ...c, start, duration, trackId: typeof c.trackId === "string" ? c.trackId : "V1" };
}

export function validateSharePayload(raw: unknown): SharePayload {
  if (typeof raw !== "object" || raw === null) throw new Error("share/bad-shape");
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) throw new Error("share/bad-version");
  if (r.lvl !== "view" && r.lvl !== "edit" && r.lvl !== "copy") throw new Error("share/bad-level");
  if (typeof r.name !== "string" || !r.name.length || r.name.length > 200) throw new Error("share/bad-name");
  const proj = r.project as Partial<ProjectMeta> | undefined;
  if (!proj || typeof proj !== "object") throw new Error("share/bad-project");
  if (!Array.isArray(r.tracks) || !Array.isArray(r.clips) || !Array.isArray(r.media)) throw new Error("share/bad-arrays");
  if (r.clips.length > MAX_CLIPS || r.tracks.length > MAX_TRACKS || r.media.length > MAX_MEDIA) {
    throw new Error("share/too-many");
  }

  const tracks = (r.tracks as Track[]).filter((tk) => tk && typeof tk.id === "string");
  const knownTracks = new Set(tracks.map((tk) => tk.id));
  // clipe em faixa desconhecida é órfão — a timeline não saberia onde desenhar
  const clips = (r.clips as Clip[]).filter(isPlausibleClip).map(sanitizeClip).filter((c) => knownTracks.has(c.trackId));

  return {
    v: 1,
    lvl: r.lvl,
    name: r.name,
    made: typeof r.made === "number" && Number.isFinite(r.made) ? r.made : Date.now(),
    app: typeof r.app === "string" ? r.app.slice(0, 20) : "?",
    project: {
      name: typeof proj.name === "string" && proj.name ? proj.name.slice(0, 60) : r.name,
      width: clampDim(proj.width, 1080),
      height: clampDim(proj.height, 1920),
      fps: clampFps(proj.fps, 30),
    },
    tracks,
    clips,
    folders: Array.isArray(r.folders)
      ? (r.folders as MediaFolder[]).filter((f) => typeof f?.id === "string")
      : [],
    media: (r.media as MediaMeta[]).filter((m) => typeof m?.id === "string").slice(0, MAX_MEDIA),
  };
}
