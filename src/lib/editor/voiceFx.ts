// GalaxyCut — efeitos de voz (biblioteca DSP local): o MESMO construtor de
// grafo roda no preview (AudioContext) e na exportação (OfflineAudioContext)
// — paridade por construção, do mesmo jeito que o drawFrame garante pro vídeo.
//
// v9.4: + pitch-shift REAL via AudioWorklet granular (pitchWorklet.ts), 20
// efeitos novos (voz aguda/grave, personagens, chorus/flanger/tremolo/vibrato,
// reverb de ambiente, delay, gravação antiga…) e parâmetros por efeito:
// intensidade (mix seco/efeito) e tonalidade (± semitons, nos efeitos de pitch).
"use client";

import { createPitchNode, ensurePitchModule, pitchModuleReady } from "./pitchWorklet";

/** pré-carrega o worklet de pitch num contexto (re-export p/ conveniência) */
export const ensureVoicePitch = ensurePitchModule;

export type VoiceFxId =
  | "robot"
  | "radio"
  | "megaphone"
  | "echo"
  | "studio"
  | "underwater"
  | "alien"
  | "telephone"
  | "bass"
  // ---- v9.4: altura/timbre (pitch-shift real) ----
  | "aguda"
  | "graveProf"
  | "desenho"
  | "esquilo"
  | "monstro"
  | "crianca"
  | "fantasma"
  | "narrador"
  | "locutor"
  // ---- v9.4: modulação ----
  | "vibrato"
  | "chorus"
  | "flanger"
  | "tremolo"
  // ---- v9.4: ambiente/tempo ----
  | "reverbAmb"
  | "delayFx"
  | "sussurro"
  // ---- v9.4: caráter/mídia antiga ----
  | "telAntigo"
  | "radioInterf"
  | "gravAntiga"
  | "distorcida";

export interface VoiceFxMeta {
  id: VoiceFxId;
  nameKey: string;
  descKey: string;
  /** true = tem controle de tonalidade (semitons) */
  pitch?: boolean;
}

/** parâmetros por clipe: intensidade 0..1 (1 = efeito cheio) e
 *  tonalidade = deslocamento em semitons (−12..+12) sobre o padrão do efeito */
export interface VoiceFxParams {
  intensity?: number;
  pitch?: number;
}

export const VOICE_FX: VoiceFxMeta[] = [
  { id: "robot", nameKey: "vfx.robot", descKey: "vfx.robotDesc" },
  { id: "radio", nameKey: "vfx.radio", descKey: "vfx.radioDesc" },
  { id: "megaphone", nameKey: "vfx.megaphone", descKey: "vfx.megaphoneDesc" },
  { id: "echo", nameKey: "vfx.echo", descKey: "vfx.echoDesc" },
  { id: "studio", nameKey: "vfx.studio", descKey: "vfx.studioDesc" },
  { id: "underwater", nameKey: "vfx.underwater", descKey: "vfx.underwaterDesc" },
  { id: "alien", nameKey: "vfx.alien", descKey: "vfx.alienDesc" },
  { id: "telephone", nameKey: "vfx.telephone", descKey: "vfx.telephoneDesc" },
  { id: "bass", nameKey: "vfx.bass", descKey: "vfx.bassDesc" },
  { id: "aguda", nameKey: "vfx.aguda", descKey: "vfx.agudaDesc", pitch: true },
  { id: "graveProf", nameKey: "vfx.graveProf", descKey: "vfx.graveProfDesc", pitch: true },
  { id: "desenho", nameKey: "vfx.desenho", descKey: "vfx.desenhoDesc", pitch: true },
  { id: "esquilo", nameKey: "vfx.esquilo", descKey: "vfx.esquiloDesc", pitch: true },
  { id: "monstro", nameKey: "vfx.monstro", descKey: "vfx.monstroDesc", pitch: true },
  { id: "crianca", nameKey: "vfx.crianca", descKey: "vfx.criancaDesc", pitch: true },
  { id: "fantasma", nameKey: "vfx.fantasma", descKey: "vfx.fantasmaDesc", pitch: true },
  { id: "narrador", nameKey: "vfx.narrador", descKey: "vfx.narradorDesc", pitch: true },
  { id: "locutor", nameKey: "vfx.locutor", descKey: "vfx.locutorDesc", pitch: true },
  { id: "vibrato", nameKey: "vfx.vibrato", descKey: "vfx.vibratoDesc" },
  { id: "chorus", nameKey: "vfx.chorus", descKey: "vfx.chorusDesc" },
  { id: "flanger", nameKey: "vfx.flanger", descKey: "vfx.flangerDesc" },
  { id: "tremolo", nameKey: "vfx.tremolo", descKey: "vfx.tremoloDesc" },
  { id: "reverbAmb", nameKey: "vfx.reverbAmb", descKey: "vfx.reverbAmbDesc" },
  { id: "delayFx", nameKey: "vfx.delayFx", descKey: "vfx.delayFxDesc" },
  { id: "sussurro", nameKey: "vfx.sussurro", descKey: "vfx.sussurroDesc" },
  { id: "telAntigo", nameKey: "vfx.telAntigo", descKey: "vfx.telAntigoDesc" },
  { id: "radioInterf", nameKey: "vfx.radioInterf", descKey: "vfx.radioInterfDesc" },
  { id: "gravAntiga", nameKey: "vfx.gravAntiga", descKey: "vfx.gravAntigaDesc" },
  { id: "distorcida", nameKey: "vfx.distorcida", descKey: "vfx.distorcidaDesc" },
];

/** ids que possuem estágio de pitch (controle de tonalidade) */
export const PITCH_FX = new Set<VoiceFxId>(VOICE_FX.filter((f) => f.pitch).map((f) => f.id));

/** curva tanh de soft-clip: k controla a agressividade (menor = clipa mais cedo) */
export function softClipCurve(k: number): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k) / norm;
  }
  return curve;
}

/** impulso sintético de reverb (sala/estúdio): ruído com decaimento exponencial */
function reverbImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/** ruído branco em loop (chiado de linha / fundo de rádio) */
function noiseBuffer(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** estalos de vinil/electricidade: impulsos esparsos com cauda curtíssima */
function crackleBuffer(ctx: BaseAudioContext, seconds = 3, perSecond = 14): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(1, len, rate);
  const d = buf.getChannelData(0);
  const n = Math.floor(perSecond * seconds);
  for (let k = 0; k < n; k++) {
    const at = Math.floor(Math.random() * (len - 64));
    const amp = (Math.random() * 0.8 + 0.2) * (Math.random() < 0.15 ? 1 : 0.45);
    const decayLen = 24 + Math.floor(Math.random() * 40);
    for (let i = 0; i < decayLen && at + i < len; i++) {
      d[at + i] += amp * (1 - i / decayLen) * (Math.random() * 0.6 + 0.7);
    }
  }
  return buf;
}

export interface VoiceLane {
  input: GainNode;
  output: GainNode;
  /** troca o efeito com crossfade ~50ms (sem click); id=null volta ao som seco.
   *  params: intensidade (0..1) e tonalidade (semitons de deslocamento) */
  setFx(id: VoiceFxId | null, at: number, params?: VoiceFxParams): void;
  /** insere os worklets de pitch depois que o módulo carrega (re-conexão segura) */
  enablePitch(): void;
  /** para osciladores/fontes de ruído das vias */
  dispose(): void;
}

interface PitchStage {
  inG: GainNode;
  outG: GainNode;
  base: number; // semitons padrão do efeito
  node: AudioWorkletNode | null;
  bypassed: boolean;
}

interface Lane {
  gate: GainNode; // liga/desliga a via (crossfade global)
  dry: GainNode; // seco DENTRO da via (controle de intensidade)
  wet: GainNode; // saída do processamento
  aux: GainNode; // v9.4.1: camadas de ambiente (chiado/estalos/estática) da via —
  // antes elas tocavam direto no output da cadeia INTEIRA, ou seja: um
  // chiado permanente mesmo sem efeito nenhum ligado. Agora seguem o gate
  // e a intensidade da via (só tocam com o efeito ativo)
  pitch?: PitchStage; // estágio de pitch (se a via tiver)
}

/**
 * Constrói o subgrafo de efeitos de voz: via seca + vias de efeito em
 * paralelo, só uma acesa por vez (troca por crossfade de ganho — o padrão de
 * "canal de amplificador", sem reconectar nós durante a reprodução).
 *
 * opts.only: constrói APENAS a via indicada (uso na exportação, onde cada
 * clipe tem seu próprio grafo offline — não precisa das 30 vias).
 */
export function buildVoiceChain(ctx: BaseAudioContext, opts?: { only?: VoiceFxId }): VoiceLane {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const oscillators: OscillatorNode[] = [];
  const noiseSources: AudioBufferSourceNode[] = [];
  const lanes = new Map<VoiceFxId, Lane>();
  const pitchStages: PitchStage[] = [];

  /** via básica: gate → { dry, cadeia → wet, ambiente → aux } → output */
  const makeLane = (): Lane => {
    const gate = ctx.createGain();
    gate.gain.value = 0;
    const dry = ctx.createGain();
    dry.gain.value = 0; // intensidade padrão = 100% efeito
    const wet = ctx.createGain();
    wet.gain.value = 1;
    const aux = ctx.createGain();
    aux.gain.value = 0;
    input.connect(gate);
    gate.connect(dry);
    dry.connect(output);
    gate.connect(wet);
    aux.connect(output);
    return { gate, dry, wet, aux };
  };

  /** estágio de pitch com fallback: se o worklet ainda não carregou nesta
   *  contexto, liga direto (bypass) e o enablePitch() religa depois */
  const makePitch = (base: number): { inG: GainNode; outG: GainNode; stage: PitchStage } => {
    const inG = ctx.createGain();
    const outG = ctx.createGain();
    const node = createPitchNode(ctx); // null se o módulo não carregou ainda
    const stage: PitchStage = { inG, outG, base, node, bypassed: !node };
    if (node) {
      node.parameters.get("semitones")!.value = base;
      node.parameters.get("mix")!.value = 1;
      inG.connect(node);
      node.connect(outG);
    } else {
      inG.connect(outG); // bypass temporário (honesto: o resto do efeito toca)
    }
    pitchStages.push(stage);
    return { inG, outG, stage };
  };

  const connect = (a: AudioNode, b: AudioNode) => a.connect(b);

  // filtro utilitário
  const filt = (type: BiquadFilterType, freq: number, q?: number, gainDb?: number) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    if (gainDb !== undefined) f.gain.value = gainDb;
    return f;
  };
  const gainNode = (v: number) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return g;
  };
  const shaper = (k: number) => {
    const s = ctx.createWaveShaper();
    s.curve = softClipCurve(k);
    return s;
  };
  const comp = (thr: number, ratio: number, atk = 0.006, rel = 0.25) => {
    const c = ctx.createDynamicsCompressor();
    c.threshold.value = thr;
    c.ratio.value = ratio;
    c.attack.value = atk;
    c.release.value = rel;
    c.knee.value = 12;
    return c;
  };
  const osc = (type: OscillatorType, freq: number, target?: AudioParam, amount?: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (target && amount !== undefined) {
      const g = gainNode(amount);
      o.connect(g);
      g.connect(target);
    }
    oscillators.push(o);
    return o;
  };
  const noise = (buf: "white" | "crackle", filterChain?: (g: GainNode) => void) => {
    const src = ctx.createBufferSource();
    src.buffer = buf === "white" ? noiseBuffer(ctx) : crackleBuffer(ctx);
    src.loop = true;
    const out = gainNode(0);
    if (filterChain) filterChain(out);
    else out.connect(output);
    src.connect(out);
    void src;
    noiseSources.push(src);
    return { src, out };
  };

  const buildFx = (id: VoiceFxId) => {
    switch (id) {
      // ==================== vias originais (v9.1) ====================
      case "robot": {
        const l = makeLane();
        const ring = gainNode(0);
        const out = gainNode(1.6);
        osc("sine", 50, ring.gain, 1);
        connect(l.wet, ring);
        connect(ring, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }
      case "radio": {
        const l = makeLane();
        const hp = filt("highpass", 300);
        const lp = filt("lowpass", 3400);
        const sh = shaper(3);
        const out = gainNode(1.8);
        connect(l.wet, hp);
        connect(hp, lp);
        connect(lp, sh);
        connect(sh, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }
      case "megaphone": {
        const l = makeLane();
        const hp = filt("highpass", 500);
        const sh = shaper(1.4);
        const out = gainNode(1.4);
        connect(l.wet, hp);
        connect(hp, sh);
        connect(sh, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }
      case "echo": {
        const l = makeLane();
        const dl = ctx.createDelay(1);
        dl.delayTime.value = 0.18;
        const fb = gainNode(0.35);
        const wet = gainNode(0.55);
        connect(l.wet, dl);
        connect(dl, fb);
        connect(fb, dl);
        connect(dl, wet);
        connect(wet, output);
        lanes.set(id, l);
        return;
      }
      case "studio": {
        const l = makeLane();
        const conv = ctx.createConvolver();
        try {
          conv.buffer = reverbImpulse(ctx, 1.4, 3.2);
        } catch {
          /* contexto sem buffer — a via fica seca, sem quebrar */
        }
        const wet = gainNode(0.45);
        const tone = filt("highshelf", 3800, undefined, 2);
        const out = gainNode(1.25);
        connect(l.wet, conv);
        connect(conv, wet);
        connect(wet, tone);
        connect(tone, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }
      case "underwater": {
        const l = makeLane();
        const lp = filt("lowpass", 420, 6);
        osc("sine", 0.45, lp.frequency, 220);
        const out = gainNode(1.7);
        connect(l.wet, lp);
        connect(lp, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }
      case "alien": {
        const l = makeLane();
        const ring = gainNode(0);
        osc("triangle", 640, ring.gain, 1);
        const bp = filt("bandpass", 1400, 1.6);
        const out = gainNode(2.2);
        connect(l.wet, ring);
        connect(ring, bp);
        connect(bp, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }
      case "telephone": {
        const l = makeLane();
        const hp = filt("highpass", 480);
        const lp = filt("lowpass", 2800);
        const sh = shaper(1.8);
        const out = gainNode(2.0);
        connect(l.wet, hp);
        connect(hp, lp);
        connect(lp, sh);
        connect(sh, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }
      case "bass": {
        const l = makeLane();
        const hp = filt("highpass", 60);
        const shelf = filt("lowshelf", 220, undefined, 9);
        const sh = shaper(6);
        const out = gainNode(1.15);
        connect(l.wet, hp);
        connect(hp, shelf);
        connect(shelf, sh);
        connect(sh, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }

      // ==================== v9.4: altura/timbre (pitch real) ====================
      case "aguda": {
        const l = makeLane();
        const p = makePitch(4);
        const shelf = filt("highshelf", 4000, undefined, 2);
        const out = gainNode(1.15);
        connect(l.wet, p.inG);
        connect(p.outG, shelf);
        connect(shelf, out);
        connect(out, output);
        l.pitch = p.stage;
        lanes.set(id, l);
        return;
      }
      case "graveProf": {
        const l = makeLane();
        const p = makePitch(-5);
        const shelf = filt("lowshelf", 180, undefined, 4);
        const out = gainNode(1.2);
        connect(l.wet, p.inG);
        connect(p.outG, shelf);
        connect(shelf, out);
        connect(out, output);
        l.pitch = p.stage;
        lanes.set(id, l);
        return;
      }
      case "desenho": {
        const l = makeLane();
        const p = makePitch(3.5);
        const bp = filt("bandpass", 900, 0.5);
        const nasal = filt("peaking", 1700, 1.2, 2.5);
        const sh = shaper(2.5);
        const out = gainNode(1.3);
        connect(l.wet, p.inG);
        connect(p.outG, bp);
        connect(bp, nasal);
        connect(nasal, sh);
        connect(sh, out);
        connect(out, output);
        l.pitch = p.stage;
        lanes.set(id, l);
        return;
      }
      case "esquilo": {
        const l = makeLane();
        const p = makePitch(9);
        const hp = filt("highpass", 250);
        const out = gainNode(1.0);
        connect(l.wet, p.inG);
        connect(p.outG, hp);
        connect(hp, out);
        connect(out, output);
        l.pitch = p.stage;
        lanes.set(id, l);
        return;
      }
      case "monstro": {
        const l = makeLane();
        const p = makePitch(-7);
        const sh = shaper(1.6);
        const lp = filt("lowpass", 3500);
        const conv = ctx.createConvolver();
        try {
          conv.buffer = reverbImpulse(ctx, 0.9, 4);
        } catch {
          /* sem reverb — via segue */
        }
        const wet = gainNode(0.25);
        const out = gainNode(1.3);
        connect(l.wet, p.inG);
        connect(p.outG, sh);
        connect(sh, lp);
        connect(lp, out);
        connect(lp, conv);
        connect(conv, wet);
        connect(wet, out);
        connect(out, output);
        l.pitch = p.stage;
        lanes.set(id, l);
        return;
      }
      case "crianca": {
        const l = makeLane();
        const p = makePitch(6.5);
        const pk = filt("peaking", 2500, 1, 3);
        const out = gainNode(1.1);
        connect(l.wet, p.inG);
        connect(p.outG, pk);
        connect(pk, out);
        connect(out, output);
        l.pitch = p.stage;
        lanes.set(id, l);
        return;
      }
      case "fantasma": {
        const l = makeLane();
        const p = makePitch(-2);
        // vibrato espectral: delay curto modulado devagar
        const dl = ctx.createDelay(0.05);
        dl.delayTime.value = 0.012;
        osc("sine", 4.5, dl.delayTime, 0.0015);
        const conv = ctx.createConvolver();
        try {
          conv.buffer = reverbImpulse(ctx, 2.6, 2.4);
        } catch {
          /* sem reverb — via segue */
        }
        const wet = gainNode(0.6);
        const out = gainNode(1.2);
        connect(l.wet, p.inG);
        connect(p.outG, dl);
        connect(dl, out);
        connect(dl, conv);
        connect(conv, wet);
        connect(wet, out);
        connect(out, output);
        l.pitch = p.stage;
        lanes.set(id, l);
        return;
      }
      case "narrador": {
        const l = makeLane();
        const p = makePitch(-1);
        const c = comp(-20, 4);
        const pk = filt("peaking", 3000, 1, 2.5);
        const out = gainNode(1.2);
        connect(l.wet, p.inG);
        connect(p.outG, c);
        connect(c, pk);
        connect(pk, out);
        connect(out, output);
        l.pitch = p.stage;
        lanes.set(id, l);
        return;
      }
      case "locutor": {
        const l = makeLane();
        const p = makePitch(-2.5);
        const hp = filt("highpass", 70);
        const shelf = filt("lowshelf", 150, undefined, 5);
        const c = comp(-26, 5, 0.004, 0.3);
        const out = gainNode(1.25);
        connect(l.wet, p.inG);
        connect(p.outG, hp);
        connect(hp, shelf);
        connect(shelf, c);
        connect(c, out);
        connect(out, output);
        l.pitch = p.stage;
        lanes.set(id, l);
        return;
      }

      // ==================== v9.4: modulação ====================
      case "vibrato": {
        const l = makeLane();
        const dl = ctx.createDelay(0.05);
        dl.delayTime.value = 0.01;
        osc("sine", 5.5, dl.delayTime, 0.0016);
        const out = gainNode(1.1);
        connect(l.wet, dl);
        connect(dl, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }
      case "chorus": {
        const l = makeLane();
        const d1 = ctx.createDelay(0.08);
        d1.delayTime.value = 0.018;
        osc("sine", 0.6, d1.delayTime, 0.0022);
        const w1 = gainNode(0.35);
        const d2 = ctx.createDelay(0.08);
        d2.delayTime.value = 0.026;
        osc("sine", 0.93, d2.delayTime, 0.0028);
        const w2 = gainNode(0.35);
        const out = gainNode(1.15);
        connect(l.wet, d1);
        connect(l.wet, d2);
        connect(d1, w1);
        connect(d2, w2);
        connect(w1, out);
        connect(w2, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }
      case "flanger": {
        const l = makeLane();
        const dl = ctx.createDelay(0.03);
        dl.delayTime.value = 0.003;
        osc("sine", 0.35, dl.delayTime, 0.0022);
        const fb = gainNode(0.55);
        const wet = gainNode(0.55);
        const out = gainNode(1.1);
        connect(l.wet, dl);
        connect(dl, fb);
        connect(fb, dl);
        connect(dl, wet);
        connect(wet, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }
      case "tremolo": {
        const l = makeLane();
        const am = gainNode(1.0);
        osc("sine", 6.5, am.gain, 0.42);
        const out = gainNode(1.3);
        connect(l.wet, am);
        connect(am, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }

      // ==================== v9.4: ambiente / tempo ====================
      case "reverbAmb": {
        const l = makeLane();
        const pre = ctx.createDelay(0.1);
        pre.delayTime.value = 0.022;
        const conv = ctx.createConvolver();
        try {
          conv.buffer = reverbImpulse(ctx, 2.6, 2.0);
        } catch {
          /* sem reverb — via segue */
        }
        const wet = gainNode(0.5);
        const out = gainNode(1.15);
        connect(l.wet, pre);
        connect(pre, conv);
        connect(conv, wet);
        connect(wet, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }
      case "delayFx": {
        const l = makeLane();
        const main = ctx.createDelay(1.5);
        main.delayTime.value = 0.38;
        const fb = gainNode(0.32);
        const wMain = gainNode(0.4);
        const slap = ctx.createDelay(1);
        slap.delayTime.value = 0.19;
        const wSlap = gainNode(0.15);
        connect(l.wet, main);
        connect(main, fb);
        connect(fb, main);
        connect(main, wMain);
        connect(l.wet, slap);
        connect(slap, wSlap);
        connect(wMain, output);
        connect(wSlap, output);
        lanes.set(id, l);
        return;
      }
      case "sussurro": {
        const l = makeLane();
        const hp = filt("highpass", 350);
        const lp = filt("lowpass", 5200);
        const sh = shaper(4);
        const out = gainNode(1.6);
        // camada de "respiração": ruído suave na banda da voz (via aux)
        const nBp = filt("bandpass", 1800, 0.7);
        connect(l.wet, hp);
        connect(hp, lp);
        connect(lp, sh);
        connect(sh, out);
        connect(out, output);
        noise("white", (g) => {
          g.gain.value = 0.045;
          g.connect(nBp);
          connect(nBp, l.aux);
        });
        lanes.set(id, l);
        return;
      }

      // ==================== v9.4: caráter / mídia antiga ====================
      case "telAntigo": {
        const l = makeLane();
        const hp = filt("highpass", 350);
        const lp = filt("lowpass", 2100);
        const sh = shaper(1.2);
        const out = gainNode(1.5);
        connect(l.wet, hp);
        connect(hp, lp);
        connect(lp, sh);
        connect(sh, out);
        connect(out, output);
        // chiado de linha + estalos (pela via aux — só com o efeito ligado)
        const nBp = filt("bandpass", 1400, 0.8);
        const nHp = filt("highpass", 800);
        noise("white", (g) => {
          g.gain.value = 0.035;
          g.connect(nBp);
          connect(nBp, l.aux);
        });
        noise("crackle", (g) => {
          g.gain.value = 0.05;
          g.connect(nHp);
          connect(nHp, l.aux);
        });
        lanes.set(id, l);
        return;
      }
      case "radioInterf": {
        const l = makeLane();
        // wow: instabilidade da sintonia
        const dl = ctx.createDelay(0.05);
        dl.delayTime.value = 0.006;
        osc("sine", 0.9, dl.delayTime, 0.0012);
        const bp = filt("bandpass", 1150, 0.8);
        const sh = shaper(2);
        const out = gainNode(1.5);
        connect(l.wet, dl);
        connect(dl, bp);
        connect(bp, sh);
        connect(sh, out);
        connect(out, output);
        // estática pulsando (a interferência entra e sai) — via aux
        const nBp = filt("bandpass", 1150, 1.2);
        const nGate = gainNode(0.03);
        osc("square", 2.2, nGate.gain, 0.028);
        noise("white", (g) => {
          g.gain.value = 1;
          g.connect(nBp);
          connect(nBp, nGate);
          connect(nGate, l.aux);
        });
        lanes.set(id, l);
        return;
      }
      case "gravAntiga": {
        const l = makeLane();
        const hp = filt("highpass", 180);
        const lp = filt("lowpass", 3200);
        const sh = shaper(2.2);
        // wow & flutter da rotação desigual
        const dl = ctx.createDelay(0.05);
        dl.delayTime.value = 0.008;
        osc("sine", 0.7, dl.delayTime, 0.0009);
        const out = gainNode(1.4);
        connect(l.wet, hp);
        connect(hp, lp);
        connect(lp, sh);
        connect(sh, dl);
        connect(dl, out);
        connect(out, output);
        // chiado de fita + estalos de vinil — via aux
        const nHp = filt("highpass", 5500);
        const cHp = filt("highpass", 700);
        noise("white", (g) => {
          g.gain.value = 0.02;
          g.connect(nHp);
          connect(nHp, l.aux);
        });
        noise("crackle", (g) => {
          g.gain.value = 0.06;
          g.connect(cHp);
          connect(cHp, l.aux);
        });
        lanes.set(id, l);
        return;
      }
      case "distorcida": {
        const l = makeLane();
        const sh = shaper(0.7);
        const c = comp(-30, 8, 0.002, 0.12);
        const out = gainNode(0.9);
        connect(l.wet, sh);
        connect(sh, c);
        connect(c, out);
        connect(out, output);
        lanes.set(id, l);
        return;
      }
    }
  };

  // ---- via seca (nenhum efeito) ----
  const dry = ctx.createGain();
  dry.gain.value = 1;
  input.connect(dry);
  dry.connect(output);

  const toBuild = opts?.only ? [opts.only] : (VOICE_FX.map((f) => f.id) as VoiceFxId[]);
  for (const id of toBuild) buildFx(id);

  for (const o of oscillators) {
    try {
      o.start(0);
    } catch {
      /* contexto fechado — ignora */
    }
  }
  for (const s of noiseSources) {
    try {
      s.start(0);
    } catch {
      /* ignora */
    }
  }

  const setLaneIntensity = (lane: Lane, mix: number, at: number) => {
    const m = Math.max(0, Math.min(1, mix));
    lane.dry.gain.setTargetAtTime(1 - m, at, 0.02);
    lane.wet.gain.setTargetAtTime(m, at, 0.02);
  };
  return {
    input,
    output,
    setFx(id, at, params) {
      const tc = 0.02; // constante de tempo do crossfade (~50ms pra assentar)
      const mix = id ? Math.max(0, Math.min(1, params?.intensity ?? 1)) : 0;
      dry.gain.setTargetAtTime(id ? 0 : 1, at, tc);
      for (const key of lanes.keys()) {
        const lane = lanes.get(key)!;
        lane.gate.gain.setTargetAtTime(key === id ? 1 : 0, at, tc);
        // v9.4.1: camadas de ambiente (chiado/estática) acompanham o gate e a
        // intensidade — silêncio absoluto quando o efeito não está ativo
        lane.aux.gain.setTargetAtTime(key === id ? mix : 0, at, tc);
      }
      if (id) {
        const lane = lanes.get(id);
        if (lane) {
          setLaneIntensity(lane, params?.intensity ?? 1, at);
          if (lane.pitch) {
            const st = lane.pitch.node?.parameters.get("semitones");
            const semis = Math.max(-24, Math.min(24, lane.pitch.base + (params?.pitch ?? 0)));
            if (st) {
              try {
                st.cancelScheduledValues(at);
                st.setTargetAtTime(semis, at, 0.03);
              } catch {
                st.value = semis;
              }
            }
          }
        }
      }
    },
    enablePitch() {
      for (const stage of pitchStages) {
        if (stage.node || !pitchModuleReady(ctx)) continue;
        const node = createPitchNode(ctx);
        if (!node) continue;
        node.parameters.get("semitones")!.value = stage.base;
        node.parameters.get("mix")!.value = 1;
        try {
          stage.inG.disconnect();
        } catch {
          /* noop */
        }
        stage.inG.connect(node);
        node.connect(stage.outG);
        stage.node = node;
        stage.bypassed = false;
      }
    },
    dispose() {
      for (const o of oscillators) {
        try {
          o.stop();
        } catch {
          /* noop */
        }
      }
      for (const s of noiseSources) {
        try {
          s.stop();
        } catch {
          /* noop */
        }
      }
    },
  };
}
