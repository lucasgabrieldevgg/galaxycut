// GalaxyCut — janela de transcrição e junção das palavras entre janelas.
// Estas funções são a FONTE ÚNICA: o worker de IA usa exatamente estas
// (injetadas no worker via Function.prototype.toString) e o teste unitário
// cobre a mesma matemática — sem duas implementações divergindo.
//
// Contexto: o Whisper processa no máximo 30s por chamada, então o app corta
// o áudio da timeline em janelas de 30s com 0,8s de sobreposição (para a
// palavra no corte não ser perdida) e depois junta as palavras sem repetir
// o trecho que as duas janelas/shared.

/** Uma janela da timeline: [off, off+len) em segundos. */
export interface WindowPlan {
  off: number;
  len: number;
}

/** Palavra como o ASR devolve (relativa ao começo da janela). */
export interface AsrWord {
  text: string;
  /** null = o ASR não soube o começo */
  start: number | null;
  /** null = o ASR não soube o fim */
  end: number | null;
}

/** Palavra já em tempo absoluto da timeline. */
export interface AbsoluteWord {
  w: string;
  s: number;
  e: number;
}

/**
 * Planeja as janelas: 30s com 0,8s de sobreposição, a última encurtada.
 * A cobertura é COMPLETA: a última janela sempre chega no fim do áudio.
 */
export function planWindows(total: number, win = 30, overlap = 0.8): WindowPlan[] {
  if (!isFinite(total) || total <= 0) return [{ off: 0, len: Math.max(0, win) }];
  const n = Math.max(1, Math.ceil((total - overlap) / (win - overlap)));
  const out: WindowPlan[] = [];
  for (let w = 0; w < n; w++) {
    const off = w * (win - overlap);
    const len = Math.min(win, total - off);
    if (len <= 0.05) break;
    out.push({ off, len });
  }
  return out.length ? out : [{ off: 0, len: Math.max(0.05, Math.min(win, total)) }];
}

/**
 * A transcrição cobriu a timeline inteira? O dono reportou "as legendas saem
 * só na frente" — este é o detector: se a última legenda termina muito
 * antes do fim da timeline, algo foi truncado (e a gente avisa).
 */
export function transcriptionCoverageWarning(
  segs: { start: number; end: number }[],
  totalDuration: number
): string | undefined {
  if (!segs.length || !(totalDuration > 3)) return undefined;
  const lastEnd = segs.reduce((mx, s) => Math.max(mx, s.end), 0);
  if (lastEnd < totalDuration - 2) {
    return `as legendas pararam em ${Math.round(lastEnd)}s de ${Math.round(totalDuration)}s`;
  }
  return undefined;
}

/**
 * Converte as palavras de UMA janela para tempo absoluto e descarta:
 *  - a cauda da janela que a PRÓXIMA janela vai transcrever de novo;
 *  - a cabeça que a janela ANTERIOR já entregou (sobreposição).
 * Devolve também o novo `lastEnd` (fim da última palavra aceita).
 */
export function windowWordsToAbsolute(
  words: AsrWord[],
  off: number,
  winEnd: number,
  isLastWindow: boolean,
  lastEnd: number
): { words: AbsoluteWord[]; lastEnd: number } {
  const out: AbsoluteWord[] = [];
  for (const c of words) {
    const text = (c.text ?? "").replace(/\s+/g, "");
    if (!text) continue;
    const s = (c.start ?? lastEnd - off) + off;
    let e = c.end ?? null;
    e = (e == null ? s - off + 0.4 : e) + off;
    if (!isLastWindow && e > winEnd - 0.35) continue;
    if (s < lastEnd - 0.06) continue;
    lastEnd = Math.max(lastEnd, e);
    out.push({ w: text, s, e: Math.max(s + 0.12, e) });
  }
  return { words: out, lastEnd };
}
