// GalaxyCut — extrair o áudio de um vídeo como arquivo WAV de verdade
// (antes o clipe extraído apontava pro arquivo de VÍDEO — agora vira uma
// mídia de áudio própria, com waveform, salva no IndexedDB e listada na aba Áudio)
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

/** Decodifica o áudio de QUALQUER mídia (vídeo ou áudio) num AudioBuffer. */
export async function decodeAudioOf(blob: Blob): Promise<AudioBuffer> {
  const AC: typeof AudioContext = window.AudioContext;
  const ctx = new AC();
  try {
    return await ctx.decodeAudioData(await blob.slice(0).arrayBuffer());
  } finally {
    void ctx.close();
  }
}
