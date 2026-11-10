// Legendas de IA: o bug do dono era "as legendas saem só na frente".
// Aqui ficam as garantias matemáticas da parte que decide o TEMPO das
// palavras:
//  - as janelas cobrem a timeline inteira (nada de buraco no meio);
//  - a sobreposição entre janelas não duplica palavra;
//  - a última janela não descarta a cauda (a fala no fim precisa entrar);
//  - o texto injetado no worker é JS válido e faz a mesma coisa.
import { describe, expect, it } from "vitest";
import { planWindows, windowWordsToAbsolute, transcriptionCoverageWarning } from "./subtitleWindows";

describe("planWindows — cobertura das janelas", () => {
  it("uma janela só até 30s", () => {
    expect(planWindows(10)).toEqual([{ off: 0, len: 10 }]);
    expect(planWindows(30)).toEqual([{ off: 0, len: 30 }]);
  });

  it("as janelas cobrem a timeline INTEIRA (sem buraco)", () => {
    for (const total of [30.5, 60, 90, 100, 120, 300, 725]) {
      const plan = planWindows(total);
      expect(plan[0].off, `total ${total}`).toBe(0);
      const end = plan[plan.length - 1].off + plan[plan.length - 1].len;
      expect(end, `total ${total}`).toBeCloseTo(total, 3);
      for (let i = 1; i < plan.length; i++) {
        const gap = plan[i].off - (plan[i - 1].off + plan[i - 1].len);
        expect(gap, `total ${total} janela ${i}`).toBeLessThan(0);
      }
    }
  });

  it("nenhuma janela passa de 30s", () => {
    for (const w of planWindows(725)) expect(w.len).toBeLessThanOrEqual(30);
  });
});

describe("windowWordsToAbsolute — junção sem duplicar", () => {
  it("junta as palavras da janela em tempo absoluto", () => {
    const r = windowWordsToAbsolute(
      [
        { text: "olá", start: 0, end: 0.4 },
        { text: "mundo", start: 0.5, end: 1.0 },
      ],
      0,
      30,
      true,
      0
    );
    expect(r.words.map((w) => w.w)).toEqual(["olá", "mundo"]);
    expect(r.words[1].s).toBeCloseTo(0.5, 5);
    expect(r.lastEnd).toBeCloseTo(1.0, 5);
  });

  it("desloca pela posição da janela (off)", () => {
    const r = windowWordsToAbsolute([{ text: "depois", start: 1.0, end: 1.5 }], 30, 60, true, 0);
    expect(r.words[0].s).toBeCloseTo(31, 5);
    expect(r.words[0].e).toBeCloseTo(31.5, 5);
  });

  it("NÃO duplica a cabeça repetida pela janela anterior", () => {
    // janela 2 começa em 29.2 e repete 29.2–30 (já entregue na janela 1)
    const r = windowWordsToAbsolute(
      [
        { text: "repetida", start: 0, end: 0.8 }, // absoluta 29.2–30.0 (já veio)
        { text: "nova", start: 1.5, end: 2.0 }, // absoluta 30.7–31.2 (nova)
      ],
      29.2,
      59.2,
      false,
      29.9
    );
    expect(r.words.map((w) => w.w)).toEqual(["nova"]);
    expect(r.lastEnd).toBeCloseTo(31.2, 5);
  });

  it("NÃO descarta a cauda na ÚLTIMA janela (a fala do fim precisa entrar)", () => {
    const r = windowWordsToAbsolute([{ text: "final", start: 29.8, end: 30 }], 30, 60, true, 0);
    expect(r.words.map((w) => w.w)).toEqual(["final"]);
  });

  it("descarta a cauda nas janelas do meio (a próxima vai re-transcrever)", () => {
    const r = windowWordsToAbsolute([{ text: "cauda", start: 29.9, end: 30 }], 0, 30, false, 0);
    expect(r.words).toEqual([]);
  });

  it("palavra sem tempo do ASR não quebra a timeline", () => {
    const r = windowWordsToAbsolute([{ text: "semtempo", start: null, end: null }], 0, 30, true, 2);
    expect(r.words.length).toBe(1);
    expect(Number.isFinite(r.words[0].s)).toBe(true);
    expect(Number.isFinite(r.words[0].e)).toBe(true);
  });
});

describe("transcriptionCoverageWarning — o aviso de legenda truncada", () => {
  it("avisa quando a legenda para antes do fim da timeline", () => {
    const w = transcriptionCoverageWarning([{ start: 0, end: 10 }], 60);
    expect(w).toContain("10s");
    expect(w).toContain("60s");
  });

  it("não avisa quando a legenda cobre a timeline", () => {
    expect(transcriptionCoverageWarning([{ start: 0, end: 59 }], 60)).toBeUndefined();
  });

  it("não avisa em timeline curtinha (1–3s) nem sem fala", () => {
    expect(transcriptionCoverageWarning([{ start: 0, end: 1 }], 2)).toBeUndefined();
    expect(transcriptionCoverageWarning([], 60)).toBeUndefined();
  });
});

describe("injeção no worker", () => {
  it("o texto injetado é JS válido e reproduz o mesmo comportamento", () => {
    // o worker recebe as funções via Function.prototype.toString — se o
    // transpiler mexer nelas, o worker quebra em produção (SyntaxError).
    const src = `${planWindows.toString()}\n${windowWordsToAbsolute.toString()}`;
    const fn = new Function(`${src}; return { planWindows, windowWordsToAbsolute };`);
    const injected = fn() as { planWindows: typeof planWindows; windowWordsToAbsolute: typeof windowWordsToAbsolute };
    expect(injected.planWindows(60)).toEqual(planWindows(60));
    expect(
      injected.windowWordsToAbsolute([{ text: "x", start: 1, end: 2 }], 10, 40, true, 0).words[0].s
    ).toBeCloseTo(11, 5);
  });
});
