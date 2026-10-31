// Codec do link de compartilhar: a fronteira de confiança do GalaxyCut.
// Tudo que pode dar errado num link forjado precisa falhar AQUI, não no editor.
import { describe, expect, it } from "vitest";
import { makeClip, type Clip } from "./types";
import {
  buildShareLink,
  MAX_ENCODED_CHARS,
  parseShareLink,
  shareFragmentFromLocation,
  validateSharePayload,
  type SharePayload,
} from "./share";

function samplePayload(lvl: "view" | "edit" | "copy" = "view"): SharePayload {
  return {
    v: 1,
    lvl,
    name: "Minha edição",
    made: 1730000000000,
    app: "9.0.0",
    project: { name: "Minha edição", width: 1080, height: 1920, fps: 30 },
    tracks: [{ id: "V1", kind: "video", name: "Vídeo 1", muted: false, hidden: false }],
    clips: [makeClip({ kind: "text", trackId: "V1", start: 0, duration: 2 })],
    folders: [],
    media: [],
  };
}

describe("codec do link", () => {
  it("faz roundtrip ida e volta sem perder nada", async () => {
    const payload = samplePayload("edit");
    const link = await buildShareLink(payload);
    expect(link.startsWith("https://galaxycut.vercel.app/#s=")).toBe(true);
    const decoded = await parseShareLink(link.split("#s=")[1]);
    expect(decoded).toEqual(payload);
  });

  it("usa só caracteres URL-safe no fragmento", async () => {
    const link = await buildShareLink(samplePayload());
    const frag = link.split("#s=")[1];
    expect(frag).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("rejeita fragmento com caracteres inválidos", async () => {
    await expect(parseShareLink("não-válido!!")).rejects.toThrow();
  });

  it("rejeita gzip corrompido (link cortado/editado no meio)", async () => {
    const link = await buildShareLink(samplePayload());
    const frag = link.split("#s=")[1];
    const mangled = frag.slice(0, Math.floor(frag.length / 2)) + frag.slice(Math.floor(frag.length / 2) + 3);
    await expect(parseShareLink(mangled)).rejects.toThrow();
  });

  it("recusa edições grandes demais pro link (cap de 2,5 MB)", async () => {
    // conteúdo de alta entropia: gzip não consegue comprimir, então estoura o cap
    const big = Array.from({ length: 700_000 }, () => Math.floor(Math.random() * 1e9).toString(36)).join("");
    const payload = samplePayload();
    payload.clips = [{ ...payload.clips[0], note: big } as Clip];
    await expect(buildShareLink(payload)).rejects.toThrow("share/too-big");
  });
});

describe("validateSharePayload (link forjado)", () => {
  it("aceita payload bem-formado", () => {
    expect(validateSharePayload(samplePayload())).toBeTruthy();
  });

  it("rejeita versão desconhecida", () => {
    const p = samplePayload() as unknown as Record<string, unknown>;
    p.v = 2;
    expect(() => validateSharePayload(p)).toThrow();
  });

  it("rejeita nível inválido", () => {
    const p = samplePayload() as unknown as Record<string, unknown>;
    p.lvl = "admin";
    expect(() => validateSharePayload(p)).toThrow();
  });

  it("rejeita estrutura sem arrays", () => {
    const p = samplePayload() as unknown as Record<string, unknown>;
    p.clips = "não sou array";
    expect(() => validateSharePayload(p)).toThrow();
  });

  it("derruba clipes órfãos (faixa que não existe)", () => {
    const p = samplePayload();
    const orphan = makeClip({ kind: "text", trackId: "FAIXA-FANTASMA", start: 5, duration: 1 });
    p.clips = [...p.clips, orphan];
    const out = validateSharePayload(p);
    expect(out.clips.every((c) => c.trackId !== "FAIXA-FANTASMA")).toBe(true);
  });

  it("saneia clipes com tempo inválido (NaN/infinito não podem chegar ao motor)", () => {
    const p = samplePayload();
    p.clips = [{ ...p.clips[0], start: Number.NaN, duration: Number.POSITIVE_INFINITY } as Clip];
    const out = validateSharePayload(p);
    expect(out.clips[0].start).toBe(0);
    expect(Number.isFinite(out.clips[0].duration)).toBe(true);
  });

  it("limita a quantidade de clipes", () => {
    const p = samplePayload();
    p.clips = Array.from({ length: 2001 }, () => makeClip({ kind: "text", trackId: "V1", start: 0, duration: 1 }));
    expect(() => validateSharePayload(p)).toThrow();
  });
});

describe("shareFragmentFromLocation", () => {
  it("devolve null fora do navegador", () => {
    expect(shareFragmentFromLocation()).toBeNull();
  });
});

describe("caps", () => {
  it("cap de link codificado é razoável (2,5 MB)", () => {
    expect(MAX_ENCODED_CHARS).toBe(2_500_000);
  });
});
