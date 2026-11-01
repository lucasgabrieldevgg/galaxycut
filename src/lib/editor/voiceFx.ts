// GalaxyCut — efeitos de voz (robô, rádio, megafone, eco, estúdio, subaquático,
// alienígena, telefone, grave): o MESMO construtor de grafo roda no preview
// (AudioContext) e na exportação (OfflineAudioContext) — paridade por
// construção, do mesmo jeito que o drawFrame garante pro vídeo.
// Grave/aguda REAL (pitch-shift de verdade) exige worklet de time-stretch e
// segue planejado: não se entrega DSP que não deu pra ouvir e conferir.
"use client";

export type VoiceFxId =
  | "robot"
  | "radio"
  | "megaphone"
  | "echo"
  | "studio"
  | "underwater"
  | "alien"
  | "telephone"
  | "bass";

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
  { id: "studio", nameKey: "vfx.studio", descKey: "vfx.studioDesc" },
  { id: "underwater", nameKey: "vfx.underwater", descKey: "vfx.underwaterDesc" },
  { id: "alien", nameKey: "vfx.alien", descKey: "vfx.alienDesc" },
  { id: "telephone", nameKey: "vfx.telephone", descKey: "vfx.telephoneDesc" },
  { id: "bass", nameKey: "vfx.bass", descKey: "vfx.bassDesc" },
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

/** impulso sintético de reverb (sala/estúdio): ruído com decaimento exponencial */
function reverbImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(rate * seconds));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      // ruído * envelope exponencial (o "rabo" da cauda)
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export interface VoiceLane {
  input: GainNode;
  output: GainNode;
  /** troca o efeito com crossfade ~50ms (sem click); id=null volta ao som seco */
  setFx(id: VoiceFxId | null, at: number): void;
  /** para osciladores das vias (robô, subaquático, alienígena) */
  dispose(): void;
}

/**
 * Constrói o subgrafo de efeitos de voz: via seca + vias de efeito, todas
 * em paralelo, só uma acesa por vez (troca por crossfade de ganho — o padrão
 * de "canal de amplificador", sem reconectar nós durante a reprodução).
 */
export function buildVoiceChain(ctx: BaseAudioContext): VoiceLane {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const oscillators: OscillatorNode[] = [];

  const makeLane = () => {
    const g = ctx.createGain();
    g.gain.value = 0;
    input.connect(g);
    return g;
  };

  // ---- via seca (nenhum efeito) ----
  const dry = ctx.createGain();
  dry.gain.value = 1;
  input.connect(dry);
  dry.connect(output);

  // ---- robô: ring modulator — portadora de 50 Hz modula a amplitude ----
  const robotIn = makeLane();
  const ring = ctx.createGain();
  ring.gain.value = 0; // ganho 100% modulado pelo oscilador (±1)
  const robotOsc = ctx.createOscillator();
  robotOsc.type = "sine";
  robotOsc.frequency.value = 50;
  const robotOscGain = ctx.createGain();
  robotOscGain.gain.value = 1;
  const robotOut = ctx.createGain();
  robotOut.gain.value = 1.6; // a modulação derruba a energia — compensa
  robotIn.connect(ring);
  ring.connect(robotOut);
  robotOut.connect(output);
  robotOsc.connect(robotOscGain);
  robotOscGain.connect(ring.gain);
  oscillators.push(robotOsc);

  // ---- rádio: banda de telefone (300–3400 Hz) + clip suave + presença ----
  const radioIn = makeLane();
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
  radioIn.connect(rhp);
  rhp.connect(rlp);
  rlp.connect(rshaper);
  rshaper.connect(radioOut);
  radioOut.connect(output);

  // ---- megafone: corta os graves e distorce forte ----
  const megaIn = makeLane();
  const mhp = ctx.createBiquadFilter();
  mhp.type = "highpass";
  mhp.frequency.value = 500;
  const mshaper = ctx.createWaveShaper();
  mshaper.curve = softClipCurve(1.4);
  const megaOut = ctx.createGain();
  megaOut.gain.value = 1.4;
  megaIn.connect(mhp);
  mhp.connect(mshaper);
  mshaper.connect(megaOut);
  megaOut.connect(output);

  // ---- eco: sinal seco + delay de 180 ms com feedback de 35% ----
  const echoIn = makeLane();
  const dl = ctx.createDelay(1);
  dl.delayTime.value = 0.18;
  const fb = ctx.createGain();
  fb.gain.value = 0.35;
  const wet = ctx.createGain();
  wet.gain.value = 0.55;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 1;
  echoIn.connect(echoOut); // presença: o seco continua dentro da via
  echoIn.connect(dl);
  dl.connect(fb);
  fb.connect(dl);
  dl.connect(wet);
  wet.connect(echoOut);
  echoOut.connect(output);

  // ---- estúdio: reverb de sala (convolução com impulso sintético) ----
  const studioIn = makeLane();
  const conv = ctx.createConvolver();
  try {
    conv.buffer = reverbImpulse(ctx, 1.4, 3.2);
  } catch {
    /* contexto sem buffer — a via fica seca, sem quebrar */
  }
  const studioWet = ctx.createGain();
  studioWet.gain.value = 0.45;
  const studioTone = ctx.createBiquadFilter();
  studioTone.type = "highshelf";
  studioTone.frequency.value = 3800;
  studioTone.gain.value = 2; // "ar" de estúdio
  const studioOut = ctx.createGain();
  studioOut.gain.value = 1.25;
  studioIn.connect(studioOut); // seco presente
  studioIn.connect(conv);
  conv.connect(studioWet);
  studioWet.connect(studioTone);
  studioTone.connect(studioOut);
  studioOut.connect(output);

  // ---- subaquático: passa-baixa grave + LFO balançando o corte (bolhas) ----
  const uwIn = makeLane();
  const uwLp = ctx.createBiquadFilter();
  uwLp.type = "lowpass";
  uwLp.frequency.value = 420;
  uwLp.Q.value = 6;
  const uwLfo = ctx.createOscillator();
  uwLfo.type = "sine";
  uwLfo.frequency.value = 0.45;
  const uwLfoGain = ctx.createGain();
  uwLfoGain.gain.value = 220; // corte balança 200–640 Hz
  uwLfo.connect(uwLfoGain);
  uwLfoGain.connect(uwLp.frequency);
  oscillators.push(uwLfo);
  const uwOut = ctx.createGain();
  uwOut.gain.value = 1.7;
  uwIn.connect(uwLp);
  uwLp.connect(uwOut);
  uwOut.connect(output);

  // ---- alienígena: ring modulator metálico (portadora 640 Hz) + ressonância ----
  const alienIn = makeLane();
  const alienRing = ctx.createGain();
  alienRing.gain.value = 0;
  const alienOsc = ctx.createOscillator();
  alienOsc.type = "triangle";
  alienOsc.frequency.value = 640;
  const alienOscGain = ctx.createGain();
  alienOscGain.gain.value = 1;
  const alienBp = ctx.createBiquadFilter();
  alienBp.type = "bandpass";
  alienBp.frequency.value = 1400;
  alienBp.Q.value = 1.6;
  const alienOut = ctx.createGain();
  alienOut.gain.value = 2.2;
  alienIn.connect(alienRing);
  alienRing.connect(alienBp);
  alienBp.connect(alienOut);
  alienOut.connect(output);
  alienOsc.connect(alienOscGain);
  alienOscGain.connect(alienRing.gain);
  oscillators.push(alienOsc);

  // ---- telefone: banda estreita (480–2800 Hz) + clip agressivo ----
  const telIn = makeLane();
  const thp = ctx.createBiquadFilter();
  thp.type = "highpass";
  thp.frequency.value = 480;
  const tlp = ctx.createBiquadFilter();
  tlp.type = "lowpass";
  tlp.frequency.value = 2800;
  const tshaper = ctx.createWaveShaper();
  tshaper.curve = softClipCurve(1.8);
  const telOut = ctx.createGain();
  telOut.gain.value = 2.0;
  telIn.connect(thp);
  thp.connect(tlp);
  tlp.connect(tshaper);
  tshaper.connect(telOut);
  telOut.connect(output);

  // ---- grave encorpado: realce de graves + compressão suave (voz "cinema") ----
  const bassIn = makeLane();
  const bassShelf = ctx.createBiquadFilter();
  bassShelf.type = "lowshelf";
  bassShelf.frequency.value = 220;
  bassShelf.gain.value = 9; // +9 dB nos graves
  const bassHp = ctx.createBiquadFilter();
  bassHp.type = "highpass";
  bassHp.frequency.value = 60; // tira o rumor abaixo da voz
  const bassShaper = ctx.createWaveShaper();
  bassShaper.curve = softClipCurve(6); // cola a densidade sem estourar
  const bassOut = ctx.createGain();
  bassOut.gain.value = 1.15;
  bassIn.connect(bassHp);
  bassHp.connect(bassShelf);
  bassShelf.connect(bassShaper);
  bassShaper.connect(bassOut);
  bassOut.connect(output);

  const lanes: Record<VoiceFxId, GainNode> = {
    robot: robotIn,
    radio: radioIn,
    megaphone: megaIn,
    echo: echoIn,
    studio: studioIn,
    underwater: uwIn,
    alien: alienIn,
    telephone: telIn,
    bass: bassIn,
  };

  for (const osc of oscillators) {
    try {
      osc.start(0);
    } catch {
      /* contexto fechado — ignora */
    }
  }

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
      for (const osc of oscillators) {
        try {
          osc.stop();
        } catch {
          /* noop */
        }
      }
    },
  };
}
