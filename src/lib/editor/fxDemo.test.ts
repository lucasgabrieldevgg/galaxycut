// Testes do fxDemo — o mapa "qual foto demonstra o quê" tem que cobrir o
// catálogo INTEIRO (um efeito novo sem foto cai no default, mas o teste
// documenta a intenção e pega regressões na linha Pessoas & Beleza).
import { describe, expect, it } from "vitest";
import { EFFECT_CATALOG } from "./types";
import { effectAnimates, FX_DEMO_FILE, FX_TRANSITION_PHOTOS, photoForEffect } from "./fxDemo";

describe("fxDemo (demonstrações com fotos reais)", () => {
  it("todo efeito do catálogo tem uma foto de demonstração válida", () => {
    const valid = Object.keys(FX_DEMO_FILE);
    for (const e of EFFECT_CATALOG) {
      const p = photoForEffect(e.type);
      expect(valid).toContain(p);
    }
  });

  it("Pessoas & Beleza usa o retrato na medida (homem/mulher/criança)", () => {
    expect(photoForEffect("manGrade")).toBe("man");
    expect(photoForEffect("kidPop")).toBe("kid");
    expect(photoForEffect("womanGrade")).toBe("woman");
    expect(photoForEffect("skinSmooth")).toBe("woman");
    expect(photoForEffect("beautyGlow")).toBe("woman");
    expect(photoForEffect("clarity")).toBe("woman");
  });

  it("efeitos de clima/grade ficam na cena urbana (mostra cor e movimento)", () => {
    expect(photoForEffect("tealOrange")).toBe("scene");
    expect(photoForEffect("rain")).toBe("scene");
    expect(photoForEffect("vhs")).toBe("scene");
  });

  it("transição demonstra uma troca visível (fotos A e B diferentes)", () => {
    const [a, b] = FX_TRANSITION_PHOTOS;
    expect(a).not.toBe(b);
    expect(Object.keys(FX_DEMO_FILE)).toContain(a);
    expect(Object.keys(FX_DEMO_FILE)).toContain(b);
  });

  it("a lista de efeitos animados é a allowlist conhecida (custo de redraw consciente)", () => {
    const allow = new Set([
      "shake",
      "glitch",
      "flash",
      "vhs",
      "lightning",
      "rain",
      "snowfall",
      "sciFiScan",
      // v9.4
      "fog",
      "sparks",
      "confetti",
      "bubbles",
      "neonGrid",
      "filmBurn",
    ]);
    for (const e of EFFECT_CATALOG) {
      if (effectAnimates(e.type)) expect(allow.has(e.type)).toBe(true);
    }
    // e a allowlist inteira existe de fato no catálogo
    for (const t of allow) expect(EFFECT_CATALOG.some((e) => e.type === t)).toBe(true);
  });
});
