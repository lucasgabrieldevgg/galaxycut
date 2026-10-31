// Parsers de texto/legenda: tolerância é o contrato — arquivo do mundo real
// vem com CRLF, BOM, blocos sem índice e coisa renomeada.
import { describe, expect, it } from "vitest";
import { detectAndParse, parseSrt, parseTimecode, parseTxt, parseVtt } from "./textImport";

describe("parseTimecode", () => {
  it("aceita SRT (vírgula) e VTT (ponto), com ou sem horas", () => {
    expect(parseTimecode("00:00:01,500")).toBe(1.5);
    expect(parseTimecode("00:00:01.500")).toBe(1.5);
    expect(parseTimecode("01:00:00,000")).toBe(3600);
    expect(parseTimecode("01:02:03.004")).toBe(3723.004);
  });

  it("rejeita lixo sem explodir", () => {
    expect(parseTimecode("abc")).toBeNull();
    expect(parseTimecode("")).toBeNull();
    expect(parseTimecode("00:00")).toBeNull();
  });
});

describe("parseSrt", () => {
  const srt = [
    "1\r\n00:00:01,000 --> 00:00:03,500\r\nOlá mundo\r\n",
    "\r\n00:00:04,000 --> 00:00:05,000\r\nSem índice\r\n",
    "\r\n3\r\n00:00:06,000 --> 00:00:05,000\r\nFim antes do começo (inválido)\r\n",
  ].join("");

  it("tolera CRLF, bloco sem índice e ignora bloco inválido", () => {
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({ start: 1, end: 3.5, text: "Olá mundo" });
    expect(cues[1].text).toBe("Sem índice");
  });

  it("junta múltiplas linhas com quebra", () => {
    const cues = parseSrt("1\n00:00:00,000 --> 00:00:02,000\nlinha 1\nlinha 2\n");
    expect(cues[0].text).toBe("linha 1\nlinha 2");
  });

  it("devolve vazio pra arquivo sem nenhuma legenda válida", () => {
    expect(parseSrt("nada aqui")).toEqual([]);
  });
});

describe("parseVtt", () => {
  const vtt = [
    "WEBVTT",
    "",
    "NOTE isso é um comentário",
    "com duas linhas",
    "",
    "STYLE",
    "::cue { color: red }",
    "",
    "cue-1",
    "00:00:00.000 --> 00:00:02.000 line:90%",
    "Olá <c.bold>mundo</c>",
    "",
    "00:02.000 --> 00:04.000",
    "Segunda legenda",
    "",
  ].join("\n");

  it("ignora NOTE/STYLE, limpa tags inline, aceita timecode sem horas", () => {
    const cues = parseVtt(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].text).toBe("Olá mundo");
    expect(cues[1]).toEqual({ start: 2, end: 4, text: "Segunda legenda" });
  });

  it("exige cabeçalho WEBVTT", () => {
    expect(parseVtt("00:00:00.000 --> 00:00:02.000\noi\n")).toEqual([]);
  });
});

describe("parseTxt", () => {
  it("cada linha vira uma legenda encadeada no tempo", () => {
    const cues = parseTxt("oi\numa frase bem maior de palavras\n\n");
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBe(0);
    expect(cues[0].end).toBeGreaterThan(0);
    expect(cues[1].start).toBe(cues[0].end);
    expect(cues[1].end).toBeGreaterThan(cues[1].start);
  });

  it("duração cresce com a contagem de palavras (ritmo de fala)", () => {
    const [curta, longa] = parseTxt("oi\n" + "palavra ".repeat(20)).map((c) => c.end - c.start);
    expect(longa).toBeGreaterThan(curta);
  });
});

describe("detectAndParse", () => {
  it(".txt com conteúdo de SRT é detectado como legenda", () => {
    const r = detectAndParse("renomeado.txt", "1\n00:00:01,000 --> 00:00:02,000\noi\n");
    expect(r?.kind).toBe("srt");
    expect(r?.cues).toHaveLength(1);
  });

  it(".srt sem legendas válidas devolve null", () => {
    expect(detectAndParse("x.srt", "lixo total")).toBeNull();
  });

  it("extensão desconhecida devolve null", () => {
    expect(detectAndParse("clipe.mp4", "oi")).toBeNull();
  });
});
