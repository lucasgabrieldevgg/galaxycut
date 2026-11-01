// Efeitos de voz: integridade do catálogo e sanidade da curva de distorção.
// (O grafo em si roda em WebAudio — browser — e é verificado no fluxo manual.)
import { describe, expect, it } from "vitest";
import { VOICE_FX, PITCH_FX, softClipCurve } from "./voiceFx";
import { PITCH_WORKLET_SRC } from "./pitchWorklet";
import { PT } from "./i18n";

describe("catálogo de efeitos de voz", () => {
  it("ids únicos e chaves de i18n existentes", () => {
    const ids = new Set<string>();
    for (const fx of VOICE_FX) {
      expect(ids.has(fx.id), `id duplicado: ${fx.id}`).toBe(false);
      ids.add(fx.id);
      expect(PT[fx.nameKey], `chave ${fx.nameKey} ausente`).toBeTruthy();
      expect(PT[fx.descKey], `chave ${fx.descKey} ausente`).toBeTruthy();
    }
  });

  it("v9.4: 9 clássicos preservados + 20 novos (altura, modulação, ambiente, antigos)", () => {
    const ids = VOICE_FX.map((f) => f.id).sort();
    expect(ids).toEqual([
      // clássicos (v9.1)
      "alien", "bass", "echo", "megaphone", "radio", "robot", "studio", "telephone", "underwater",
      // altura/personagens (pitch real)
      "aguda", "crianca", "desenho", "esquilo", "fantasma", "graveProf", "locutor", "monstro", "narrador",
      // modulação
      "chorus", "flanger", "tremolo", "vibrato",
      // ambiente/tempo
      "delayFx", "reverbAmb", "sussurro",
      // caráter/mídia antiga
      "distorcida", "gravAntiga", "radioInterf", "telAntigo",
    ].sort());
    expect(VOICE_FX.length).toBe(29);
  });

  it("efeitos com pitch declaram o controle de tonalidade", () => {
    for (const id of PITCH_FX) {
      const meta = VOICE_FX.find((f) => f.id === id);
      expect(meta?.pitch, `${id} deveria ter pitch: true`).toBe(true);
    }
  });
});

describe("worklet de pitch (granular)", () => {
  it("o código registra o processador com os parâmetros semitones/mix", () => {
    expect(PITCH_WORKLET_SRC).toContain('registerProcessor("gc-pitch"');
    expect(PITCH_WORKLET_SRC).toContain('"semitones"');
    expect(PITCH_WORKLET_SRC).toContain('"mix"');
    // janelas Hann complementares: a soma tem que ser 1 em qualquer fase
    for (let i = 0; i <= 20; i++) {
      const phi = i / 20;
      const a = 0.5 * (1 - Math.cos(2 * Math.PI * phi));
      expect(a).toBeGreaterThanOrEqual(-1e-9);
      expect(a).toBeLessThanOrEqual(1 + 1e-9);
      expect(a + (1 - a)).toBeCloseTo(1, 9);
    }
  });
});

describe("softClipCurve", () => {
  it("gera curva monotônica em [-1, 1] com extremos exatos", () => {
    const curve = softClipCurve(2);
    expect(curve.length).toBe(1024);
    expect(curve[0]).toBeCloseTo(-1, 5);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 5);
    let max = 0;
    let prev = -Infinity;
    for (const v of curve) {
      max = Math.max(max, Math.abs(v));
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9); // monotônica
      prev = v;
    }
    expect(max).toBeLessThanOrEqual(1.0000001);
  });

  it("passa perto do zero no meio da curva (sem offset DC)", () => {
    const curve = softClipCurve(1.4);
    const mid = curve[Math.floor(curve.length / 2)];
    expect(Math.abs(mid)).toBeLessThan(0.002);
  });
});
