// GalaxyCut — importação de texto e legendas (.txt, .srt, .vtt) pra timeline.
// Parsers PUROS: nada de DOM/store aqui — quem chama aplica os cues como
// clipes de legenda (store.addCueClips). Tolerante a CRLF, BOM, blocos
// malformados e arquivos renomeados.
"use client";

export interface TextCue {
  start: number;
  end: number;
  text: string;
}

/** "HH:MM:SS,mmm" (SRT) ou "H:MM:SS.mmm"/"MM:SS.mmm" (VTT) → segundos */
export function parseTimecode(s: string): number | null {
  const m = s.trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/);
  if (!m) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = parseInt(m[2], 10);
  const sec = parseInt(m[3], 10);
  const ms = parseInt(m[4].padEnd(3, "0"), 10);
  return h * 3600 + min * 60 + sec + ms / 1000;
}

function blocksOf(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((b) => b.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l.trim() === "")));
}

function cueFromBlock(lines: string[], stripTags: boolean): TextCue | null {
  const idx = lines.findIndex((l) => l.includes("-->"));
  if (idx < 0) return null;
  const [rawA, rawB = ""] = lines[idx].split("-->");
  const start = parseTimecode(rawA ?? "");
  const end = parseTimecode(rawB.trim().split(/\s+/)[0] ?? "");
  if (start === null || end === null || end <= start) return null;
  let body = lines.slice(idx + 1).join("\n").trim();
  if (stripTags) body = body.replace(/<[^>]+>/g, "").trim();
  if (!body) return null;
  return { start, end, text: body };
}

export function parseSrt(input: string): TextCue[] {
  const cues: TextCue[] = [];
  for (const lines of blocksOf(input)) {
    const cue = cueFromBlock(lines, false);
    if (cue) cues.push(cue);
  }
  return cues;
}

export function parseVtt(input: string): TextCue[] {
  if (!/^\uFEFF?WEBVTT/.test(input.replace(/^\uFEFF/, "")) && !/^\s*WEBVTT/.test(input)) return [];
  const cues: TextCue[] = [];
  for (const lines of blocksOf(input)) {
    // blocos NOTE/STYLE/REGION e o cabeçalho não têm "-->" e caem fora sozinhos
    const cue = cueFromBlock(lines, true);
    if (cue) cues.push(cue);
  }
  return cues;
}

/** texto corrido: cada linha vira uma legenda, com duração estimada pela
 *  contagem de palavras (~ritmo de fala) — funciona bem pra roteiros */
export function parseTxt(input: string): TextCue[] {
  const lines = input
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const cues: TextCue[] = [];
  let t = 0;
  for (const line of lines) {
    const words = line.split(/\s+/).length;
    const dur = Math.min(8, Math.max(1.2, 0.32 * words + 0.8));
    cues.push({ start: t, end: t + dur, text: line });
    t += dur;
  }
  return cues;
}

/** roteia pelo nome do arquivo; .txt com cara de SRT entra como legenda */
export function detectAndParse(
  filename: string,
  input: string,
): { kind: "srt" | "vtt" | "txt"; cues: TextCue[] } | null {
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (ext === "srt") {
    const cues = parseSrt(input);
    return cues.length ? { kind: "srt", cues } : null;
  }
  if (ext === "vtt") {
    const cues = parseVtt(input);
    return cues.length ? { kind: "vtt", cues } : null;
  }
  if (ext === "txt") {
    const srt = parseSrt(input);
    if (srt.length) return { kind: "srt", cues: srt };
    const cues = parseTxt(input);
    return cues.length ? { kind: "txt", cues } : null;
  }
  return null;
}
