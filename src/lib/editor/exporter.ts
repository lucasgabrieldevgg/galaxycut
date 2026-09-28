// GaláxiaCut — exportação de vídeo (offline quadro-a-quadro, tempo real só
// como plano B), GIF, WAV e legendas SRT
// v7.3: o padrão é o motor OFFLINE (WebCodecs + muxer) — mais rápido que tempo
// real, sem "mídia não carregada" queimada e com a proporção certa em qualquer
// resolução. O MediaRecorder antigo virou fallback para navegadores sem
// WebCodecs (com os mesmos consertos de proporção e pré-carga).
"use client";

import { useProject, usePlayback } from "./store";
import { engine } from "./playback";
import { audioEngine } from "./audio";
import { drawFrame } from "./render";
import { Clip, ProjectMeta, clipEnd, fmtSrtTime } from "./types";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { exportOffline, offlineSupported, OfflineProgressInfo, renderAudioMix } from "./exportEngine";

export type VideoFormat = "mp4" | "webm9" | "webm8" | "gif" | "wav" | "png";

export interface ExportOptions {
  shortSide: number; // qualidade = menor lado da saída (240…4320)
  fps: number; // 24…60 (GIF usa o próprio)
  bitrate: number; // bits/s
  format: VideoFormat;
  /** v7.3: cancelamento — setar cancelled=true aborta o render na hora */
  cancel?: { cancelled: boolean };
}

export type ExportProgress = (p: number, info?: OfflineProgressInfo) => void;

export interface ExportResult {
  blob: Blob;
  ext: string;
  mime: string;
}

/** candidatos de gravação por formato — o primeiro suportado vence */
const MIME_BY_FORMAT: Record<Exclude<VideoFormat, "gif" | "wav" | "png">, { mime: string; ext: string }[]> = {
  mp4: [
    { mime: 'video/mp4;codecs="avc1.640028,mp4a.40.2"', ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
  ],
  webm9: [{ mime: "video/webm;codecs=vp9,opus", ext: "webm" }],
  webm8: [{ mime: "video/webm;codecs=vp8,opus", ext: "webm" }],
};

export function listVideoFormats(): { id: VideoFormat; label: string; hint: string }[] {
  const out: { id: VideoFormat; label: string; hint: string }[] = [];
  const tryMime = (cands: { mime: string }[]) =>
    cands.some((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime));
  if (tryMime(MIME_BY_FORMAT.mp4)) out.push({ id: "mp4", label: "MP4", hint: "H.264 · abre em qualquer lugar" });
  if (tryMime(MIME_BY_FORMAT.webm9)) out.push({ id: "webm9", label: "WebM", hint: "VP9 · melhor compressão" });
  if (tryMime(MIME_BY_FORMAT.webm8)) out.push({ id: "webm8", label: "WebM (VP8)", hint: "compatibilidade máxima" });
  return out;
}

function pickMime(format: Exclude<VideoFormat, "gif" | "wav" | "png">): { mime: string; ext: string } | null {
  for (const c of MIME_BY_FORMAT[format]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return null;
}

export function canExport(): boolean {
  return listVideoFormats().length > 0;
}

/** rótulo curto do formato padrão (o que o botão Exportar mostra) */
export function exportFormatLabel(): string {
  const f = listVideoFormats()[0];
  return f ? f.label.toUpperCase() : "—";
}

/** Dimensões de saída mantendo o aspecto do projeto. QUALIDADE = MENOR LADO:
 *  1080p num projeto 9:16 sai 1080×1920 (antes saía 608×1080 — corrigido). */
export function outputSize(project: { width: number; height: number }, shortSide: number): { W: number; H: number } {
  const aspect = project.width / project.height;
  let W: number;
  let H: number;
  if (aspect >= 1) {
    H = shortSide;
    W = Math.round(H * aspect / 2) * 2;
  } else {
    W = shortSide;
    H = Math.round(W / aspect / 2) * 2;
  }
  return { W: Math.max(2, W), H: Math.max(2, H) };
}

/** bitrate sugerido pela resolução (14 Mbps @1080p "alta") */
export function suggestBitrate(shortSide: number, aspect: number): number {
  const { W, H } = outputSize({ width: 1920, height: Math.max(2, Math.round(1920 / aspect)) }, shortSide);
  const px = W * H;
  const base1080 = 1920 * 1080;
  return Math.round(Math.max(1_500_000, Math.min(120_000_000, 14_000_000 * (px / base1080))));
}

/**
 * Exporta a timeline inteira. v7.3: OFFLINE quadro a quadro (WebCodecs) —
 * mais rápido que tempo real e determinístico. Sem WebCodecs (ou sem codec
 * compatível) cai no plano B: gravação em tempo real com pré-carga total
 * da mídia (nada de "não carregada" no meio do vídeo) e proporção corrigida.
 */
export async function exportVideo(
  opts: ExportOptions,
  onProgress: ExportProgress
): Promise<ExportResult> {
  const duration = usePlayback.getState().duration;
  if (duration <= 0) throw new Error("Timeline vazia — adicione mídia antes de exportar.");

  if (offlineSupported()) {
    try {
      return await exportOffline({
        shortSide: opts.shortSide,
        fps: opts.fps,
        bitrate: opts.bitrate,
        format: opts.format === "webm8" ? "webm8" : opts.format === "webm9" ? "webm9" : "mp4",
        onProgress,
        cancel: opts.cancel,
      });
    } catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (msg.includes("cancel")) throw e;
      // sem codec offline disponível → plano B (tempo real). Qualquer outra
      // falha no meio do render é erro de verdade (não refaz tudo do zero).
      if (!msg.includes("no-offline-codec")) throw e;
    }
  }
  return exportRealtime(opts, onProgress);
}

/** Plano B: gravação em tempo real (MediaRecorder) — só quando o navegador não
 *  tem WebCodecs. v7.3: espera TODA a mídia carregar antes de gravar (nada de
 *  "mídia não carregada" queimada no vídeo) e escala o espaço do projeto pro
 *  canvas de saída (a proporção fica certa em qualquer resolução). */
async function exportRealtime(
  opts: ExportOptions,
  onProgress: ExportProgress
): Promise<ExportResult> {
  const { project, tracks, clips } = useProject.getState();
  const duration = usePlayback.getState().duration;
  const picked = pickMime(opts.format === "gif" || opts.format === "wav" || opts.format === "png" ? "mp4" : opts.format);
  if (!picked) throw new Error("Seu navegador não suporta gravação de vídeo (MediaRecorder). Use Chrome/Edge atualizado.");

  const { W, H } = outputSize(project, opts.shortSide);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const scaledProject = { ...project, width: W, height: H }; // proporção certa ✔

  const videoStream = canvas.captureStream(opts.fps);
  let audioStream: MediaStream | null = null;
  try {
    audioStream = audioEngine.getRecordingStream();
  } catch {
    audioStream = null;
  }
  const tracksAll: MediaStreamTrack[] = [...videoStream.getVideoTracks()];
  if (audioStream) tracksAll.push(...audioStream.getAudioTracks().filter((t) => t.readyState === "live"));
  const combined = new MediaStream(tracksAll);

  const chunks: BlobPart[] = [];
  const rec = new MediaRecorder(combined, {
    mimeType: picked.mime,
    videoBitsPerSecond: opts.bitrate,
    audioBitsPerSecond: 128000,
  });
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // v7.3: espera a mídia carregar INTEIRA antes de gravar (o mesmo critério
  // do play) — sem isso o vídeo podia sair com quadros de "carregando"
  engine.pause();
  engine.seek(0);
  const waitReady = async () => {
    for (let i = 0; i < 600; i++) {
      if (engine.allMediaReady()) return;
      onProgress(Math.min(0.15, 0.002 * i), { stage: "prepare" });
      await new Promise((r) => setTimeout(r, 250));
    }
  };
  await waitReady();
  await new Promise((r) => setTimeout(r, 350)); // deca os seeks assentarem

  const done = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });
  rec.start(250);
  usePlayback.getState().setPlaying(true);
  audioEngine.ensureContext();

  await new Promise<void>((resolve) => {
    const step = () => {
      if (opts.cancel?.cancelled) {
        resolve();
        return;
      }
      const pb = usePlayback.getState();
      const t = pb.playhead;
      drawFrame(ctx, scaledProject, tracks, clips, t, { getElement: (id) => engine.getElement(id) });
      onProgress(Math.min(0.999, t / duration), { stage: "render" });
      if (!pb.playing || t >= duration - 0.001) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  usePlayback.getState().setPlaying(false);
  engine.pause();
  await new Promise((r) => setTimeout(r, 300));
  rec.stop();
  await done;
  if (opts.cancel?.cancelled) throw new Error("exportação cancelada");
  onProgress(1, { stage: "finish" });

  const blob = new Blob(chunks, { type: picked.mime });
  return { blob, ext: picked.ext, mime: picked.mime };
}

/**
 * GIF animado — renderiza QUADRO A QUADRO (offline, mais rápido que tempo real)
 * e codifica com gifenc. Sem áudio (GIF não tem som).
 */
export async function exportGif(
  opts: { shortSide: number; fps: number },
  onProgress: (p: number) => void
): Promise<ExportResult> {
  const { project, tracks, clips } = useProject.getState();
  const duration = usePlayback.getState().duration;
  if (duration <= 0) throw new Error("Timeline vazia — adicione mídia antes de exportar.");
  const { W, H } = outputSize(project, Math.min(opts.shortSide, 720)); // GIF grande fica pesado demais
  const scale = Math.min(1, 640 / Math.max(W, H)); // largura máxima 640px no GIF
  const gw = Math.max(2, Math.round(W * scale / 2) * 2);
  const gh = Math.max(2, Math.round(H * scale / 2) * 2);

  const canvas = document.createElement("canvas");
  canvas.width = gw;
  canvas.height = gh;
  const ctx = canvas.getContext("2d")!;

  const enc = GIFEncoder();
  const frameGap = 1 / Math.max(5, Math.min(25, opts.fps));
  const total = Math.max(1, Math.ceil(duration / frameGap));
  // pausa o preview: o GIF renderiza a timeline offline
  engine.pause();

  for (let i = 0; i < total; i++) {
    const t = Math.min(duration, i * frameGap);
    drawFrame(ctx, { ...project, width: gw, height: gh }, tracks, clips, t, { getElement: (id) => engine.getElement(id) });
    const { data, width, height } = ctx.getImageData(0, 0, gw, gh);
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    enc.writeFrame(index, width, height, { palette, delay: Math.round(frameGap * 1000) });
    if (i % 3 === 0) {
      onProgress(i / total);
      // devolve o fôlego pra UI (o loop é síncrono e pesado)
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  enc.finish();
  onProgress(1);
  const blob = new Blob([enc.bytesView()], { type: "image/gif" });
  return { blob, ext: "gif", mime: "image/gif" };
}

/**
 * WAV do projeto inteiro — mixa TODOS os clipes com som offline (determinístico,
 * sem tempo real). v7.3: usa o mesmo renderAudioMix do motor de exportação.
 */
export async function exportWav(onProgress: (p: number) => void): Promise<ExportResult> {
  const duration = usePlayback.getState().duration;
  if (duration <= 0) throw new Error("Timeline vazia — adicione mídia antes de exportar.");
  const rendered = await renderAudioMix(duration, (p) => onProgress(0.05 + 0.6 * p));
  if (!rendered) throw new Error("Esta edição não tem áudio para exportar.");
  onProgress(0.9);

  // AudioBuffer → WAV 16-bit (o mesmo empacotador do "extrair áudio")
  const wav = encodeWavFromBuffer(rendered);
  onProgress(1);
  return { blob: wav, ext: "wav", mime: "audio/wav" };
}

function encodeWavFromBuffer(buf: AudioBuffer): Blob {
  const numCh = Math.min(2, buf.numberOfChannels);
  const len = buf.length;
  const bytes = 44 + len * numCh * 2;
  const ab = new ArrayBuffer(bytes);
  const view = new DataView(ab);
  const wr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  wr(0, "RIFF");
  view.setUint32(4, bytes - 8, true);
  wr(8, "WAVE");
  wr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  wr(36, "data");
  view.setUint32(40, len * numCh * 2, true);
  let off = 44;
  const chans = Array.from({ length: numCh }, (_, i) => buf.getChannelData(i));
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, chans[ch][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/** PNG do quadro atual (a setinha) — print da tela do vídeo. */
export async function exportPng(): Promise<ExportResult> {
  const { project, tracks, clips } = useProject.getState();
  const t = usePlayback.getState().playhead;
  const { W, H } = outputSize(project, project.height >= project.width ? project.width : project.height);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  drawFrame(ctx, project, tracks, clips, t, { getElement: (id) => engine.getElement(id) });
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/png"));
  if (!blob) throw new Error("Não consegui gerar o PNG deste quadro.");
  return { blob, ext: "png", mime: "image/png" };
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Gera SRT a partir dos clipes de texto na track de legendas. */
export function buildSrt(project: ProjectMeta, clips: Clip[]): string {
  const textClips = clips
    .filter((c) => c.kind === "text" && c.text)
    .sort((a, b) => a.start - b.start);
  const blocks: string[] = [];
  let idx = 1;
  for (const c of textClips) {
    const content = (c.text!.content || "").trim();
    if (!content) continue;
    blocks.push(
      `${idx}\n${fmtSrtTime(c.start)} --> ${fmtSrtTime(Math.min(clipEnd(c), 36000))}\n${content}\n`
    );
    idx++;
  }
  void project;
  return blocks.join("\n");
}

export function sanitizeName(name: string): string {
  return (name || "video").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/-+/g, "-").slice(0, 60);
}
