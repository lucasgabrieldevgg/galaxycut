// Portão de ruído: o núcleo matemático (RMS + histerese + ataque/liberação)
// é testado aqui — o worklet em si só embrulha esse núcleo.
import { describe, expect, it } from "vitest";
import { createGateState, gateGainCurve, GATE_WORKLET_SRC, type GateParams } from "./gateWorklet";

const SR = 48000;

function params(over: Partial<GateParams> = {}): GateParams {
  return {
    enabled: true,
    thresholdDb: -40,
    hysteresisDb: 6,
    attackMs: 5,
    releaseMs: 80,
    floorDb: -60,
    ...over,
  };
}

/** roda o portão por `seconds` com um sinal constante e devolve o ganho final */
function run(amplitude: number, seconds: number, p: GateParams = params()) {
  const state = createGateState();
  const n = Math.round(SR * seconds);
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = amplitude;
  const gains = new Float32Array(n);
  gateGainCurve(state, mono, gains, p, SR);
  return { state, gains };
}

describe("gateGainCurve — portão de ruído", () => {
  it("desligado deixa o áudio intacto", () => {
    const { gains } = run(0.0001, 0.2, params({ enabled: false }));
    expect(gains[0]).toBe(1);
    expect(gains[gains.length - 1]).toBe(1);
  });

  it("voz alta MANTÉM o portão aberto", () => {
    const { state, gains } = run(0.5, 0.5); // ~-6 dB
    expect(state.open).toBe(true);
    expect(gains[gains.length - 1]).toBeGreaterThan(0.99);
  });

  it("ruído de fundo ABAIXO do limiar FECHA o portão", () => {
    const { state, gains } = run(0.001, 0.5); // ~-60 dB
    expect(state.open).toBe(false);
    expect(gains[gains.length - 1]).toBeLessThan(0.01); // -60 dB de atenuação
  });

  it("a histerese impede ficar abrindo/fechando no limiar", () => {
    // nível entre (limiar - histerese) e limiar: o portão que já estava
    // aberto CONTINUA aberto (não fecha por ruído de borda)
    const p = params({ thresholdDb: -40, hysteresisDb: 12 });
    const amplitude = Math.pow(10, -45 / 20); // -45 dB: entre -52 e -40
    const { state } = run(amplitude, 0.5, p);
    expect(state.open).toBe(true);
  });

  it("a transição é SUAVIZADA (sem estalo)", () => {
    const state = createGateState();
    const p = params({ attackMs: 5, releaseMs: 80 });
    // 1/4 de segundo de silêncio (portão fecha) e depois voz (portão abre)
    const quiet = new Float32Array(SR / 4);
    const loud = new Float32Array(SR / 4).fill(0.5);
    const gains = new Float32Array(quiet.length + loud.length);
    gateGainCurve(state, quiet, gains.subarray(0, quiet.length), p, SR);
    gateGainCurve(state, loud, gains.subarray(quiet.length), p, SR);
    // na virada, o ganho muda de forma gradual (sem degrau de 1 → 0)
    let maxJump = 0;
    for (let i = 1; i < gains.length; i++) maxJump = Math.max(maxJump, Math.abs(gains[i] - gains[i - 1]));
    expect(maxJump).toBeLessThan(0.05);
  });

  it("o ganho volta a 1 depois que a voz volta", () => {
    const state = createGateState();
    const p = params();
    const quiet = new Float32Array(SR / 2);
    const loud = new Float32Array(SR).fill(0.5);
    const gains = new Float32Array(quiet.length + loud.length);
    gateGainCurve(state, quiet, gains.subarray(0, quiet.length), p, SR);
    gateGainCurve(state, loud, gains.subarray(quiet.length), p, SR);
    expect(gains[gains.length - 1]).toBeGreaterThan(0.99);
  });
});

describe("worklet do portão", () => {
  it("o código-fonte é JS válido e registra o processador", () => {
    expect(GATE_WORKLET_SRC).toContain('registerProcessor("gc-gate"');
    expect(() => new Function(GATE_WORKLET_SRC.replace(/registerProcessor\([^)]*\);?/, ""))).not.toThrow();
  });

  it("o núcleo injetado no worklet é o mesmo testado aqui", () => {
    const src = `${createGateState.toString()}\n${gateGainCurve.toString()}`;
    const fn = new Function(`${src}; return { createGateState, gateGainCurve };`);
    const injected = fn() as { createGateState: typeof createGateState; gateGainCurve: typeof gateGainCurve };
    const state = injected.createGateState();
    const mono = new Float32Array(24000).fill(0.001); // 0,5s de chiado
    const gains = new Float32Array(24000);
    injected.gateGainCurve(state, mono, gains, params(), SR);
    expect(state.open).toBe(false);
    expect(gains[23999]).toBeLessThan(0.01);
  });
});
