// Testes do motor puro de types.ts — keyframes, easing, envelopes e SRT.
// São as funções que o preview E a exportação compartilham: se elas quebrarem,
// os dois caminhos quebram juntos (por design — drawFrame única).
import { describe, expect, it } from "vitest";
import { applyEasing, clipEnd, evaluateClipState, fadeEnvelope, fmtSrtTime, makeClip } from "./types";

describe("applyEasing", () => {
  it("linear é identidade dentro de [0,1] e trava fora", () => {
    expect(applyEasing(0.3, "linear")).toBeCloseTo(0.3);
    expect(applyEasing(2, "linear")).toBe(1);
    expect(applyEasing(-1, "linear")).toBe(0);
  });

  it("easeIn/easeOut cúbicos batem nos pontos-chave", () => {
    expect(applyEasing(0.5, "easeIn")).toBeCloseTo(0.125);
    expect(applyEasing(0.5, "easeOut")).toBeCloseTo(0.875);
    expect(applyEasing(0, "easeIn")).toBe(0);
    expect(applyEasing(1, "easeOut")).toBe(1);
  });

  it("spring e bounce começam em 0 e terminam em 1", () => {
    expect(applyEasing(0, "spring")).toBe(0);
    expect(applyEasing(1, "spring")).toBe(1);
    expect(applyEasing(0, "bounce")).toBe(0);
    expect(applyEasing(1, "bounce")).toBeCloseTo(1, 3);
  });

  it("sem easing cai no padrão suave (quad easeInOut)", () => {
    expect(applyEasing(0.5)).toBeCloseTo(0.5);
    expect(applyEasing(0.25)).toBeCloseTo(0.125);
  });
});

describe("clipEnd / fadeEnvelope", () => {
  const clip = { ...makeClip({ kind: "text", trackId: "T", start: 10, duration: 4 }), fadeIn: 1, fadeOut: 1 };

  it("clipEnd = start + duration", () => {
    expect(clipEnd(clip)).toBe(14);
  });

  it("fade entra do 0 até 1 no fadeIn e sai de 1 até 0 no fadeOut", () => {
    expect(fadeEnvelope(clip, 10)).toBe(0);
    expect(fadeEnvelope(clip, 10.5)).toBeCloseTo(0.5);
    expect(fadeEnvelope(clip, 12)).toBe(1);
    expect(fadeEnvelope(clip, 13.6)).toBeCloseTo(0.4);
    expect(fadeEnvelope(clip, 14)).toBe(0);
  });
});

describe("fmtSrtTime", () => {
  it("formata horas:min:seg,milissegundos", () => {
    expect(fmtSrtTime(3661.5)).toBe("01:01:01,500");
    expect(fmtSrtTime(3.456)).toBe("00:00:03,456");
  });

  it("tempos inválidos viram zero, nunca NaN", () => {
    expect(fmtSrtTime(-5)).toBe("00:00:00,000");
    expect(fmtSrtTime(Number.NaN)).toBe("00:00:00,000");
  });
});

describe("evaluateClipState (keyframes)", () => {
  const base = makeClip({ kind: "text", trackId: "T", start: 10, duration: 4 });

  it("sem keyframes devolve os valores base do clipe", () => {
    const c = { ...base, x: 5, scale: 2, opacity: 0.8 };
    const s = evaluateClipState(c, 12);
    expect(s.x).toBeCloseTo(5);
    expect(s.scale).toBeCloseTo(2);
    expect(s.opacity).toBeCloseTo(0.8);
  });

  it("antes do primeiro e depois do último keyframe segura o valor da ponta", () => {
    const c = {
      ...base,
      keyframes: [
        { id: "k1", time: 1, x: 0 },
        { id: "k2", time: 3, x: 100 },
      ],
    };
    expect(evaluateClipState(c, 10.5).x).toBeCloseTo(0); // antes do 1º
    expect(evaluateClipState(c, 13.5).x).toBeCloseTo(100); // depois do último
  });

  it("interpola entre dois keyframes (easeInOut no meio do caminho = média)", () => {
    const c = {
      ...base,
      keyframes: [
        { id: "k1", time: 1, x: 0 },
        { id: "k2", time: 3, x: 100 },
      ],
    };
    // tRel = 2 → p bruto 0.5 → easeInOut cúbico(0.5) = 0.5 → x = 50
    expect(evaluateClipState(c, 12).x).toBeCloseTo(50);
  });

  it("campo ausente no keyframe preserva o valor base do clipe", () => {
    const c = {
      ...base,
      scale: 3,
      keyframes: [
        { id: "k1", time: 1, x: 0 },
        { id: "k2", time: 3, x: 100 },
      ],
    };
    expect(evaluateClipState(c, 12).scale).toBeCloseTo(3);
  });
});

// ---- v9.2: integridade dos catálogos novos (efeitos/transições) ----
import { ANIMATIONS_IN, ANIMATIONS_OUT, ANIMATIONS_COMBO, EFFECT_CATALOG, TRANSITIONS } from "./types";

describe("catálogos v9.2", () => {
  it("TRANSITIONS não tem tipo repetido e cobre as novas (iris, blinds, whipPan…)", () => {
    const ids = TRANSITIONS.map((t) => t.type);
    expect(new Set(ids).size).toBe(ids.length);
    for (const must of ["slideUp", "slideDown", "wipeUp", "wipeDown", "zoomOut", "spin", "glitchT", "whipPan", "blinds", "iris"] as const) {
      expect(ids).toContain(must);
    }
    expect(ids[0]).toBe("none"); // "Nenhuma" sempre em primeiro
  });

  it("EFFECT_CATALOG não tem efeito repetido e a categoria Pessoas & Beleza existe", () => {
    const ids = EFFECT_CATALOG.map((e) => e.type);
    expect(new Set(ids).size).toBe(ids.length);
    const people = EFFECT_CATALOG.filter((e) => e.category === "people");
    expect(people.length).toBeGreaterThanOrEqual(6);
    for (const must of ["skinSmooth", "manGrade", "womanGrade", "kidPop"] as const) {
      expect(ids).toContain(must);
    }
    // todo efeito do catálogo tem nome/descrição (a UI mostra os dois)
    for (const e of EFFECT_CATALOG) {
      expect(e.name.length).toBeGreaterThan(2);
      expect(e.description.length).toBeGreaterThan(10);
    }
  });

  it("animações continuam sem duplicatas nas três listas", () => {
    for (const list of [ANIMATIONS_IN, ANIMATIONS_OUT, ANIMATIONS_COMBO]) {
      const ids = list.map((a) => a.type);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});
