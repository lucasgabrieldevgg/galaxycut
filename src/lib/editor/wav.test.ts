// encodeWav: o cabeçalho RIFF/WAVE tem que ser válido em qualquer leitor,
// e as amostras têm que clampar direitinho em ±1.
import { describe, expect, it } from "vitest";
import { encodeWav } from "./wav";

function fakeBuffer(channels: Float32Array[], sampleRate: number): AudioBuffer {
  return {
    numberOfChannels: channels.length,
    length: channels[0].length,
    sampleRate,
    getChannelData: (i: number) => channels[i],
  } as unknown as AudioBuffer;
}

describe("encodeWav", () => {
  it("gera cabeçalho RIFF/WAVE PCM 16-bit correto", async () => {
    const blob = encodeWav(fakeBuffer([new Float32Array(10)], 48000),);
    const ab = await blob.arrayBuffer();
    const v = new DataView(ab);
    const tag = (off: number) => String.fromCharCode(...new Uint8Array(ab, off, 4));
    expect(tag(0)).toBe("RIFF");
    expect(v.getUint32(4, true)).toBe(36 + 10 * 2); // 10 amostras mono de 2 bytes
    expect(tag(8)).toBe("WAVE");
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint16(34, true)).toBe(16); // bits
    expect(tag(36)).toBe("data");
  });

  it("clampa amostras no range int16 e codifica os extremos", async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]);
    const blob = encodeWav(fakeBuffer([samples], 44100));
    const v = new DataView(await blob.arrayBuffer());
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(Math.floor(0.5 * 0x7fff));
    expect(v.getInt16(48, true)).toBe(Math.floor(-0.5 * 0x8000));
    expect(v.getInt16(50, true)).toBe(0x7fff); // +1
    expect(v.getInt16(52, true)).toBe(-0x8000); // -1
    expect(v.getInt16(54, true)).toBe(0x7fff); // +2 clampa
    expect(v.getInt16(56, true)).toBe(-0x8000); // -2 clampa
  });
});
