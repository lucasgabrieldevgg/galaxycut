// GalaxyCut — biblioteca de edições (multi-projeto) no localStorage.
// Cada edição guarda o snapshot completo (projeto/faixas/clipes/mídias);
// os ARQUIVOS em si continuam no IndexedDB (mediaDB), sobrevivem ao F5.
"use client";

import { Clip, MediaMeta, ProjectMeta, Track, uid } from "./types";
import { registry } from "./media";

export interface ProjectCard {
  id: string;
  name: string;
  createdAt: number;
  savedAt: number;
  duration: number;
  clipCount: number;
  thumb?: string; // miniatura da primeira mídia visual
}

export interface ProjectSnapshot {
  project: ProjectMeta;
  tracks: Track[];
  clips: Clip[];
  media: MediaMeta[];
}

const IDX_KEY = "galaxycut_projects_v1";
const OLD_KEY = "galaxiacut_project_v1"; // autosave da v5 (um projeto só)
const pkey = (id: string) => `galaxycut_project_${id}`;

function readIdx(): ProjectCard[] {
  try {
    const raw = localStorage.getItem(IDX_KEY);
    const list = raw ? (JSON.parse(raw) as ProjectCard[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeIdx(list: ProjectCard[]) {
  try {
    localStorage.setItem(IDX_KEY, JSON.stringify(list));
  } catch {
    /* quota — o autosave principal tenta de novo */
  }
}

/** Migra o autosave antigo (um projeto só) pra biblioteca de edições. */
function migrateOld(): ProjectCard[] {
  try {
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { project?: ProjectMeta; tracks?: Track[]; clips?: Clip[]; media?: MediaMeta[] };
    if (!data?.project || (!data.clips?.length && !data.media?.length)) return [];
    const id = uid();
    const card: ProjectCard = {
      id,
      name: data.project.name || "Minha edição",
      createdAt: Date.now(),
      savedAt: Date.now(),
      duration: (data.clips ?? []).reduce((acc, c) => Math.max(acc, c.start + c.duration), 0),
      clipCount: data.clips?.length ?? 0,
      thumb: (data.media ?? []).find((m) => m.thumbnail)?.thumbnail,
    };
    localStorage.setItem(
      pkey(id),
      JSON.stringify({ project: data.project, tracks: data.tracks ?? [], clips: data.clips ?? [], media: data.media ?? [] })
    );
    writeIdx([card]);
    localStorage.removeItem(OLD_KEY);
    return [card];
  } catch {
    return [];
  }
}

export function listProjects(): ProjectCard[] {
  const list = readIdx();
  if (!list.length) return migrateOld();
  return [...list].sort((a, b) => b.savedAt - a.savedAt);
}

export function createProject(name?: string): ProjectCard {
  const siblings = readIdx().length + 1;
  const card: ProjectCard = {
    id: uid(),
    name: name?.trim() || `Edição ${siblings}`,
    createdAt: Date.now(),
    savedAt: Date.now(),
    duration: 0,
    clipCount: 0,
  };
  // snapshot vazio já nasce salvo
  try {
    localStorage.setItem(
      pkey(card.id),
      JSON.stringify({
        project: { name: card.name, width: 1080, height: 1920, fps: 30 },
        tracks: defaultTracks(),
        clips: [],
        media: [],
      })
    );
  } catch {
    /* noop */
  }
  writeIdx([...readIdx(), card]);
  return card;
}

function defaultTracks(): Track[] {
  return [
    { id: "T-texto", kind: "text", name: "Texto", muted: false, hidden: false },
    { id: "V3", kind: "video", name: "Vídeo 3", muted: false, hidden: false },
    { id: "V2", kind: "video", name: "Vídeo 2", muted: false, hidden: false },
    { id: "V1", kind: "video", name: "Vídeo 1 (principal)", muted: false, hidden: false },
    { id: "A3", kind: "audio", name: "Áudio 3", muted: false, hidden: false },
    { id: "A2", kind: "audio", name: "Áudio 2", muted: false, hidden: false },
    { id: "A1", kind: "audio", name: "Áudio 1 (música)", muted: false, hidden: false },
  ];
}

/** Salva o snapshot da edição ativa + atualiza o cartão do índice. */
export function saveProjectSnapshot(id: string, snap: ProjectSnapshot) {
  try {
    localStorage.setItem(pkey(id), JSON.stringify(snap));
    const list = readIdx();
    const i = list.findIndex((c) => c.id === id);
    const card: ProjectCard = {
      id,
      name: snap.project.name,
      createdAt: i >= 0 ? list[i].createdAt : Date.now(),
      savedAt: Date.now(),
      duration: snap.clips.reduce((acc, c) => Math.max(acc, c.start + c.duration), 0),
      clipCount: snap.clips.length,
      thumb: snap.media.find((m) => m.thumbnail)?.thumbnail,
    };
    if (i >= 0) list[i] = card;
    else list.push(card);
    writeIdx(list);
  } catch {
    // quota cheia — mantém o último snapshot bom
  }
}

export function loadProject(id: string): ProjectSnapshot | null {
  try {
    const raw = localStorage.getItem(pkey(id));
    if (!raw) return null;
    const data = JSON.parse(raw) as ProjectSnapshot;
    if (!data?.project) return null;
    return { project: data.project, tracks: data.tracks ?? [], clips: data.clips ?? [], media: data.media ?? [] };
  } catch {
    return null;
  }
}

export function renameProject(id: string, name: string) {
  const list = readIdx();
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) return;
  const clean = name.trim().slice(0, 60) || list[i].name;
  list[i] = { ...list[i], name: clean, savedAt: Date.now() };
  writeIdx(list);
  const snap = loadProject(id);
  if (snap) saveProjectSnapshot(id, { ...snap, project: { ...snap.project, name: clean } });
}

/** Duplica a edição (mídias compartilham os mesmos arquivos do IndexedDB). */
export function duplicateProject(id: string): ProjectCard | null {
  const snap = loadProject(id);
  const src = readIdx().find((c) => c.id === id);
  if (!snap) return null;
  const copy: ProjectCard = {
    id: uid(),
    name: `${src?.name ?? "Edição"} (cópia)`.slice(0, 60),
    createdAt: Date.now(),
    savedAt: Date.now(),
    duration: src?.duration ?? 0,
    clipCount: src?.clipCount ?? 0,
    thumb: src?.thumb,
  };
  try {
    localStorage.setItem(pkey(copy.id), JSON.stringify({ ...snap, project: { ...snap.project, name: copy.name } }));
    writeIdx([...readIdx(), copy]);
    return copy;
  } catch {
    return null;
  }
}

/** Apaga a edição e libera os arquivos que NENHUMA outra edição usa. */
export function deleteProject(id: string) {
  const snap = loadProject(id);
  const others = readIdx().filter((c) => c.id !== id);
  const usedElsewhere = new Set<string>();
  for (const o of others) {
    const s = loadProject(o.id);
    for (const m of s?.media ?? []) usedElsewhere.add(m.id);
  }
  if (snap) {
    for (const m of snap.media) {
      if (!usedElsewhere.has(m.id)) registry.drop(m.id); // libera blob + IndexedDB
    }
  }
  localStorage.removeItem(pkey(id));
  writeIdx(others);
}

/** Apaga TODAS as edições (com os arquivos). */
export function deleteAllProjects() {
  for (const c of readIdx()) {
    const snap = loadProject(c.id);
    if (snap) for (const m of snap.media) registry.drop(m.id);
    localStorage.removeItem(pkey(c.id));
  }
  writeIdx([]);
}
