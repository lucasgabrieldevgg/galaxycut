// GalaxyCut — Portão de Ruído (Noise Gate) REAL em AudioWorklet.
// Antes o app tinha a OPÇÃO no diálogo e nos presets, mas NENHUM DSP: o
// "Ruído de fundo" que o dono ouviu era o chiado do microfone passando
// inteiro, porque o botão não fazia nada.
//
// O núcleo matemático (gateGainCurve) vive aqui como função PURA e é
// injetado no worker/worklet via Function.prototype.toString — uma fonte
// só, coberta por teste unitário (o worklet em si roda no browser).
//
// Algoritmo: detector de RMS em janela de 10ms → nível em dB → histerese
// (abre acima do limiar, fecha 6dB abaixo) → suavização por ataque
// (5ms) e liberação (80ms) para não estalar.
"use client";

/** Estado interno do portão (detectores + ganho suavizado). */
export interface GateState {
  sumSq: number;
  count: number;
  gain: number;
  open: boolean;
}

/** Parâmetros do portão (em dB / ms). */
export interface GateParams {
  enabled: boolean;
  /** nível que ABRE o portão */
  thresholdDb: number;
  /** quanto abaixo do limiar o portão FECHA (evita abrir/fechar sem parar) */
  hysteresisDb: number;
  attackMs: number;
  releaseMs: number;
  /** atenuação (dB) quando o portão está fechado */
  floorDb: number;
}

/** Estado novo (portão aberto, ganho 1). */
export function createGateState(): GateState {
  return { sumSq: 0, count: 0, gain: 1, open: true };
}

/**
 * Calcula o ganho do portão amostra a amostra e escreve em `gains`.
 * `mono` é o sinal MISTURADO (a detecção é mono — o ruído de fundo é igual
 * nos dois canais) e `gains` precisa ter o mesmo tamanho.
 */
export function gateGainCurve(
  state: GateState,
  mono: Float32Array,
  gains: Float32Array,
  params: GateParams,
  sampleRate: number
): void {
  const n = mono.length;
  if (!params.enabled) {
    for (let i = 0; i < n; i++) gains[i] = 1;
    return;
  }
  const win = Math.max(1, Math.round(sampleRate * 0.01));
  const atk = Math.exp(-1 / Math.max(1, (params.attackMs / 1000) * sampleRate));
  const rel = Math.exp(-1 / Math.max(1, (params.releaseMs / 1000) * sampleRate));
  const floor = Math.pow(10, Math.min(0, params.floorDb) / 20);
  const openAt = params.thresholdDb;
  const closeAt = params.thresholdDb - Math.max(0, params.hysteresisDb);
  for (let i = 0; i < n; i++) {
    const x = mono[i];
    state.sumSq += x * x;
    state.count++;
    if (state.count >= win) {
      const rms = Math.sqrt(state.sumSq / state.count);
      const levelDb = 20 * Math.log10(Math.max(rms, 1e-7));
      if (state.open) {
        if (levelDb < closeAt) state.open = false;
      } else if (levelDb > openAt) {
        state.open = true;
      }
      state.sumSq = 0;
      state.count = 0;
    }
    const target = state.open ? 1 : floor;
    const coeff = target > state.gain ? atk : rel;
    state.gain = target + (state.gain - target) * coeff;
    gains[i] = state.gain;
  }
}

/** Código-fonte do processador (string) — injetado via Blob URL. */
export const GATE_WORKLET_SRC = `
${createGateState.toString()}
${gateGainCurve.toString()}

class GCGateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "threshold", defaultValue: -40, minValue: -90, maxValue: 0, automationRate: "k-rate" },
      { name: "hysteresis", defaultValue: 6, minValue: 0, maxValue: 24, automationRate: "k-rate" },
      { name: "attack", defaultValue: 5, minValue: 0.1, maxValue: 200, automationRate: "k-rate" },
      { name: "release", defaultValue: 80, minValue: 5, maxValue: 2000, automationRate: "k-rate" },
      { name: "floorDb", defaultValue: -60, minValue: -90, maxValue: 0, automationRate: "k-rate" },
      { name: "enabled", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }
  constructor() {
    super();
    this.state = createGateState();
    this.mono = new Float32Array(128);
    this.gains = new Float32Array(128);
  }
  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output.length) return true;
    const frames = output[0].length;
    const inL = input && input[0];
    const inR = input && input[1];
    let mono = this.mono;
    let gains = this.gains;
    if (frames > mono.length) {
      mono = new Float32Array(frames);
      gains = new Float32Array(frames);
    } else {
      mono = mono.subarray(0, frames);
      gains = gains.subarray(0, frames);
    }
    for (let n = 0; n < frames; n++) {
      const l = inL ? inL[n] : 0;
      const r = inR ? inR[n] : l;
      mono[n] = (l + r) * 0.5;
    }
    gateGainCurve(
      this.state,
      mono,
      gains,
      {
        enabled: params.enabled[0] > 0.5,
        thresholdDb: params.threshold[0],
        hysteresisDb: params.hysteresis[0],
        attackMs: params.attack[0],
        releaseMs: params.release[0],
        floorDb: params.floorDb[0],
      },
      sampleRate
    );
    for (let ch = 0; ch < output.length; ch++) {
      const src = ch === 0 ? inL : inR;
      const out = output[ch];
      for (let n = 0; n < frames; n++) out[n] = (src ? src[n] : 0) * gains[n];
    }
    return true;
  }
}
registerProcessor("gc-gate", GCGateProcessor);
`;

let cachedUrl: string | null = null;

/** Blob URL do módulo (criado uma vez, revogado nunca — o app é SPA de vida longa). */
function moduleUrl(): string {
  if (!cachedUrl) {
    cachedUrl = URL.createObjectURL(new Blob([GATE_WORKLET_SRC], { type: "application/javascript" }));
  }
  return cachedUrl;
}

const loaded = new WeakSet<BaseAudioContext>();
const loading = new Map<BaseAudioContext, Promise<boolean>>();

/** Carrega o worklet do portão num contexto (AudioContext OU OfflineAudioContext). */
export function ensureGateModule(ctx: BaseAudioContext): Promise<boolean> {
  if (loaded.has(ctx)) return Promise.resolve(true);
  const inFlight = loading.get(ctx);
  if (inFlight) return inFlight;
  const p = ctx.audioWorklet
    .addModule(moduleUrl())
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

/** O módulo já está pronto neste contexto? */
export function gateModuleReady(ctx: BaseAudioContext): boolean {
  return loaded.has(ctx);
}

/** Cria o nó do portão (ou null se o módulo ainda não carregou neste contexto). */
export function createGateNode(ctx: BaseAudioContext): AudioWorkletNode | null {
  if (!loaded.has(ctx)) return null;
  try {
    return new AudioWorkletNode(ctx, "gc-gate", { outputChannelCount: [2] });
  } catch {
    return null;
  }
}
