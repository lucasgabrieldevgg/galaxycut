// Testes do escolhedor de arquivo do Internet Archive (v9.2).
// O bug histórico: pegávamos o MAIOR arquivo (o original 4K de 3h) — o preview
// engasgava ("uma cena por minuto"). A regra agora é derivado LEVE primeiro.
import { describe, expect, it } from "vitest";
import { pickIaFile, type IaFile } from "./stockClient";

/** item típico: original 4K gigante + derivados h.264 do IA + sample trailer */
const BIG_ITEM: IaFile[] = [
  { name: "flying_austria_4k_original.mkv", format: "Matroska video", size: "48000000000", length: "12366.9" },
  { name: "flying_austria_4k.mp4", format: "h.264 IA", size: "1200000000", length: "12366.9" },
  { name: "flying_austria_4k_512kb.mp4", format: "512Kb MPEG4", size: "780000000", length: "12366.9" },
  { name: "flying_austria_4k_sample.mp4", format: "MPEG4", size: "9000000", length: "30.0" },
  { name: "flying_austria_4k.ogg", format: "Ogg Video", size: "300000000", length: "12366.9" },
];

describe("pickIaFile (vídeo)", () => {
  it("prefere o DERIVADO leve (512Kb) ao original 4K gigante", () => {
    const pick = pickIaFile(BIG_ITEM, "video");
    expect(pick?.name).toBe("flying_austria_4k_512kb.mp4");
  });

  it("ignora samples/trailers de 30s mesmo sendo menores", () => {
    const pick = pickIaFile(BIG_ITEM, "video");
    expect(pick?.name).not.toContain("sample");
  });

  it("sem derivado: escolhe o menor mp4/webm com tamanho decente", () => {
    const files: IaFile[] = [
      { name: "original.mkv", format: "Matroska", size: "9000000000" },
      { name: "video.mp4", format: "MPEG4", size: "90000000" },
      { name: "big.mp4", format: "MPEG4", size: "500000000" },
    ];
    expect(pickIaFile(files, "video")?.name).toBe("video.mp4");
  });

  it("v9.4: só tem mkv? → null (antes alimentava o player com arquivo que o browser não decodifica → prévia preta em 0:00)", () => {
    const files: IaFile[] = [
      { name: "a.mkv", size: "9000000000" },
      { name: "b.mkv", size: "2000000000" },
    ];
    expect(pickIaFile(files, "video")).toBeNull();
  });

  it("sem nenhum arquivo utilizável → null (sem crash)", () => {
    expect(pickIaFile([], "video")).toBeNull();
    expect(pickIaFile([{ name: "only.txt", size: "10" }], "video")).toBeNull();
  });
});

describe("pickIaFile (áudio)", () => {
  it("pega o menor mp3 com pelo menos ~1min (não o FLAC de 500 MB)", () => {
    const files: IaFile[] = [
      { name: "album.flac", format: "Flac", size: "500000000", length: "3600" },
      { name: "track_128kb.mp3", format: "MP3", size: "58000000", length: "3600" },
      { name: "track_64kb.mp3", format: "MP3", size: "29000000", length: "3600" },
    ];
    expect(pickIaFile(files, "audio")?.name).toBe("track_64kb.mp3");
  });

  it("mp3 minúsculo demais (sample) é ignorado em favor do completo", () => {
    const files: IaFile[] = [
      { name: "preview_sample.mp3", format: "MP3", size: "20000", length: "2" },
      { name: "track.mp3", format: "MP3", size: "4800000", length: "300" },
    ];
    expect(pickIaFile(files, "audio")?.name).toBe("track.mp3");
  });

  it("só lossless? escolhe o menor mesmo assim", () => {
    const files: IaFile[] = [
      { name: "a.wav", size: "90000000" },
      { name: "b.flac", size: "30000000" },
    ];
    expect(pickIaFile(files, "audio")?.name).toBe("b.flac");
  });
});
