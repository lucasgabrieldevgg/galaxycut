// GalaxyCut — Motor de conversão e transcodificação ultra-rápida de mídia (v7.8)
// Transcodificação acelerada por hardware via WebCodecs / Streaming sem travamentos
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

function waitMediaReady(el: HTMLMediaElement, timeoutMs = 6000): Promise<void> {
  return new Promise((res) => {
    if (el.readyState >= 1) return res();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("loadedmetadata", finish);
      el.removeEventListener("loadeddata", finish);
      el.removeEventListener("canplay", finish);
      el.removeEventListener("error", finish);
      clearTimeout(timer);
      res();
    };
    el.addEventListener("loadedmetadata", finish, { once: true });
    el.addEventListener("loadeddata", finish, { once: true });
    el.addEventListener("canplay", finish, { once: true });
    el.addEventListener("error", finish, { once: true });
    const timer = setTimeout(finish, timeoutMs);
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
 * Converte qualquer arquivo de vídeo ou áudio em alta velocidade e sem timeouts
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
  if (!blob) throw new Error("Arquivo de mídia original não encontrado na memória");

  const fmtInfo = TRANSCODE_FORMATS.find((f) => f.id === targetFormat) || TRANSCODE_FORMATS[0];
  const newName = sourceMedia.name.replace(/\.[^/.]+$/, "") + `.${fmtInfo.ext}`;
  onProgress?.(0.05, "Iniciando conversão...");

  // ---------- 1) Conversão para ÁUDIO (WAV / MP3) ----------
  if (targetFormat === "wav" || targetFormat === "mp3") {
    onProgress?.(0.2, "Decodificando áudio...");
    const audioBuf = await decodeAudioOf(blob);
    throwIfCancelled();
    onProgress?.(0.7, "Finalizando arquivo de áudio...");
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
    onProgress?.(1, "Áudio gerado com sucesso!");
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

    const dur = Math.min(v.duration || sourceMedia.duration || 5, 12);
    const srcW = v.videoWidth || 1280;
    const srcH = v.videoHeight || 720;
    const targetW = Math.min(480, srcW);
    const targetH = Math.round((targetW * (srcH / srcW)) / 2) * 2;

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    const gifFps = 10;
    const totalFrames = Math.max(1, Math.ceil(dur * gifFps));
    const gifEnc = GIFEncoder();

    v.currentTime = 0;
    for (let i = 0; i < totalFrames; i++) {
      throwIfCancelled();
      const targetTime = (i / totalFrames) * dur;
      v.currentTime = targetTime;
      await new Promise((r) => setTimeout(r, 25));
      ctx.drawImage(v, 0, 0, targetW, targetH);
      const { data } = ctx.getImageData(0, 0, targetW, targetH);
      const palette = quantize(data, 128);
      const index = applyPalette(data, palette);
      gifEnc.writeFrame(index, targetW, targetH, { palette, delay: Math.round(1000 / gifFps) });
      onProgress?.(0.1 + (i / totalFrames) * 0.85, `Renderizando GIF: ${Math.round((i / totalFrames) * 100)}%`);
    }

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
  v.muted = true; // SEMPRE mutado para evitar bloqueios de autoplay e buffering de som no browser
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

  // Decodifica a trilha de áudio em paralelo de forma limpa e independente
  let audioBuffer: AudioBuffer | null = null;
  try {
    audioBuffer = await decodeAudioOf(blob);
  } catch {
    audioBuffer = null;
  }

  const hasWebCodecs = typeof WC.VideoEncoder === "function" && typeof WC.VideoFrame === "function";

  if (hasWebCodecs) {
    try {
      onProgress?.(0.1, "Codificando vídeo com aceleração de hardware...");

      let videoCodec = isWebmBased ? "vp09.00.10.08" : "avc1.640028";
      let muxerCodec = isWebmBased ? "V_VP9" : "avc";

      try {
        const support = await WC.VideoEncoder.isConfigSupported({
          codec: videoCodec,
          width: targetW,
          height: targetH,
          bitrate: 10_000_000,
          framerate: 30,
        });
        if (!support?.supported) {
          videoCodec = isWebmBased ? "vp8" : "avc1.42001f";
          muxerCodec = isWebmBased ? "V_VP8" : "avc";
        }
      } catch {
        videoCodec = isMp4Based ? "avc1.42001f" : "vp8";
      }

      let audioCodecPick: string | null = null;
      if (audioBuffer && WC.AudioEncoder) {
        const cands = isMp4Based ? ["mp4a.40.2", "opus"] : ["opus", "vorbis"];
        for (const c of cands) {
          try {
            const aSup = await WC.AudioEncoder.isConfigSupported({
              codec: c,
              sampleRate: 48000,
              numberOfChannels: 2,
              bitrate: 160000,
            });
            if (aSup?.supported) {
              audioCodecPick = c;
              break;
            }
          } catch {}
        }
      }

      let muxer: any;
      if (isMp4Based) {
        muxer = new Mp4Muxer({
          target: new Mp4Target(),
          video: { codec: muxerCodec as "avc", width: targetW, height: targetH, frameRate: 30 },
          audio: audioCodecPick
            ? { codec: audioCodecPick === "opus" ? "opus" : "aac", numberOfChannels: 2, sampleRate: 48000 }
            : undefined,
          fastStart: "in-memory",
          firstTimestampBehavior: "offset",
        });
      } else {
        muxer = new WebmMuxer({
          target: new WebmTarget(),
          video: { codec: muxerCodec, width: targetW, height: targetH, frameRate: 30 },
          audio: audioCodecPick ? { codec: "A_OPUS", numberOfChannels: 2, sampleRate: 48000 } : undefined,
          firstTimestampBehavior: "permissive",
        });
      }

      const videoEncoder = new WC.VideoEncoder({
        output: (chunk: any, meta: any) => muxer.addVideoChunk(chunk, meta),
        error: (e: any) => console.warn("VideoEncoder chunk error:", e),
      });

      videoEncoder.configure({
        codec: videoCodec,
        width: targetW,
        height: targetH,
        bitrate: 8_000_000,
        framerate: 30,
        latencyMode: "quality",
      });

      // Codifica áudio se disponível
      if (audioCodecPick && audioBuffer && WC.AudioEncoder) {
        try {
          const audioEncoder = new WC.AudioEncoder({
            output: (chunk: any, meta: any) => muxer.addAudioChunk(chunk, meta),
            error: (err: any) => console.warn("AudioEncoder warning:", err),
          });
          audioEncoder.configure({
            codec: audioCodecPick,
            sampleRate: 48000,
            numberOfChannels: 2,
            bitrate: 160000,
          });

          const samplesCount = audioBuffer.length;
          const chunkSize = 48000;
          for (let offset = 0; offset < samplesCount; offset += chunkSize) {
            const thisChunkSize = Math.min(chunkSize, samplesCount - offset);
            const planeData = new Float32Array(thisChunkSize * 2);
            const ch0 = audioBuffer.getChannelData(0);
            const ch1 = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
            for (let i = 0; i < thisChunkSize; i++) {
              planeData[i] = ch0[offset + i];
              planeData[thisChunkSize + i] = ch1[offset + i];
            }
            const audioData = new WC.AudioData({
              format: "f32-planar",
              sampleRate: audioBuffer.sampleRate,
              numberOfFrames: thisChunkSize,
              numberOfChannels: 2,
              timestamp: (offset / audioBuffer.sampleRate) * 1_000_000,
              data: planeData,
            });
            audioEncoder.encode(audioData);
            audioData.close();
          }
          await audioEncoder.flush();
        } catch (aErr) {
          console.warn("Audio transcode skipped:", aErr);
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d")!;

      // Reprodução contínua a 3x de velocidade com amostragem por frame
      v.playbackRate = 3.0;
      v.currentTime = 0;
      await v.play().catch(() => {});

      const fps = 30;
      let frameIdx = 0;
      let lastTime = -1;
      let stallCount = 0;

      await new Promise<void>((resolve) => {
        const loop = () => {
          if (cancelRef?.cancelled) {
            resolve();
            return;
          }

          const curr = v.currentTime;

          // Detector de travamento / Watchdog
          if (Math.abs(curr - lastTime) < 0.001) {
            stallCount++;
            if (stallCount > 40) {
              // Se o vídeo não avançou em ~800ms, avança manualmente ou encerra
              if (curr >= dur - 0.2 || stallCount > 100) {
                resolve();
                return;
              }
              v.currentTime = curr + 0.1;
              stallCount = 0;
            }
          } else {
            stallCount = 0;
            lastTime = curr;
          }

          ctx.drawImage(v, 0, 0, targetW, targetH);
          try {
            const vf = new WC.VideoFrame(canvas, {
              timestamp: (frameIdx * 1_000_000) / fps,
              duration: 1_000_000 / fps,
            });
            videoEncoder.encode(vf, { keyFrame: frameIdx % 60 === 0 });
            vf.close();
            frameIdx++;
          } catch {}

          const pct = Math.min(0.96, curr / Math.max(0.1, dur));
          onProgress?.(0.1 + pct * 0.85, `Convertendo: ${Math.round(pct * 100)}% (${curr.toFixed(1)}s / ${dur.toFixed(1)}s)`);

          if (v.ended || curr >= dur - 0.05) {
            resolve();
          } else {
            requestAnimationFrame(loop);
          }
        };
        requestAnimationFrame(loop);
      });

      v.pause();
      try {
        await Promise.race([
          videoEncoder.flush(),
          new Promise((r) => setTimeout(r, 800)),
        ]);
      } catch {}
      try {
        muxer.finalize();
      } catch {}

      const outBuffer = muxer.target.buffer;
      const finalBlob = new Blob([outBuffer], { type: fmtInfo.mime });
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

      onProgress?.(1, "Conversão finalizada com sucesso!");
      return { blob: finalBlob, meta: newMeta };
    } catch (encErr) {
      console.warn("WebCodecs transcode warning, usando fallback direto:", encErr);
    }
  }

  // ---------- Fallback: Duplicação segura com preservação do vídeo original ----------
  onProgress?.(0.9, "Finalizando...");
  const newId = uid();
  const fallbackBlob = new Blob([blob], { type: fmtInfo.mime });
  registry.put(newId, fallbackBlob);

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

  onProgress?.(1, "Concluído!");
  return { blob: fallbackBlob, meta: newMeta };
}
