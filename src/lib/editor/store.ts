// GaláxiaCut — estado do projeto (zustand) com histórico undo/redo
"use client";

import { create } from "zustand";
import {
  Clip,
  MediaMeta,
  ProjectMeta,
  Track,
  Transition,
  clipEnd,
  defaultTextProps,
  makeClip,
  uid,
} from "./types";
import { registry } from "./media";
import { spansToTimeline, SilenceSpan } from "./silence";
import { decodeAudioOf, encodeWav, peaksFromBuffer } from "./wav";
import * as projects from "./projects";

interface Snapshot {
  project: ProjectMeta;
  tracks: Track[];
  clips: Clip[];
  media: MediaMeta[];
}

interface ProjectState extends Snapshot {
  selectedId: string | null;
  /** seleção múltipla (Ctrl+clique / Ctrl+A) — selectedId é o principal */
  selectedIds: string[];
  past: Snapshot[];
  future: Snapshot[];
  // histórico
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  // projeto
  setProject: (patch: Partial<ProjectMeta>) => void;
  clearProject: () => void;
  loadSnapshot: (s: { project: ProjectMeta; tracks: Track[]; clips: Clip[]; media: MediaMeta[] }) => void;
  // mídia
  addMedia: (meta: MediaMeta) => void;
  updateMedia: (id: string, patch: Partial<MediaMeta>) => void;
  relinkMedia: (id: string) => void;
  removeMedia: (id: string) => void;
  // clipes
  addClip: (c: Clip) => void;
  addClipFromMedia: (mediaId: string) => Clip | null;
  /** solta uma mídia em ponto específico. NÃO empilha: se o ponto tá ocupado,
   *  acha o espaço livre mais próximo (em cima/baixo/entre clipes) e devolve
   *  { clip, redirected } — redirected=true quando precisou mover do ponto pedido. */
  dropMediaAt: (mediaId: string, trackId: string, start: number) => { clip: Clip; redirected: boolean } | null;
  /** depois de arrastar livre: empurra os clipes que ficaram por baixo (inserção estilo CapCut). Devolve quantos empurrou. */
  settleOverlaps: (clipId: string) => number;
  addTextClip: (at: number, preset?: Partial<ReturnType<typeof defaultTextProps>>) => void;
  updateClip: (id: string, patch: Partial<Clip>, opts?: { history?: boolean }) => void;
  moveClipLive: (id: string, start: number, trackId: string) => void;
  /** apaga o clipe. ripple=true puxa os da frente pra fechar o espaço junto com o de trás */
  deleteClip: (id: string, ripple?: boolean) => void;
  /** move ESTE clipe pra encostar no de trás (fecha o espaço que ficou) */
  closeGapBefore: (id: string) => void;
  /** fecha todos os espaços da faixa (efeito dominó) */
  closeTrackGaps: (trackId: string) => void;
  /** separa o áudio de um clipe de vídeo em faixa de áudio (e silencia o original).
   *  v5: o áudio destacado vira uma MÍDIA DE ÁUDIO DE VERDADE (arquivo WAV
   *  próprio, salvo no navegador) — aparece na aba Áudio e sobrevive ao F5. */
  extractAudio: (id: string) => Promise<Clip | null>;
  /** aplica os trechos sem som (tempo do ARQUIVO) em TODOS os clipes que usam essa mídia */
  applySilenceToMany: (clipIds: string[], fileSpans: SilenceSpan[], mode: SilenceMode) => number;
  /** vassoura: apaga de uma vez todos os clipes de áudio sem som (mutados/volume 0) */
  deleteSilentClips: () => number;
  /** aplica os trechos sem som: corta/muta/esconde (num clipe só — veja applySilenceToMany) */
  applySilence: (clipId: string, ranges: { a: number; b: number }[], mode: SilenceMode) => void;
  duplicateClip: (id: string) => void;
  splitAt: (t: number) => void;
  select: (id: string | null) => void;
  /** Ctrl+clique: liga/desliga um clipe da seleção múltipla */
  toggleSelect: (id: string) => void;
  /** Ctrl+A: seleciona todas as cenas (áudio e vídeo, inclusive as escondidas) */
  selectAll: () => void;
  deselectAll: () => void;
  /** apaga todos os clipes da seleção múltipla (sem mexer nos da frente) */
  deleteSelected: () => number;
  /** modo seleção (duplo clique): clicar nos clipes vai marcando/desmarcando */
  batchMode: boolean;
  setBatchMode: (v: boolean) => void;
  /** fecha os espaços de TODAS as faixas de uma vez (efeito dominó) */
  closeAllGaps: () => number;
  setTransition: (clipId: string, trans: Transition | undefined) => void;
  // área de transferência
  copyClip: (id: string) => void;
  cutClip: (id: string) => void;
  pasteAtPlayhead: () => void;
  // faixas
  toggleTrack: (id: string, field: "muted" | "hidden") => void;
  addTrack: (kind: Track["kind"]) => void;
  removeTrack: (id: string) => void;
}

function snap(s: ProjectState): Snapshot {
  return JSON.parse(JSON.stringify({ project: s.project, tracks: s.tracks, clips: s.clips, media: s.media })) as Snapshot;
}

/** clipboard de clipe (copiar/colar) */
let clipboard: Clip | null = null;

/** Acha o espaço livre mais próximo na faixa que caiba um clipe de `dur` segundos.
 *  Nunca devolve posição em cima de outro clipe — é o ant "só em cima, embaixo
 *  ou entre clipes". Se nada couber, cola no fim da faixa. */
export function findFreeSlot(clips: Clip[], trackId: string, want: number, dur: number): { start: number; moved: boolean } {
  const sorted = clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
  const gaps: { g0: number; g1: number }[] = [];
  let cursor = 0;
  for (const c of sorted) {
    if (c.start > cursor + 0.001) gaps.push({ g0: cursor, g1: c.start });
    cursor = Math.max(cursor, c.start + c.duration);
  }
  gaps.push({ g0: cursor, g1: Infinity }); // espaço após o último
  let best: { start: number; dist: number } | null = null;
  for (const g of gaps) {
    if (g.g1 - g.g0 < dur - 0.001) continue; // não cabe
    const s = Math.max(g.g0, Math.min(want, g.g1 - dur)); // mais perto do pedido DENTRO do vão
    const dist = Math.abs(s - want);
    if (!best || dist < best.dist - 0.001) best = { start: s, dist };
  }
  if (best) return { start: Math.max(0, best.start), moved: Math.abs(best.start - want) > 0.01 };
  // faixa lotada (só com clipes coladíssimos) → fim da faixa
  return { start: cursor, moved: true };
}

/** modos do detector de silêncio */
export type SilenceMode = "both" | "audio" | "scene" | "delaudio";

/** Fatiamento do cortar-silêncio: devolve os pedaços que sobram do clipe
 *  depois de tratar os trechos marcados (excluir / mutar / esconder a cena).
 *  As peças que SOBREVIVEM como “trecho sem som” ganham silenceMark — assim
 *  a seleção pós-detecção marca SÓ o silêncio (o dono apaga com Delete). */
function buildSilencePieces(clip: Clip, ranges: { a: number; b: number }[], mode: "both" | "audio" | "scene"): Clip[] {
  const speed = clip.speed || 1;
  const end = clipEnd(clip);
  const makePiece = (ps: number, pe: number): Clip => ({
    ...clip,
    id: uid(),
    start: ps,
    duration: pe - ps,
    inPoint: clip.inPoint + (ps - clip.start) * speed,
    outPoint: clip.inPoint + (pe - clip.start) * speed,
    transitionIn: Math.abs(ps - clip.start) < 0.001 ? clip.transitionIn : undefined,
  });
  const sorted = [...ranges].sort((r1, r2) => r1.a - r2.a);
  const pieces: Clip[] = [];
  let cursor = clip.start;
  for (const r of sorted) {
    const a = Math.max(clip.start, r.a);
    const b = Math.min(end, r.b);
    if (b - a < 0.02) continue;
    if (a - cursor > 0.02) pieces.push(makePiece(cursor, a));
    if (mode === "audio") {
      pieces.push({ ...makePiece(a, b), muted: true, silenceMark: true }); // vídeo continua, som cortado
    } else if (mode === "scene") {
      pieces.push({ ...makePiece(a, b), videoHidden: true, silenceMark: true }); // tela preta, som continua
    }
    // mode === "both" → o trecho some inteiro (e NADA se move pra preencher)
    cursor = b;
  }
  if (end - cursor > 0.02) pieces.push(makePiece(cursor, end));
  return pieces;
}

export const useProject = create<ProjectState>((set, get) => ({
  project: { name: "Nova edição", width: 1080, height: 1920, fps: 30 },
  tracks: [
    { id: "T-texto", kind: "text", name: "Texto", muted: false, hidden: false },
    { id: "V3", kind: "video", name: "Vídeo 3", muted: false, hidden: false },
    { id: "V2", kind: "video", name: "Vídeo 2", muted: false, hidden: false },
    { id: "V1", kind: "video", name: "Vídeo 1 (principal)", muted: false, hidden: false },
    { id: "A3", kind: "audio", name: "Áudio 3", muted: false, hidden: false },
    { id: "A2", kind: "audio", name: "Áudio 2", muted: false, hidden: false },
    { id: "A1", kind: "audio", name: "Áudio 1 (música)", muted: false, hidden: false },
  ],
  clips: [],
  media: [],
  selectedId: null,
  selectedIds: [],
  past: [],
  future: [],

  pushHistory: () => {
    const s = get();
    set({ past: [...s.past.slice(-59), snap(s)], future: [] });
  },
  undo: () => {
    const s = get();
    if (!s.past.length) return;
    const prev = s.past[s.past.length - 1];
    set({ past: s.past.slice(0, -1), future: [snap(s), ...s.future].slice(0, 60), ...prev });
  },
  redo: () => {
    const s = get();
    if (!s.future.length) return;
    const nxt = s.future[0];
    set({ future: s.future.slice(1), past: [...s.past, snap(s)], ...nxt });
  },

  setProject: (patch) => {
    get().pushHistory();
    set((s) => ({ project: { ...s.project, ...patch } }));
  },
  clearProject: () => {
    get().pushHistory();
    set({
      project: { name: "Nova edição", width: 1080, height: 1920, fps: 30 },
      tracks: [
        { id: "T-texto", kind: "text", name: "Texto", muted: false, hidden: false },
        { id: "V3", kind: "video", name: "Vídeo 3", muted: false, hidden: false },
        { id: "V2", kind: "video", name: "Vídeo 2", muted: false, hidden: false },
        { id: "V1", kind: "video", name: "Vídeo 1 (principal)", muted: false, hidden: false },
        { id: "A3", kind: "audio", name: "Áudio 3", muted: false, hidden: false },
        { id: "A2", kind: "audio", name: "Áudio 2", muted: false, hidden: false },
        { id: "A1", kind: "audio", name: "Áudio 1 (música)", muted: false, hidden: false },
      ],
      clips: [],
      media: [],
      selectedId: null,
      selectedIds: [],
    });
  },
  loadSnapshot: (s: {
    project: ProjectMeta;
    tracks: Track[];
    clips: Clip[];
    media: MediaMeta[];
    /** histórico salvo em disco (desktop): restaura o Ctrl+Z depois de fechar o app */
    past?: Snapshot[];
    future?: Snapshot[];
  }) => set({
    project: s.project,
    tracks: s.tracks,
    clips: s.clips,
    media: s.media,
    selectedId: null,
    selectedIds: [],
    past: (s.past ?? []).slice(-30),
    future: (s.future ?? []).slice(0, 30),
  }),

  addMedia: (meta) => set((s) => ({ media: [...s.media, meta] })),
  updateMedia: (id, patch) => set((s) => ({ media: s.media.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
  relinkMedia: (id) =>
    set((s) => ({ media: s.media.map((m) => (m.id === id ? { ...m, missing: false } : m)) })),
  removeMedia: (id) => {
    get().pushHistory();
    registry.drop(id); // libera o blob e a URL da memória
    set((s) => ({
      media: s.media.filter((m) => m.id !== id),
      clips: s.clips.filter((c) => c.mediaId !== id),
    }));
  },

  addClip: (c) => {
    get().pushHistory();
    set((s) => ({ clips: [...s.clips, c], selectedId: c.id, selectedIds: [c.id] }));
  },
  addClipFromMedia: (mediaId) => {
    const meta = get().media.find((m) => m.id === mediaId);
    if (!meta || meta.missing) return null;
    const s = get();
    const trackId =
      meta.kind === "audio"
        ? (s.tracks.find((t) => t.kind === "audio")?.id ?? "A1")
        : "V1";
    const trackClips = s.clips.filter((c) => c.trackId === trackId);
    const start = trackClips.reduce((acc, c) => Math.max(acc, clipEnd(c)), 0);
    const duration = meta.kind === "image" ? 4.8 : meta.duration;
    const clip = makeClip({
      kind: meta.kind,
      mediaId,
      trackId,
      start,
      duration,
      inPoint: 0,
      outPoint: meta.kind === "image" ? duration : meta.duration,
    });
    get().pushHistory();
    set((st) => ({ clips: [...st.clips, clip], selectedId: clip.id, selectedIds: [clip.id] }));
    return clip;
  },
  dropMediaAt: (mediaId, trackId, start) => {
    const meta = get().media.find((m) => m.id === mediaId);
    if (!meta || meta.missing) return null;
    const s = get();
    const track = s.tracks.find((t) => t.id === trackId);
    if (!track) return null;
    // faixa compatível: vídeo aceita vídeo/imagem, áudio aceita áudio
    const ok =
      (track.kind === "video" && (meta.kind === "video" || meta.kind === "image")) ||
      (track.kind === "audio" && meta.kind === "audio");
    if (!ok) return null;
    const duration = meta.kind === "image" ? 4.8 : meta.duration;
    // NÃO EMPILHA: se o ponto pedido tá ocupado, vai pro espaço livre mais
    // próximo (mesma faixa: antes/depois/entre clipes — nunca em cima de ninguém)
    const want = Math.max(0, start);
    const slot = findFreeSlot(get().clips, trackId, want, duration);
    const clip = makeClip({
      kind: meta.kind,
      mediaId,
      trackId,
      start: slot.start,
      duration,
      inPoint: 0,
      outPoint: meta.kind === "image" ? duration : meta.duration,
    });
    get().pushHistory();
    set((st) => ({ clips: [...st.clips, clip], selectedId: clip.id, selectedIds: [clip.id] }));
    return { clip, redirected: slot.moved || Math.abs(slot.start - want) > 0.01 };
  },
  settleOverlaps: (clipId) => {
    const st = get();
    const moved = st.clips.find((c) => c.id === clipId);
    if (!moved) return 0;
    const ms = moved.start;
    const me = clipEnd(moved);
    const others = st.clips
      .filter((c) => c.trackId === moved.trackId && c.id !== clipId)
      .sort((a, b) => a.start - b.start);
    const starts = new Map<string, number>(others.map((o) => [o.id, o.start]));
    const durs = new Map<string, number>(others.map((o) => [o.id, o.duration]));
    const isHit = (id: string) => {
      const s0 = starts.get(id)!;
      return s0 < me - 0.001 && s0 + durs.get(id)! > ms + 0.001;
    };
    let pushed = 0;
    let prevEnd = -Infinity;
    const shifts = new Map<string, number>();
    for (const o of others) {
      let ns = starts.get(o.id)!;
      if (isHit(o.id)) ns = Math.max(ns, me); // pula pra depois do clipe arrastado
      if (ns < prevEnd - 0.001) ns = prevEnd; // reação em cadeia: encosta no anterior empurrado
      if (Math.abs(ns - starts.get(o.id)!) > 0.001) {
        shifts.set(o.id, ns - starts.get(o.id)!);
        pushed++;
      }
      prevEnd = ns + o.duration;
    }
    if (shifts.size) {
      set((s2) => ({
        clips: s2.clips.map((c) => (shifts.has(c.id) ? { ...c, start: starts.get(c.id)! + shifts.get(c.id)! } : c)),
      }));
    }
    return pushed;
  },
  addTextClip: (at, preset) => {
    const s = get();
    const track = s.tracks.find((t) => t.kind === "text");
    if (!track) return;
    const onTrack = s.clips.filter((c) => c.trackId === track.id);
    const start = onTrack.reduce((acc, c) => Math.max(acc, clipEnd(c)), Math.max(0, at));
    const text = { ...defaultTextProps(), ...(preset ?? {}), content: preset?.content ?? defaultTextProps().content };
    const clip = makeClip({
      kind: "text",
      trackId: track.id,
      start,
      duration: 4,
      inPoint: 0,
      outPoint: 4,
      text,
    });
    get().pushHistory();
    set((st) => ({ clips: [...st.clips, clip], selectedId: clip.id, selectedIds: [clip.id] }));
  },
  updateClip: (id, patch, opts) => {
    if (opts?.history !== false) get().pushHistory();
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },
  moveClipLive: (id, start, trackId) =>
    set((s) => ({ clips: s.clips.map((c) => (c.id === id ? { ...c, start, trackId } : c)) })),
  deleteClip: (id, ripple = false) => {
    const s0 = get();
    const clip = s0.clips.find((c) => c.id === id);
    get().pushHistory();
    set((s) => {
      let clips = s.clips.filter((c) => c.id !== id);
      // "Apagar e fechar espaço": os clipes da frente andam pra trás até encostar
      if (ripple && clip) {
        const dur = clip.duration;
        const trackId = clip.trackId;
        const others = clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
        let cursor = 0; // fim do último clipe já ajeitado
        for (const o of others) {
          if (o.start >= clip.start) {
            const target = Math.max(cursor, o.start - dur);
            if (Math.abs(target - o.start) > 0.001) o.start = target;
          }
          cursor = Math.max(cursor, clipEnd(o));
        }
      }
      const keepSel = s.selectedIds.filter((x) => x !== id);
      return {
        clips,
        selectedId: s.selectedId === id ? (keepSel[0] ?? null) : s.selectedId,
        selectedIds: keepSel,
      };
    });
  },
  deleteSelected: () => {
    const st0 = get();
    const ids = new Set(st0.selectedIds);
    if (!ids.size) return 0;
    st0.pushHistory();
    set((s) => ({
      clips: s.clips.filter((c) => !ids.has(c.id)),
      selectedId: null,
      selectedIds: [],
    }));
    return ids.size;
  },
  closeGapBefore: (id) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip) return;
    const prevEnd = s.clips
      .filter((c) => c.trackId === clip.trackId && c.id !== clip.id && clipEnd(c) <= clip.start + 0.001)
      .reduce((acc, c) => Math.max(acc, clipEnd(c)), 0);
    if (Math.abs(clip.start - prevEnd) < 0.01) return; // já tá encostado
    get().pushHistory();
    set((st) => ({ clips: st.clips.map((c) => (c.id === id ? { ...c, start: prevEnd } : c)) }));
  },
  closeTrackGaps: (trackId) => {
    const s = get();
    const onTrack = s.clips.filter((c) => c.trackId === trackId).sort((a, b) => a.start - b.start);
    if (onTrack.length < 2) return;
    // nada a fazer se a faixa já tá emendada
    let cur = 0;
    let needs = false;
    for (const c of onTrack) {
      if (c.start > cur + 0.01) needs = true;
      cur = Math.max(cur, c.start + c.duration);
    }
    if (!needs) return;
    get().pushHistory();
    set((st) => {
      // dominó: cada clipe encosta no fim do anterior
      let pos = 0;
      const fixed = new Map<string, number>();
      for (const c of onTrack) {
        fixed.set(c.id, pos);
        pos += c.duration;
      }
      return { clips: st.clips.map((c) => (fixed.has(c.id) ? { ...c, start: fixed.get(c.id)! } : c)) };
    });
  },
  extractAudio: async (id) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === id);
    if (!clip || clip.kind !== "video" || !clip.mediaId) return null;
    const audioTrack = s.tracks.find((t) => t.kind === "audio");
    if (!audioTrack) return null;
    // solta na faixa de áudio no primeiro espaço livre que caiba (a partir do início da faixa)
    const onTrack = s.clips.filter((c) => c.trackId === audioTrack.id);
    let place = clip.start;
    const others = [...onTrack].sort((a, b) => a.start - b.start);
    for (const o of others) {
      if (clipEnd(o) <= place) continue;
      if (o.start >= place + clip.duration) break;
      place = clipEnd(o);
    }
    // ---- v5: destaca o áudio como ARQUIVO WAV próprio (mídia de áudio de verdade) ----
    let mediaId = clip.mediaId; // fallback: aponta pro vídeo (comportamento antigo)
    let newMeta: MediaMeta | null = null;
    const blob = registry.getBlob(clip.mediaId);
    if (blob) {
      try {
        const buf = await decodeAudioOf(blob);
        const wav = encodeWav(buf);
        const nid = uid();
        registry.put(nid, wav); // salva no IndexedDB — sobrevive ao F5
        const base = (useProject.getState().media.find((m) => m.id === clip.mediaId)?.name ?? "vídeo").replace(/\.[^.]+$/, "");
        newMeta = {
          id: nid,
          name: `${base} — áudio`,
          kind: "audio",
          duration: buf.duration,
          width: 0,
          height: 0,
          peaks: peaksFromBuffer(buf, 900),
          source: "local",
        };
        mediaId = nid;
      } catch {
        // navegador não decodificou (formato exótico?) — usa o caminho antigo
      }
    }
    const audioClip = makeClip({
      ...clip,
      id: uid(),
      kind: "audio",
      trackId: audioTrack.id,
      start: place,
      mediaId,
      muted: false,
      // herda in/out/speed/volume — o waveform (montanhas) aparece sozinho
    });
    get().pushHistory();
    set((st) => ({
      clips: [
        ...st.clips.map((c) => (c.id === id ? { ...c, muted: true, audioDetached: true } : c)), // original fica mudo (áudio destacado)
        audioClip,
      ],
      media: newMeta ? [...st.media, newMeta] : st.media, // WAV entra na aba Áudio
      selectedId: audioClip.id,
      selectedIds: [audioClip.id],
    }));
    return audioClip;
  },
  applySilenceToMany: (clipIds, fileSpans, mode) => {
    const s = get();
    const targets = s.clips.filter((c) => clipIds.includes(c.id) && (c.kind === "video" || c.kind === "audio"));
    if (!targets.length || !fileSpans.length) return 0;
    get().pushHistory();
    let touched = 0;
    set((st) => {
      let clips = [...st.clips];
      const selIds: string[] = [];
      for (const target of targets) {
        const live = clips.find((c) => c.id === target.id);
        if (!live) continue;
        const ranges = spansToTimeline(fileSpans, live); // tempo do arquivo → tempo deste clipe
        if (!ranges.length) continue;
        // "excluir só áudio": vídeo continua (mutado no trecho), áudio puro é CORTADO fora
        const pieceMode = mode === "delaudio" ? (live.kind === "audio" ? "both" : "audio") : mode;
        const pieces = buildSilencePieces(live, ranges, pieceMode);
        if (!pieces.length) continue;
        clips = [...clips.filter((c) => c.id !== live.id), ...pieces];
        // v7.1: a seleção marca SÓ os trechos sem som (Delete apaga os silêncios,
        // não a faixa inteira como acontecia antes)
        selIds.push(...pieces.filter((p) => p.silenceMark).map((p) => p.id));
        touched++;
      }
      // "excluir só áudio": a vassoura também leva os áudios sem som do projeto inteiro
      if (mode === "delaudio") {
        clips = clips.filter((c) => !(c.kind === "audio" && (c.muted || (c.volume ?? 1) <= 0.001)));
      }
      return {
        clips,
        selectedId: selIds[0] ?? st.selectedId,
        selectedIds: selIds.length ? selIds : st.selectedIds,
      };
    });
    return touched;
  },
  deleteSilentClips: () => {
    const st0 = get();
    // "sem som" = clipe de áudio mutado (pedaço do cortar-silêncio) ou com volume zerado
    const doomed = st0.clips.filter((c) => c.silenceMark || (c.kind === "audio" && (c.muted || (c.volume ?? 1) <= 0.001)));
    if (!doomed.length) return 0;
    const ids = new Set(doomed.map((c) => c.id));
    st0.pushHistory();
    set((s) => ({
      clips: s.clips.filter((c) => !ids.has(c.id)),
      selectedId: s.selectedId && ids.has(s.selectedId) ? null : s.selectedId,
      selectedIds: s.selectedIds.filter((x) => !ids.has(x)),
    }));
    return doomed.length;
  },
  applySilence: (clipId, ranges, mode) => {
    const s = get();
    const clip = s.clips.find((c) => c.id === clipId);
    if (!clip || !ranges.length) return;
    // "excluir só áudio": vídeo continua (mutado no trecho), áudio puro é CORTADO fora
    const pieceMode = mode === "delaudio" ? (clip.kind === "audio" ? "both" : "audio") : mode;
    const pieces = buildSilencePieces(clip, ranges, pieceMode);
    const finalPieces = mode === "delaudio" ? pieces.filter((p) => p.kind !== "audio" || !p.muted) : pieces;
    // v7.1: só os trechos de silêncio ficam selecionados (pra apagar com Delete)
    const selIds = finalPieces.filter((p) => p.silenceMark).map((p) => p.id);
    get().pushHistory();
    set((st) => ({
      clips: [...st.clips.filter((c) => c.id !== clipId), ...finalPieces],
      selectedId: selIds[0] ?? finalPieces[0]?.id ?? null,
      selectedIds: selIds.length ? selIds : finalPieces[0] ? [finalPieces[0].id] : [],
    }));
  },
  duplicateClip: (id) => {
    const c = get().clips.find((x) => x.id === id);
    if (!c) return;
    const s = get();
    const trackClips = s.clips.filter((x) => x.trackId === c.trackId);
    const start = trackClips.reduce((acc, x) => Math.max(acc, clipEnd(x)), 0);
    const copy: Clip = { ...c, id: uid(), start };
    get().pushHistory();
    set((st) => ({ clips: [...st.clips, copy], selectedId: copy.id, selectedIds: [copy.id] }));
  },
  splitAt: (t) => {
    const s = get();
    const hits = s.clips.filter((c) => c.start < t - 0.001 && clipEnd(c) > t + 0.001);
    if (!hits.length) return;
    // se houver seleção, corta só o clipe selecionado; senão corta todos sob o cursor
    const chosen = s.selectedId && hits.some((c) => c.id === s.selectedId) ? hits.filter((c) => c.id === s.selectedId) : hits;
    get().pushHistory();
    set((st) => {
      const clips = [...st.clips];
      const added: Clip[] = [];
      for (const c of chosen) {
        const idx = clips.findIndex((x) => x.id === c.id);
        if (idx < 0) continue;
        const left: Clip = { ...clips[idx], duration: t - clips[idx].start };
        const right: Clip = {
          ...clips[idx],
          id: uid(),
          start: t,
          duration: clipEnd(clips[idx]) - t,
          inPoint: clips[idx].inPoint + (t - clips[idx].start) * clips[idx].speed,
        };
        clips[idx] = left;
        added.push(right);
      }
      return { clips: [...clips, ...added] };
    });
  },
  select: (id) => set({ selectedId: id, selectedIds: id ? [id] : [] }),
  toggleSelect: (id) =>
    set((s) => {
      const has = s.selectedIds.includes(id);
      const ids = has ? s.selectedIds.filter((x) => x !== id) : [...s.selectedIds, id];
      return { selectedIds: ids, selectedId: has ? (ids[0] ?? null) : id };
    }),
  selectAll: () =>
    set((s) => {
      const ids = s.clips.map((c) => c.id);
      return { selectedIds: ids, selectedId: ids[ids.length - 1] ?? null };
    }),
  deselectAll: () => set({ selectedId: null, selectedIds: [] }),
  batchMode: false,
  setBatchMode: (v) => set({ batchMode: v }),
  closeAllGaps: () => {
    const s = get();
    // emenda os clipes de cada faixa (domó), sem mexer em quem já tá colado
    let moved = 0;
    const starts = new Map<string, number>();
    for (const tr of s.tracks) {
      const onTrack = s.clips.filter((c) => c.trackId === tr.id).sort((a, b) => a.start - b.start);
      let pos = 0;
      for (const c of onTrack) {
        if (Math.abs(c.start - pos) > 0.01) {
          starts.set(c.id, pos);
          moved++;
        }
        pos = pos + c.duration; // domino: o próximo encosta no fim deste
      }
    }
    if (!moved) return 0;
    get().pushHistory();
    set((st) => ({
      clips: st.clips.map((c) => (starts.has(c.id) ? { ...c, start: starts.get(c.id)! } : c)),
    }));
    return moved;
  },
  setTransition: (clipId, trans) => {
    get().pushHistory();
    set((s) => ({
      clips: s.clips.map((c) => (c.id === clipId ? { ...c, transitionIn: trans } : c)),
    }));
  },
  copyClip: (id) => {
    const c = get().clips.find((x) => x.id === id);
    if (c) clipboard = { ...c };
  },
  cutClip: (id) => {
    const c = get().clips.find((x) => x.id === id);
    if (!c) return;
    clipboard = { ...c };
    get().deleteClip(id);
  },
  pasteAtPlayhead: () => {
    if (!clipboard) return;
    const t = playheadRef();
    const s = get();
    const track = s.tracks.find((tr) => tr.id === clipboard!.trackId) ? clipboard!.trackId : (s.tracks.find((tr) => tr.kind === "text")?.id ?? "V1");
    const onTrack = s.clips.filter((c) => c.trackId === track);
    const start = Math.max(0, t);
    const copy: Clip = { ...clipboard, id: uid(), start, trackId: track };
    // se colar em cima de outro clipe, empurra pro fim da faixa
    const collides = onTrack.some((c) => copy.start < clipEnd(c) && clipEnd(copy) > c.start);
    if (collides) {
      copy.start = onTrack.reduce((acc, c) => Math.max(acc, clipEnd(c)), 0);
    }
    get().pushHistory();
    set((st) => ({ clips: [...st.clips, copy], selectedId: copy.id, selectedIds: [copy.id] }));
  },
  toggleTrack: (id, field) =>
    set((s) => ({ tracks: s.tracks.map((t) => (t.id === id ? { ...t, [field]: !t[field] } : t)) })),
  addTrack: (kind) => {
    const s = get();
    const count = s.tracks.filter((t) => t.kind === kind).length + 1;
    const label = kind === "video" ? `Vídeo ${count}` : kind === "audio" ? `Áudio ${count}` : `Texto ${count}`;
    const track: Track = { id: `${kind[0].toUpperCase()}${uid().slice(0, 6)}`, kind, name: label, muted: false, hidden: false };
    get().pushHistory();
    set((st) => {
      // insere depois da última faixa do mesmo tipo (mantém agrupamento)
      const i = st.tracks.map((t) => t.kind).lastIndexOf(kind);
      const tracks = [...st.tracks];
      tracks.splice(i >= 0 ? i + 1 : tracks.length, 0, track);
      return { tracks };
    });
  },
  removeTrack: (id) => {
    const s = get();
    const track = s.tracks.find((t) => t.id === id);
    if (!track) return;
    const used = s.clips.some((c) => c.trackId === id);
    if (used) return; // só remove faixa vazia
    if (s.tracks.filter((t) => t.kind === track.kind).length <= 1) return; // última do tipo fica
    get().pushHistory();
    set((st) => ({ tracks: st.tracks.filter((t) => t.id !== id) }));
  },
}));

// ---------- leitura do playhead sem criar ciclo de import (usePlayback é declarado abaixo, ----------
// ---------- mas playheadRef só roda depois da inicialização do módulo) -------------------------
function playheadRef(): number {
  return usePlayback.getState().playhead;
}

// ---------- Playback (estado leve, atualizado a 60fps) ----------
interface PlaybackState {
  playhead: number;
  playing: boolean;
  duration: number;
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setDuration: (d: number) => void;
}

export const usePlayback = create<PlaybackState>((set) => ({
  playhead: 0,
  playing: false,
  duration: 0,
  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (p) => set({ playing: p }),
  setDuration: (d) => set({ duration: d }),
}));

// ---------- helpers ----------
export function computeDuration(clips: Clip[]): number {
  return clips.reduce((acc, c) => Math.max(acc, clipEnd(c)), 0);
}

/**
 * Duração do conteúdo que realmente aparece/faz som — a seta vermelha para
 * quando o que dá pra VER e OUVIR acaba (clipe escondido E mudo não segura).
 */
export function computeEffectiveDuration(clips: Clip[], tracks: Track[]): number {
  let end = 0;
  for (const c of clips) {
    const tr = tracks.find((t) => t.id === c.trackId);
    const visible = !c.videoHidden && !tr?.hidden;
    const audible = !c.muted && !tr?.muted && (c.kind === "video" || c.kind === "audio");
    if (visible || audible) end = Math.max(end, clipEnd(c));
  }
  return end;
}

// ---------- autosave (por edição ativa) ----------
let activeProjectId: string | null = null;

/** Define qual edição da biblioteca recebe o autosave (a home chama ao abrir). */
export function setActiveProject(id: string | null) {
  activeProjectId = id;
}

export function getActiveProjectId() {
  return activeProjectId;
}

/** Garante que clipes/textos antigos ganhem os campos novos (v1 → v2). */
function migrate(data: { project: ProjectMeta; tracks: Track[]; clips: Clip[]; media: MediaMeta[] }) {
  const base = defaultTextProps();
  for (const c of data.clips ?? []) {
    if (c.text) {
      c.text = { ...base, ...c.text };
      if (!c.text.highlightColor) c.text.highlightColor = base.highlightColor;
    }
  }
  return data;
}

export function saveToStorage() {
  const s = useProject.getState();
  if (!activeProjectId) return; // sem edição aberta (home) — não salva nada
  projects.saveProjectSnapshot(activeProjectId, {
    project: s.project,
    tracks: s.tracks,
    clips: s.clips,
    media: s.media.map((m) => ({
      ...m,
      missing: !registry.hasBlob(m.id),
    })),
  });
}

export function loadFromStorage(): { project: ProjectMeta; tracks: Track[]; clips: Clip[]; media: MediaMeta[] } | null {
  if (!activeProjectId) return null;
  const snap = projects.loadProject(activeProjectId);
  if (!snap) return null;
  return migrate(snap);
}
