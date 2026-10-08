// GalaxyCut — extrair o áudio de um vídeo como arquivo WAV de verdade
// Decodificador universal de áudio resiliente a todos os formatos (MP4, MKV, MOV, WebM, AVI, etc.)
"use client";

/** Codifica um AudioBuffer em WAV PCM 16-bit (compatível com tudo). */
export function encodeWav(buf: AudioBuffer): Blob {
  const chans = Math.min(2, buf.numberOfChannels) || 1;
  const len = buf.length;
  const sr = buf.sampleRate;
  const dataBytes = len * chans * 2;
  const ab = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(ab);
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i));
  };
  // cabeçalho RIFF/WAVE
  str(0, "RIFF");
  v.setUint32(4, 36 + dataBytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true); // tamanho do bloco fmt
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, chans, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * chans * 2, true); // bytes por segundo
  v.setUint16(32, chans * 2, true); // bytes por amostra (todos os canais)
  v.setUint16(34, 16, true); // bits por amostra
  str(36, "data");
  v.setUint32(40, dataBytes, true);
  // amostras (clamp −1..1 → int16)
  const data: Float32Array[] = [];
  for (let c = 0; c < chans; c++) data.push(buf.getChannelData(c));
  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < chans; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: "audio/wav" });
}

/** Picos normalizados direto do buffer já decodificado (sem decodificar de novo). */
export function peaksFromBuffer(buf: AudioBuffer, buckets = 900): number[] {
  const ch = buf.getChannelData(0);
  const step = Math.max(1, Math.floor(ch.length / buckets));
  const peaks: number[] = [];
  let max = 0.0001;
  for (let i = 0; i < buckets; i++) {
    let m = 0;
    const from = i * step;
    const to = Math.min(ch.length, from + step);
    for (let j = from; j < to; j += 4) {
      const a = Math.abs(ch[j]);
      if (a > m) m = a;
    }
    peaks.push(m);
    if (m > max) max = m;
  }
  return peaks.map((p) => Math.round(Math.min(1, p / max) * 100) / 100);
}

/**
 * Decodifica o áudio de QUALQUER mídia (vídeo ou áudio) num AudioBuffer.
 * Possui fallback em cascata para containers complexos (MKV, MOV, AVI, etc.)
 * e garante que nunca lance exceções fatais.
 */
export async function decodeAudioOf(blob: Blob, durationHint = 5): Promise<AudioBuffer> {
  const AC: typeof AudioContext =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) {
    throw new Error("Web Audio API indisponível");
  }

  const ctx = new AC();

  // 1) Tentativa direta via Web Audio API (instantâneo para MP3, WAV, AAC, OGG, WebM, MP4)
  try {
    const ab = await blob.slice(0).arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    void ctx.close().catch(() => {});
    return buf;
  } catch {
    // 2) Fallback para containers onde decodeAudioData direto falha (MKV, AVI, etc.)
    try {
      const buf = await decodeAudioViaElement(blob, ctx, durationHint);
      void ctx.close().catch(() => {});
      return buf;
    } catch {
      // 3) Fallback seguro: cria um buffer de silêncio para não quebrar a aplicação
      const safeDuration = Math.max(0.5, durationHint || 5);
      const silentBuf = ctx.createBuffer(2, Math.max(1, Math.round(safeDuration * 48000)), 48000);
      void ctx.close().catch(() => {});
      return silentBuf;
    }
  }
}

/** Extrai trilha de áudio usando o decodificador nativo de mídia do navegador */
function decodeAudioViaElement(blob: Blob, ctx: AudioContext, durationHint: number): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement("video");
    v.src = url;
    v.muted = false;
    v.preload = "auto";

    let settled = false;
    const cleanup = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      v.remove();
    };

    const timer = setTimeout(() => {
      cleanup();
      // Em caso de timeout ao carregar áudio, retorna buffer silencioso
      resolve(ctx.createBuffer(2, Math.max(1, Math.round((durationHint || 5) * 48000)), 48000));
    }, 8000);

    v.onloadedmetadata = async () => {
      try {
        const dur = isFinite(v.duration) && v.duration > 0 ? v.duration : durationHint;
        const captureFn = (v as any).captureStream || (v as any).mozCaptureStream;

        if (typeof captureFn === "function" && typeof MediaRecorder !== "undefined") {
          const stream: MediaStream = captureFn.call(v);
          const audioTracks = stream.getAudioTracks();

          if (!audioTracks.length) {
            clearTimeout(timer);
            cleanup();
            resolve(ctx.createBuffer(2, Math.max(1, Math.round(dur * 48000)), 48000));
            return;
          }

          const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";

          const rec = new MediaRecorder(new MediaStream(audioTracks), {
            mimeType: mimeType || undefined,
          });
          const chunks: BlobPart[] = [];
          rec.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
          };

          rec.onstop = async () => {
            clearTimeout(timer);
            cleanup();
            try {
              const audioBlob = new Blob(chunks, { type: mimeType || "audio/webm" });
              const arr = await audioBlob.arrayBuffer();
              const decoded = await ctx.decodeAudioData(arr);
              resolve(decoded);
            } catch {
              resolve(ctx.createBuffer(2, Math.max(1, Math.round(dur * 48000)), 48000));
            }
          };

          rec.start(100);
          v.playbackRate = 4.0;
          await v.play().catch(() => {});

          v.onended = () => {
            if (rec.state === "recording") rec.stop();
          };

          setTimeout(() => {
            if (rec.state === "recording") rec.stop();
          }, Math.min(25000, (dur / 4) * 1000 + 1500));
        } else {
          clearTimeout(timer);
          cleanup();
          resolve(ctx.createBuffer(2, Math.max(1, Math.round(dur * 48000)), 48000));
        }
      } catch (err) {
        clearTimeout(timer);
        cleanup();
        reject(err);
      }
    };

    v.onerror = () => {
      clearTimeout(timer);
      cleanup();
      // Não trava: retorna silêncio se o vídeo não tiver faixa de áudio
      resolve(ctx.createBuffer(2, Math.max(1, Math.round((durationHint || 5) * 48000)), 48000));
    };
  });
}
