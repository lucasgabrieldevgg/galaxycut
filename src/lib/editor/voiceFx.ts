// GalaxyCut — efeitos de voz (robô, rádio, megafone, eco): o MESMO construtor
// de grafo roda no preview (AudioContext) e na exportação (OfflineAudioContext)
// — paridade por construção, do mesmo jeito que o drawFrame garante pro vídeo.
// Grave/aguda (pitch-shift de verdade) exigem um worklet de time-stretch e
// ficam pro próximo lote: não se entrega DSP que não deu pra ouvir e conferir.
"use client";

export type VoiceFxId = "robot" | "radio" | "megaphone" | "echo";

export interface VoiceFxMeta {
  id: VoiceFxId;
  nameKey: string;
  descKey: string;
}

export const VOICE_FX: VoiceFxMeta[] = [
  { id: "robot", nameKey: "vfx.robot", descKey: "vfx.robotDesc" },
  { id: "radio", nameKey: "vfx.radio", descKey: "vfx.radioDesc" },
  { id: "megaphone", nameKey: "vfx.megaphone", descKey: "vfx.megaphoneDesc" },
  { id: "echo", nameKey: "vfx.echo", descKey: "vfx.echoDesc" },
];

/** efeitos que aparecem na UI como "em breve" (worklet de pitch no próximo lote) */
export const VOICE_FX_PLANNED: { nameKey: string; descKey: string }[] = [
  { nameKey: "vfx.deep", descKey: "vfx.deepDesc" },
  { nameKey: "vfx.high", descKey: "vfx.highDesc" },
];

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

export interface VoiceLane {
  input: GainNode;
  output: GainNode;
  /** troca o efeito com crossfade ~50ms (sem click); id=null volta ao som seco */
  setFx(id: VoiceFxId | null, at: number): void;
  /** para o oscilador da via robô */
  dispose(): void;
}

/**
 * Constrói o subgrafo de efeitos de voz: via seca + 4 vias de efeito, todas
 * em paralelo, só uma acesa por vez (troca por crossfade de ganho — o padrão
 * de "canal de amplificador", sem reconectar nós durante a reprodução).
 */
export function buildVoiceChain(ctx: BaseAudioContext): VoiceLane {
  const input = ctx.createGain();
  const output = ctx.createGain();

  // ---- via seca (nenhum efeito) ----
  const dry = ctx.createGain();
  dry.gain.value = 1;
  input.connect(dry);
  dry.connect(output);

  // ---- via robô: ring modulator — portadora de 50 Hz modula a amplitude ----
  const robotIn = ctx.createGain();
  robotIn.gain.value = 0;
  const ring = ctx.createGain();
  ring.gain.value = 0; // ganho 100% modulado pelo oscilador (±1)
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 50;
  const oscGain = ctx.createGain();
  oscGain.gain.value = 1;
  const robotOut = ctx.createGain();
  robotOut.gain.value = 1.6; // a modulação derruba a energia — compensa
  input.connect(robotIn);
  robotIn.connect(ring);
  ring.connect(robotOut);
  robotOut.connect(output);
  osc.connect(oscGain);
  oscGain.connect(ring.gain);
  try {
    osc.start(0);
  } catch {
    /* contexto fechado — ignora */
  }

  // ---- via rádio: banda de telefone (300–3400 Hz) + clip suave + presença ----
  const radioIn = ctx.createGain();
  radioIn.gain.value = 0;
  const rhp = ctx.createBiquadFilter();
  rhp.type = "highpass";
  rhp.frequency.value = 300;
  const rlp = ctx.createBiquadFilter();
  rlp.type = "lowpass";
  rlp.frequency.value = 3400;
  const rshaper = ctx.createWaveShaper();
  rshaper.curve = softClipCurve(3);
  const radioOut = ctx.createGain();
  radioOut.gain.value = 1.8;
  input.connect(radioIn);
  radioIn.connect(rhp);
  rhp.connect(rlp);
  rlp.connect(rshaper);
  rshaper.connect(radioOut);
  radioOut.connect(output);

  // ---- via megafone: corta os graves e distorce forte ----
  const megaIn = ctx.createGain();
  megaIn.gain.value = 0;
  const mhp = ctx.createBiquadFilter();
  mhp.type = "highpass";
  mhp.frequency.value = 500;
  const mshaper = ctx.createWaveShaper();
  mshaper.curve = softClipCurve(1.4);
  const megaOut = ctx.createGain();
  megaOut.gain.value = 1.4;
  input.connect(megaIn);
  megaIn.connect(mhp);
  mhp.connect(mshaper);
  mshaper.connect(megaOut);
  megaOut.connect(output);

  // ---- via eco: sinal seco + delay de 180 ms com feedback de 35% ----
  const echoIn = ctx.createGain();
  echoIn.gain.value = 0;
  const dl = ctx.createDelay(1);
  dl.delayTime.value = 0.18;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 1;
  input.connect(echoIn);
  echoIn.connect(echoOut); // presença: o seco continua dentro da via
  echoIn.connect(dl);
  dl.connect(fb);
  fb.connect(dl);
  dl.connect(wet);
  wet.connect(echoOut);
  echoOut.connect(output);

  const lanes: Record<VoiceFxId, GainNode> = {
    robot: robotIn,
    radio: radioIn,
    megaphone: megaIn,
    echo: echoIn,
  };

  return {
    input,
    output,
    setFx(id, at) {
      const tc = 0.02; // constante de tempo do crossfade (~50ms pra assentar)
      dry.gain.setTargetAtTime(id ? 0 : 1, at, tc);
      for (const key of Object.keys(lanes) as VoiceFxId[]) {
        lanes[key].gain.setTargetAtTime(key === id ? 1 : 0, at, tc);
      }
    },
    dispose() {
      try {
        osc.stop();
      } catch {
        /* noop */
      }
    },
  };
}
