// Efeitos de voz: integridade do catálogo e sanidade da curva de distorção.
// (O grafo em si roda em WebAudio — browser — e é verificado no fluxo manual.)
import { describe, expect, it } from "vitest";
import { VOICE_FX, VOICE_FX_PLANNED, softClipCurve } from "./voiceFx";
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
    for (const fx of VOICE_FX_PLANNED) {
      expect(PT[fx.nameKey], `chave ${fx.nameKey} ausente`).toBeTruthy();
      expect(PT[fx.descKey], `chave ${fx.descKey} ausente`).toBeTruthy();
    }
  });

  it("tem os 4 efeitos do roadmap + os 5 novos da v9.1", () => {
    expect(VOICE_FX.map((f) => f.id).sort()).toEqual([
      "alien", "bass", "echo", "megaphone", "radio", "robot", "studio", "telephone", "underwater",
    ]);
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
