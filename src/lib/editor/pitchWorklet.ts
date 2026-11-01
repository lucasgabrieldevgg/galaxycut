// GalaxyCut — pitch-shifter REAL em AudioWorklet (granular com duas cabeças
// de leitura e janela Hann). Roda tanto no AudioContext (prévia) quanto no
// OfflineAudioContext (exportação) — paridade por construção.
//
// Por que worklet: pitch-shift de verdade exige time-stretch — o elemento de
// mídia só oferece `playbackRate`, que muda pitch E velocidade juntos (a voz
// acelera junto). Aqui o tempo continua 1:1 e só a altura muda.
//
// Algoritmo (clássico de 2 grãos): um delay varre linearmente enquanto duas
// cabeças de leitura, defasadas meio grão, se cruzam com fade Hann — a soma
// das janelas é constante (1.0), então não há "respiração" de volume.
"use client";

/** Código-fonte do processador (string) — é injetado via Blob URL, então
 *  funciona em https, localhost e até file:// no Electron, sem fetch externo. */
export const PITCH_WORKLET_SRC = `
class GCPitchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "semitones", defaultValue: 0, minValue: -24, maxValue: 24, automationRate: "a-rate" },
      { name: "mix", defaultValue: 1, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }
  constructor() {
    super();
    this.size = 32768; // ~0.68 s @48 kHz de ring buffer
    this.grain = Math.floor(sampleRate * 0.085); // grão de ~85 ms
    if (this.grain < 256) this.grain = 256;
    this.bufL = new Float32Array(this.size);
    this.bufR = new Float32Array(this.size);
    this.w = 0; // posição de escrita
    this.phase = 0; // fase do varredor (pode andar p/ trás = pitch down)
    this.bypass = true;
  }
  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output.length) return true;
    const frames = output[0].length;
    const st = params.semitones.length > 1 ? null : params.semitones[0];
    const mix = params.mix[0];
    const chs = output.length;
    const inL = (input && input[0]) || null;
    const inR = (input && (chs > 1 ? input[1] : input[0])) || inL || null;

    for (let n = 0; n < frames; n++) {
      const semis = st === null ? params.semitones[n] : st;
      const ratio = Math.pow(2, semis / 12);
      // escreve a amostra de entrada no ring buffer
      this.bufL[this.w] = inL ? inL[n] : 0;
      this.bufR[this.w] = inR ? inR[n] : 0;

      if (Math.abs(semis) < 0.01 || mix <= 0.001) {
        // sem pitch: passa direto (latência zero, sem artefato)
        for (let ch = 0; ch < chs; ch++) {
          const out = output[ch];
          const src = ch === 0 ? this.bufL : this.bufR;
          out[n] = mix <= 0.001 ? (ch === 0 ? (inL ? inL[n] : 0) : inR ? inR[n] : 0) : src[this.w];
        }
        this.w = (this.w + 1) % this.size;
        continue;
      }

      // taxa do varredor: delay anda (1 - ratio) amostras por amostra de saída
      const rate = (ratio - 1) / this.grain;
      this.phase += rate;
      let phi = this.phase % 1;
      if (phi < 0) phi += 1;
      const phiB = phi >= 0.5 ? phi - 0.5 : phi + 0.5;

      // janelas Hann complementares (somam 1)
      const winA = 0.5 * (1 - Math.cos(2 * Math.PI * phi));
      const winB = 1 - winA;

      // delays: 0.5g..1.5g (varre conforme a fase)
      const dA = this.grain * (1.5 - phi);
      const dB = this.grain * (1.5 - phiB);

      let accL = 0;
      let accR = 0;
      for (let k = 0; k < 2; k++) {
        const wgt = k === 0 ? winA : winB;
        if (wgt < 0.0005) continue;
        const d = k === 0 ? dA : dB;
        let pos = this.w - d;
        while (pos < 0) pos += this.size;
        while (pos >= this.size) pos -= this.size;
        // interpolação linear (evita "escadinha" de ruído)
        const i0 = Math.floor(pos);
        const frac = pos - i0;
        const i1 = (i0 + 1) % this.size;
        accL += wgt * (this.bufL[i0] * (1 - frac) + this.bufL[i1] * frac);
        accR += wgt * (this.bufR[i0] * (1 - frac) + this.bufR[i1] * frac);
      }

      const dryW = 1 - mix;
      for (let ch = 0; ch < chs; ch++) {
        const out = output[ch];
        const dry = ch === 0 ? (inL ? inL[n] : 0) : inR ? inR[n] : 0;
        const wet = ch === 0 ? accL : accR;
        out[n] = dry * dryW + wet * mix;
      }
      this.w = (this.w + 1) % this.size;
    }
    return true;
  }
}
registerProcessor("gc-pitch", GCPitchProcessor);
`;

let cachedUrl: string | null = null;

/** Blob URL do módulo (criado uma vez, revogado nunca — o app é SPA de vida longa). */
function moduleUrl(): string {
  if (!cachedUrl) {
    cachedUrl = URL.createObjectURL(new Blob([PITCH_WORKLET_SRC], { type: "application/javascript" }));
  }
  return cachedUrl;
}

/** contextos que já têm o módulo carregado (WeakSet: não segura o ctx vivo) */
const loaded = new WeakSet<BaseAudioContext>();
/** carregamentos em andamento (evita addModule duplicado no mesmo ctx) */
const loading = new Map<BaseAudioContext, Promise<boolean>>();

/** Carrega o worklet de pitch num contexto (AudioContext OU OfflineAudioContext).
 *  Resolve true quando pronto; false se o browser recusar (aí as vias de pitch
 *  seguem em bypass honesto — o resto do efeito continua funcionando). */
export function ensurePitchModule(ctx: BaseAudioContext): Promise<boolean> {
  if (loaded.has(ctx)) return Promise.resolve(true);
  const inFlight = loading.get(ctx);
  if (inFlight) return inFlight;
  const p = (ctx as AudioContext)
    .audioWorklet.addModule(moduleUrl())
    .then(() => {
      loaded.add(ctx);
      loading.delete(ctx);
      return true;
    })
    .catch(() => {
      loading.delete(ctx);
      return false;
    });
  loading.set(ctx, p);
  return p;
}

/** O módulo já está pronto neste contexto? (sincrônico — usado no build das vias) */
export function pitchModuleReady(ctx: BaseAudioContext): boolean {
  return loaded.has(ctx);
}

/** Cria o nó de pitch (ou null se o módulo ainda não carregou neste contexto). */
export function createPitchNode(ctx: BaseAudioContext): AudioWorkletNode | null {
  if (!loaded.has(ctx)) return null;
  try {
    return new AudioWorkletNode(ctx, "gc-pitch", { outputChannelCount: [2] });
  } catch {
    return null;
  }
}
