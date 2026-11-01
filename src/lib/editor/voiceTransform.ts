// GalaxyCut — TRANSFORMAÇÃO DE VOZ (motores de conversão local).
// Diferente dos efeitos de voz (aplicados na reprodução da faixa), a
// transformação PROCESSA o áudio e devolve uma NOVA faixa: a original fica
// intacta na timeline, e a convertida pode ser comparada, editada, mutada ou
// apagada como qualquer clipe.
//
// Como funciona: pitch granular (worklet) muda a altura SEM mudar o tempo —
// ritmo, pausas e interpretação são preservados — e uma bancada de formantes
// (EQ) reposiciona o "corpo" da voz. Tudo offline (OfflineAudioContext),
// 100% local, sem API externa.
"use client";

import { ensurePitchModule, createPitchNode } from "./pitchWorklet";

export type VoiceTransformId = "vt-m2f" | "vt-f2m" | "vt-jovem" | "vt-idosa";

export interface VoiceTransformModel {
  id: VoiceTransformId;
  name: string;
  /** semitons base do pitch granular (negativo = mais grave) */
  semitones: number;
  /** caráter do formante */
  character: "feminino" | "masculino" | "jovem" | "idade";
  desc: string;
}

export const VOICE_TRANSFORM_MODELS: VoiceTransformModel[] = [
  {
    id: "vt-m2f",
    name: "Masculino → Feminino",
    semitones: 4,
    character: "feminino",
    desc: "Sobe a altura ~4 semitons e realça os formantes agudos (brilho e presença típicos de voz feminina), mantendo o ritmo da fala original.",
  },
  {
    id: "vt-f2m",
    name: "Feminino → Masculino",
    semitones: -4,
    character: "masculino",
    desc: "Desce a altura ~4 semitons e engrossa os formantes graves (peito/densidade de voz masculina), sem alterar a velocidade da fala.",
  },
  {
    id: "vt-jovem",
    name: "Voz Jovem",
    semitones: 5.5,
    character: "jovem",
    desc: "Altura mais aguda com formante nasal/jovem — interpretação adulta convertida em timbre de voz jovem.",
  },
  {
    id: "vt-idosa",
    name: "Voz Idosa",
    semitones: -1.5,
    character: "idade",
    desc: "Leve queda de altura + tremor lento de idade e textura envelhecida — mantendo a dicção original.",
  },
];

export function getTransformModel(id: VoiceTransformId): VoiceTransformModel | undefined {
  return VOICE_TRANSFORM_MODELS.find((m) => m.id === id);
}

/**
 * Converte um AudioBuffer com um dos modelos. Resolve com o NOVO buffer
 * (mesma duração, mesma taxa de amostragem). intensity: 0..1 (1 = conversão
 * cheia; abaixo de 1 mistura com o áudio original no resultado).
 */
export async function transformVoiceBuffer(
  buf: AudioBuffer,
  model: VoiceTransformModel,
  intensity = 1,
  onStage?: (stage: "prepare" | "render" | "done", p: number) => void,
): Promise<AudioBuffer> {
  onStage?.("prepare", 0.05);
  const OAC: typeof OfflineAudioContext = window.OfflineAudioContext;
  const off = new OAC(2, buf.length, buf.sampleRate);
  const pitchOk = await ensurePitchModule(off);
  onStage?.("prepare", 0.2);

  const src = off.createBufferSource();
  src.buffer = buf;

  const mix = Math.max(0, Math.min(1, intensity));
  let head: AudioNode;

  const pitch = pitchOk ? createPitchNode(off) : null;
  if (pitch) {
    pitch.parameters.get("semitones")!.value = model.semitones;
    pitch.parameters.get("mix")!.value = 1; // intensidade entra no crossfade depois
    src.connect(pitch);
    head = pitch;
  } else {
    // worklet indisponível (browser exótico): cai no playbackRate como paliativo
    const rate = Math.pow(2, model.semitones / 12);
    src.playbackRate.value = rate;
    head = src;
    // nota: muda o tempo junto — aviso honesto fica por conta do chamador
  }

  // ---- bancada de formantes (o "corpo" da identidade vocal) ----
  const mk = (type: BiquadFilterType, freq: number, q?: number, gainDb?: number) => {
    const f = off.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q !== undefined) f.Q.value = q;
    if (gainDb !== undefined) f.gain.value = gainDb;
    return f;
  };
  const out = off.createGain();
  let tail: AudioNode = head;
  switch (model.character) {
    case "feminino":
      tail = mk("highshelf", 2800, undefined, 3.5); // brilho/presença
      tail.connect(mk("peaking", 3200, 1.1, 2.5)).connect(out);
      out.gain.value = 1.05;
      break;
    case "masculino":
      tail = mk("lowshelf", 200, undefined, 4); // peito
      tail.connect(mk("peaking", 700, 0.9, 1.5)).connect(mk("highshelf", 6000, undefined, -2)).connect(out);
      out.gain.value = 1.05;
      break;
    case "jovem":
      tail = mk("peaking", 2500, 1.0, 3.5); // nasal jovem
      tail.connect(mk("highshelf", 3500, undefined, 2)).connect(out);
      out.gain.value = 1.05;
      break;
    case "idade": {
      // tremor lento de idade (vibrato discreto) + textura
      const dl = off.createDelay(0.05);
      dl.delayTime.value = 0.009;
      const lfo = off.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 3.2; // tremor essencial (~3 Hz)
      const lfoG = off.createGain();
      lfoG.gain.value = 0.0009;
      lfo.connect(lfoG);
      lfoG.connect(dl.delayTime);
      lfo.start(0);
      tail = mk("highpass", 110);
      tail.connect(dl);
      dl.connect(mk("peaking", 1800, 0.8, 1.5)).connect(out);
      out.gain.value = 1.1;
      break;
    }
  }
  // head (pitch worklet ou src paliativo) → bancada de formantes → out
  head.connect(tail);

  // intensidade: mix do original com o convertido DENTRO do render
  // (em 1.0 sai só a voz convertida; em 0.5 sai metade de cada)
  const dry = off.createGain();
  dry.gain.value = 1 - mix;
  const wetWrap = off.createGain();
  wetWrap.gain.value = mix;
  out.connect(wetWrap);
  const dest = off.createGain();
  dest.gain.value = 1;
  wetWrap.connect(dest);
  dry.connect(dest);
  src.connect(dry);
  dest.connect(off.destination);

  onStage?.("render", 0.35);
  const rendered = await off.startRendering();
  onStage?.("done", 1);
  return rendered;
}
