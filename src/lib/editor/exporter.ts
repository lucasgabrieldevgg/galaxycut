// GaláxiaCut — exportação de vídeo (MediaRecorder) e legendas SRT
"use client";

import { useProject, usePlayback } from "./store";
import { engine } from "./playback";
import { audioEngine } from "./audio";
import { drawFrame } from "./render";
import { Clip, ProjectMeta, clipEnd, fmtSrtTime } from "./types";

export interface ExportOptions {
  height: number; // 720 ou 1080 (menor lado)
  fps: number; // 30 ou 60
  bitrate: number; // bits/s
}

export interface ExportResult {
  blob: Blob;
  ext: string;
  mime: string;
}

function pickMime(): { mime: string; ext: string } | null {
  const candidates = [
    { mime: 'video/mp4;codecs="avc1.640028,mp4a.40.2"', ext: "mp4" },
    { mime: "video/mp4", ext: "mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: "webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: "webm" },
    { mime: "video/webm", ext: "webm" },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return null;
}

export function canExport(): boolean {
  return pickMime() !== null;
}

export function exportFormatLabel(): string {
  const m = pickMime();
  return m ? m.ext.toUpperCase() : "—";
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
  const picked = pickMime();
  if (!picked) throw new Error("Seu navegador não suporta gravação de vídeo (MediaRecorder). Use Chrome/Edge atualizado.");

  // resolução final mantendo o aspecto do projeto
  const aspect = project.width / project.height;
  let W: number;
  let H: number;
  if (aspect < 1) {
    H = opts.height; // 9:16 → 1080 = altura
    W = Math.round(H * aspect / 2) * 2;
  } else {
    W = opts.height === 1080 ? (aspect > 1.2 ? 1920 : 1080) : opts.height === 720 ? (aspect > 1.2 ? 1280 : 720) : opts.height;
    H = Math.round(W / aspect / 2) * 2;
  }

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

  const startWall = performance.now();
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
  void startWall;

  usePlayback.getState().setPlaying(false);
  engine.pause();
  await new Promise((r) => setTimeout(r, 300));
  rec.stop();
  await done;
  onProgress(1, "Finalizando");

  const blob = new Blob(chunks, { type: picked.mime });
  return { blob, ext: picked.ext, mime: picked.mime };
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
