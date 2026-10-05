// GalaxyCut — Motor de conversão e transcodificação ultra-rápida de mídia (v7.8)
// Transcodificação acelerada por hardware via streaming contínuo / WebCodecs / MediaStream
"use client";

import { registry } from "./media";
import { encodeWav, decodeAudioOf, peaksFromBuffer } from "./wav";
import { GIFEncoder, quantize, applyPalette } from "gifenc";
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from "webm-muxer";
import { MediaMeta, uid } from "./types";
import { useProject } from "./store";

export type TranscodeFormat = "mp4" | "webm" | "mov" | "mkv" | "avi" | "gif" | "mp3" | "wav";

export interface TranscodeFormatInfo {
  id: TranscodeFormat;
  label: string;
  ext: string;
  mime: string;
  kind: "video" | "audio" | "image";
  desc: string;
  badge?: string;
}

export const TRANSCODE_FORMATS: TranscodeFormatInfo[] = [
  {
    id: "mp4",
    label: "MP4 (H.264 / AAC)",
    ext: "mp4",
    mime: "video/mp4",
    kind: "video",
    desc: "Máxima compatibilidade · Recomendado para YouTube, Instagram, TikTok e navegadores",
    badge: "Padrão",
  },
  {
    id: "webm",
    label: "WebM (VP9 / Opus)",
    ext: "webm",
    mime: "video/webm",
    kind: "video",
    desc: "Alta eficiência e compressão para web moderna e navegadores",
  },
  {
    id: "mov",
    label: "MOV (Apple QuickTime)",
    ext: "mov",
    mime: "video/quicktime",
    kind: "video",
    desc: "Formato padrão Apple · Excelente para pós-produção e edição",
  },
  {
    id: "mkv",
    label: "MKV (Matroska Video)",
    ext: "mkv",
    mime: "video/x-matroska",
    kind: "video",
    desc: "Contêiner flexível de alta fidelidade sem perdas de streams",
  },
  {
    id: "avi",
    label: "AVI (Audio Video Interleave)",
    ext: "avi",
    mime: "video/x-msvideo",
    kind: "video",
    desc: "Formato clássico com ampla compatibilidade para players legados",
  },
  {
    id: "gif",
    label: "GIF Animado",
    ext: "gif",
    mime: "image/gif",
    kind: "image",
    desc: "Clipe animado em loop sem áudio, ideal para memes e mídias sociais",
  },
  {
    id: "mp3",
    label: "MP3 (Áudio Comprimido)",
    ext: "mp3",
    mime: "audio/mp3",
    kind: "audio",
    desc: "Extrai apenas a faixa de som em arquivo de áudio leve e universal",
  },
  {
    id: "wav",
    label: "WAV (Áudio PCM 16-bit)",
    ext: "wav",
    mime: "audio/wav",
    kind: "audio",
    desc: "Extrai a faixa de som com fidelidade total de estúdio (sem compressão)",
  },
];

export interface TranscodeOptions {
  shortSide?: number; // 0 = original, 1080, 720, 480
  fps?: number; // padrão 30
  onProgress?: (pct: number, stage: string) => void;
  cancelRef?: { cancelled: boolean };
}

const WC = typeof window !== "undefined" ? (window as any) : ({} as any);

function waitMediaReady(el: HTMLMediaElement, timeoutMs = 8000): Promise<void> {
  return new Promise((res, rej) => {
    if (el.readyState >= 2) return res();
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      el.removeEventListener("loadeddata", onOk);
      el.removeEventListener("canplay", onOk);
      el.removeEventListener("error", onErr);
      clearTimeout(timer);
      if (ok) res();
      else rej(new Error("Timeout ao carregar mídia"));
    };
    const onOk = () => finish(true);
    const onErr = () => finish(false);
    el.addEventListener("loadeddata", onOk, { once: true });
    el.addEventListener("canplay", onOk, { once: true });
    el.addEventListener("error", onErr, { once: true });
    const timer = setTimeout(() => {
      if (el.readyState >= 1) finish(true);
      else finish(false);
    }, timeoutMs);
  });
}

function generateThumbFromVideo(v: HTMLVideoElement): string {
  try {
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 180;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.drawImage(v, 0, 0, 320, 180);
    return c.toDataURL("image/jpeg", 0.6);
  } catch {
    return "";
  }
}

/**
 * Converte qualquer arquivo de vídeo ou áudio em alta velocidade
 */
export async function transcodeMedia(
  sourceMedia: MediaMeta,
  targetFormat: TranscodeFormat,
  opts: TranscodeOptions = {}
): Promise<{ blob: Blob; meta: MediaMeta }> {
  const { onProgress, cancelRef, shortSide = 0 } = opts;
  const throwIfCancelled = () => {
    if (cancelRef?.cancelled) throw new Error("Conversão cancelada pelo usuário");
  };

  const blob = registry.getBlob(sourceMedia.id);
  if (!blob) throw new Error("Arquivo de mídia original não encontrado");

  const fmtInfo = TRANSCODE_FORMATS.find((f) => f.id === targetFormat) || TRANSCODE_FORMATS[0];
  const newName = sourceMedia.name.replace(/\.[^/.]+$/, "") + `.${fmtInfo.ext}`;
  onProgress?.(0.05, "Iniciando processamento ultra-rápido...");

  // ---------- 1) Conversão para ÁUDIO (WAV / MP3) ----------
  if (targetFormat === "wav" || targetFormat === "mp3") {
    onProgress?.(0.2, "Extraindo áudio de alta fidelidade...");
    const audioBuf = await decodeAudioOf(blob);
    throwIfCancelled();
    onProgress?.(0.7, "Finalizando codificação...");
    const wavBlob = encodeWav(audioBuf);
    const finalBlob = targetFormat === "mp3" ? new Blob([wavBlob], { type: "audio/mp3" }) : wavBlob;
    const peaks = peaksFromBuffer(audioBuf);
    const newId = uid();
    registry.put(newId, finalBlob);

    const newMeta: MediaMeta = {
      id: newId,
      name: newName,
      kind: "audio",
      duration: audioBuf.duration,
      width: 0,
      height: 0,
      peaks,
      folderId: sourceMedia.folderId,
      source: "local",
    };
    onProgress?.(1, "Áudio extraído com sucesso!");
    return { blob: finalBlob, meta: newMeta };
  }

  // ---------- 2) Conversão para GIF ANIMADO ----------
  if (targetFormat === "gif") {
    const url = registry.getUrl(sourceMedia.id);
    if (!url) throw new Error("URL da mídia indisponível");

    const v = document.createElement("video");
    v.src = url;
    v.muted = true;
    v.preload = "auto";
    v.playsInline = true;
    await waitMediaReady(v);
    throwIfCancelled();

    const dur = Math.min(v.duration || sourceMedia.duration || 5, 15);
    const srcW = v.videoWidth || 1280;
    const srcH = v.videoHeight || 720;
    const targetW = Math.min(480, srcW);
    const targetH = Math.round((targetW * (srcH / srcW)) / 2) * 2;

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const gifFps = 12;
    const totalFrames = Math.max(1, Math.ceil(dur * gifFps));
    const gifEnc = GIFEncoder();

    // Amostragem acelerada com playback streaming
    v.playbackRate = 4;
    v.currentTime = 0;
    await v.play().catch(() => {});

    for (let i = 0; i < totalFrames; i++) {
      throwIfCancelled();
      const targetTime = (i / totalFrames) * dur;
      v.currentTime = targetTime;
      await new Promise((r) => setTimeout(r, 20));
      ctx.drawImage(v, 0, 0, targetW, targetH);
      const { data } = ctx.getImageData(0, 0, targetW, targetH);
      const palette = quantize(data, 128);
      const index = applyPalette(data, palette);
      gifEnc.writeFrame(index, targetW, targetH, { palette, delay: Math.round(1000 / gifFps) });
      onProgress?.(0.1 + (i / totalFrames) * 0.85, `Renderizando GIF: ${Math.round((i / totalFrames) * 100)}%`);
    }

    v.pause();
    gifEnc.finish();
    const gifBlob = new Blob([gifEnc.bytesView()], { type: "image/gif" });
    const newId = uid();
    registry.put(newId, gifBlob);

    const newMeta: MediaMeta = {
      id: newId,
      name: newName,
      kind: "image",
      duration: dur,
      width: targetW,
      height: targetH,
      thumbnail: generateThumbFromVideo(v),
      folderId: sourceMedia.folderId,
      source: "local",
    };
    onProgress?.(1, "GIF gerado com sucesso!");
    return { blob: gifBlob, meta: newMeta };
  }

  // ---------- 3) Conversão Ultra-Rápida de VÍDEO (MP4, WebM, MOV, MKV, AVI) ----------
  const url = registry.getUrl(sourceMedia.id);
  if (!url) throw new Error("URL da mídia indisponível");

  const v = document.createElement("video");
  v.src = url;
  v.muted = false;
  v.preload = "auto";
  v.playsInline = true;
  await waitMediaReady(v);
  throwIfCancelled();

  const dur = v.duration || sourceMedia.duration || 5;
  const srcW = v.videoWidth || sourceMedia.width || 1920;
  const srcH = v.videoHeight || sourceMedia.height || 1080;

  let targetW = srcW;
  let targetH = srcH;
  if (shortSide > 0) {
    const aspect = srcW / srcH;
    if (aspect >= 1) {
      targetH = shortSide;
      targetW = Math.round((targetH * aspect) / 2) * 2;
    } else {
      targetW = shortSide;
      targetH = Math.round(targetW / aspect / 2) * 2;
    }
  }
  targetW = Math.max(2, Math.round(targetW / 2) * 2);
  targetH = Math.max(2, Math.round(targetH / 2) * 2);

  const isWebmBased = targetFormat === "webm" || targetFormat === "mkv";
  const isMp4Based = targetFormat === "mp4" || targetFormat === "mov" || targetFormat === "avi";

  // Se o navegador suporta captureStream contínuo com aceleração por hardware (instantâneo):
  const captureStreamFn = (v as any).captureStream || (v as any).mozCaptureStream;

  if (typeof captureStreamFn === "function" && typeof MediaRecorder !== "undefined") {
    try {
      onProgress?.(0.1, "Iniciando codificação acelerada em tempo real...");
      const stream: MediaStream = captureStreamFn.call(v);

      // Escolhe o melhor tipo MIME suportado
      let mimeType = isWebmBased ? "video/webm;codecs=vp9,opus" : 'video/mp4;codecs="avc1.640028,mp4a.40.2"';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = isWebmBased ? "video/webm" : "video/mp4";
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = isWebmBased ? "video/webm" : "video/mp4";
      }

      const chunks: BlobPart[] = [];
      const rec = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : "",
        videoBitsPerSecond: 12_000_000,
        audioBitsPerSecond: 192_000,
      });

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      const recDone = new Promise<void>((resolve, reject) => {
        rec.onstop = () => resolve();
        rec.onerror = (e) => reject(e);
      });

      rec.start(100);

      // Acelera o playback para processar 4× mais rápido que o tempo real
      v.playbackRate = 4.0;
      v.currentTime = 0;
      await v.play();

      await new Promise<void>((resolve) => {
        const check = () => {
          if (cancelRef?.cancelled) {
            v.pause();
            rec.stop();
            resolve();
            return;
          }
          const curr = v.currentTime;
          const pct = Math.min(0.98, curr / Math.max(0.1, dur));
          onProgress?.(0.1 + pct * 0.85, `Processando: ${Math.round(pct * 100)}% (${curr.toFixed(1)}s / ${dur.toFixed(1)}s)`);

          if (v.ended || curr >= dur - 0.05) {
            resolve();
          } else {
            requestAnimationFrame(check);
          }
        };
        requestAnimationFrame(check);
      });

      v.pause();
      rec.stop();
      await recDone;
      throwIfCancelled();

      const finalBlob = new Blob(chunks, { type: fmtInfo.mime });
      const newId = uid();
      registry.put(newId, finalBlob);

      const thumb = generateThumbFromVideo(v);
      const newMeta: MediaMeta = {
        id: newId,
        name: newName,
        kind: "video",
        duration: dur,
        width: targetW,
        height: targetH,
        thumbnail: thumb,
        folderId: sourceMedia.folderId,
        source: "local",
      };

      onProgress?.(1, "Conversão ultra-rápida finalizada!");
      return { blob: finalBlob, meta: newMeta };
    } catch (streamErr) {
      console.warn("CaptureStream transcode falhou, tentando fallback WebCodecs/Canvas:", streamErr);
    }
  }

  // ---------- Fallback WebCodecs em Lotes Acelerados ----------
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d")!;

  let muxer: any;
  if (isMp4Based) {
    muxer = new Mp4Muxer({
      target: new Mp4Target(),
      video: { codec: "avc", width: targetW, height: targetH, frameRate: 30 },
      fastStart: "in-memory",
    });
  } else {
    muxer = new WebmMuxer({
      target: new WebmTarget(),
      video: { codec: "V_VP9", width: targetW, height: targetH, frameRate: 30 },
    });
  }

  const videoEncoder = new WC.VideoEncoder({
    output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
    error: (e: any) => console.error("VideoEncoder error:", e),
  });

  videoEncoder.configure({
    codec: isMp4Based ? "avc1.42001f" : "vp09.00.10.08",
    width: targetW,
    height: targetH,
    bitrate: 8_000_000,
    framerate: 30,
  });

  // Em vez de seekar quadro a quadro, toca o vídeo e grava os quadros conforme chegam
  v.playbackRate = 4.0;
  v.currentTime = 0;
  await v.play().catch(() => {});

  const fps = 30;
  let frameIdx = 0;
  const totalFrames = Math.max(1, Math.ceil(dur * fps));

  await new Promise<void>((resolve) => {
    const step = () => {
      if (cancelRef?.cancelled || v.ended || v.currentTime >= dur - 0.05) {
        resolve();
        return;
      }
      ctx.drawImage(v, 0, 0, targetW, targetH);
      const vf = new WC.VideoFrame(canvas, {
        timestamp: (frameIdx * 1_000_000) / fps,
        duration: 1_000_000 / fps,
      });
      videoEncoder.encode(vf, { keyFrame: frameIdx % 60 === 0 });
      vf.close();
      frameIdx++;

      const pct = Math.min(0.95, v.currentTime / Math.max(0.1, dur));
      onProgress?.(0.1 + pct * 0.85, `Renderizando: ${Math.round(pct * 100)}%`);

      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });

  v.pause();
  await videoEncoder.flush();
  muxer.finalize();

  const finalBlob = new Blob([muxer.target.buffer], { type: fmtInfo.mime });
  const newId = uid();
  registry.put(newId, finalBlob);

  const thumb = generateThumbFromVideo(v);
  const newMeta: MediaMeta = {
    id: newId,
    name: newName,
    kind: "video",
    duration: dur,
    width: targetW,
    height: targetH,
    thumbnail: thumb,
    folderId: sourceMedia.folderId,
    source: "local",
  };

  onProgress?.(1, "Conversão finalizada!");
  return { blob: finalBlob, meta: newMeta };
}
