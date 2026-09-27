// GaláxiaCut — exportação de vídeo (MediaRecorder), GIF, WAV e legendas SRT
// v7: resolução de verdade (o "menor lado" é a qualidade — 1080p vertical =
// 1080×1920 de fato), formatos múltiplos e GIF animado offline.
"use client";

import { useProject, usePlayback } from "./store";
import { engine } from "./playback";
import { audioEngine } from "./audio";
import { drawFrame } from "./render";
import { registry } from "./media";
import { Clip, ProjectMeta, clipEnd, fmtSrtTime } from "./types";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

export type VideoFormat = "mp4" | "webm9" | "webm8" | "gif" | "wav" | "png";

export interface ExportOptions {
  shortSide: number; // qualidade = menor lado da saída (240…4320)
  fps: number; // 24…60 (GIF usa o próprio)
  bitrate: number; // bits/s
  format: VideoFormat;
}

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
 * Exporta a timeline inteira em tempo real: canvas → captureStream + áudio do AudioEngine.
 */
export async function exportVideo(
  opts: ExportOptions,
  onProgress: (p: number, stage: string) => void
): Promise<ExportResult> {
  const { project, tracks, clips } = useProject.getState();
  const duration = usePlayback.getState().duration;
  if (duration <= 0) throw new Error("Timeline vazia — adicione mídia antes de exportar.");
  const picked = pickMime(opts.format === "gif" || opts.format === "wav" || opts.format === "png" ? "mp4" : opts.format);
  if (!picked) throw new Error("Seu navegador não suporta gravação de vídeo (MediaRecorder). Use Chrome/Edge atualizado.");

  const { W, H } = outputSize(project, opts.shortSide);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

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

  // vai pro início, pausa e toca do começo ao fim renderizando no canvas de exportação
  engine.pause();
  engine.seek(0);
  await new Promise((r) => setTimeout(r, 350)); // deca os seeks assentarem

  const done = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });
  rec.start(250);
  usePlayback.getState().setPlaying(true);
  audioEngine.ensureContext();

  await new Promise<void>((resolve) => {
    const step = () => {
      const pb = usePlayback.getState();
      const t = pb.playhead;
      drawFrame(ctx, project, tracks, clips, t, { getElement: (id) => engine.getElement(id) });
      onProgress(Math.min(0.999, t / duration), "Gravando");
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
  onProgress(1, "Finalizando");

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
 * sem tempo real): decodifica cada arquivo uma vez e agenda na OfflineAudioContext.
 */
export async function exportWav(onProgress: (p: number) => void): Promise<ExportResult> {
  const { clips, tracks, project } = useProject.getState();
  const duration = usePlayback.getState().duration;
  if (duration <= 0) throw new Error("Timeline vazia — adicione mídia antes de exportar.");

  const AC: typeof AudioContext = window.AudioContext;
  const probe = new AC();
  const OAC: typeof OfflineAudioContext = window.OfflineAudioContext;
  const off = new OAC(2, Math.ceil(duration * 48000), 48000);
  const decoded = new Map<string, AudioBuffer | null>();

  const withSound = clips.filter((c) => c.kind === "video" || c.kind === "audio");
  let done = 0;
  for (const c of withSound) {
    if (!c.mediaId || decoded.has(c.mediaId)) continue;
    const blob = registry.getBlob(c.mediaId);
    if (!blob) {
      decoded.set(c.mediaId, null);
      continue;
    }
    try {
      decoded.set(c.mediaId, await probe.decodeAudioData(await blob.slice(0).arrayBuffer()));
    } catch {
      decoded.set(c.mediaId, null);
    }
    done++;
    onProgress(0.05 + 0.55 * (done / Math.max(1, new Set(withSound.map((c) => c.mediaId)).size)));
  }
  void probe.close();

  for (const c of withSound) {
    const buf = c.mediaId ? decoded.get(c.mediaId) : null;
    if (!buf) continue;
    const track = tracks.find((t) => t.id === c.trackId);
    if (c.muted || track?.muted) continue;
    const src = off.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.0625, Math.min(16, c.speed || 1));
    const gain = off.createGain();
    // envelope de fades (volume 0→1 na entrada, 1→0 na saída)
    const g0 = Math.max(0.0001, c.volume ?? 1);
    const start = c.start;
    const end = clipEnd(c);
    gain.gain.setValueAtTime(c.fadeIn > 0 ? 0.0001 : g0, start);
    if (c.fadeIn > 0) gain.gain.linearRampToValueAtTime(g0, start + Math.min(c.fadeIn, c.duration));
    if (c.fadeOut > 0) {
      gain.gain.setValueAtTime(g0, Math.max(start, end - c.fadeOut));
      gain.gain.linearRampToValueAtTime(0.0001, end);
    }
    src.connect(gain).connect(off.destination);
    src.start(start, c.inPoint, Math.min(c.duration, (buf.duration - c.inPoint) / (c.speed || 1)));
  }
  onProgress(0.65);
  const rendered = await off.startRendering();
  onProgress(0.9);

  // AudioBuffer → WAV 16-bit (o mesmo empacotador do "extrair áudio")
  const wav = encodeWavFromBuffer(rendered);
  onProgress(1);
  void project;
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
