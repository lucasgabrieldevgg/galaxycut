// GalaxyCut — projetos em DISCO (app de desktop). Cada edição tem pasta própria
// com projeto.json + autosave.json + media/. No navegador estas funções são no-op.
// Fluxo: prepare (descobre o que já tá no disco) → save (manda só o que falta).
"use client";

import { useProject, getActiveProjectId } from "./store";
import { registry } from "./media";
import { desktop } from "./desktop";
import type { Clip, MediaFolder, MediaMeta, ProjectMeta, Track } from "./types";

export interface DiskSnapshot {
  project: ProjectMeta;
  tracks: Track[];
  clips: Clip[];
  media: MediaMeta[];
  folders?: MediaFolder[];
  past?: unknown[];
  future?: unknown[];
}

/** mídias já gravadas em disco nesta sessão (por projeto) */
const sessionSaved = new Map<string, Set<string>>();

function extOf(id: string): string {
  const blob = registry.getBlob(id);
  const meta = useProject.getState().media.find((m) => m.id === id);
  if (meta?.name && /\.[a-z0-9]{2,5}$/i.test(meta.name)) return meta.name.split(".").pop()!.toLowerCase();
  const t = blob?.type?.split("/")?.[1]?.split(";")[0];
  return (t && t.replace(/[^a-z0-9]/gi, "")) || "bin";
}

/**
 * Grava o projeto atual no disco (projeto.json ou autosave.json).
 * O snapshot leva o histórico de desfazer (Ctrl+Z sobrevive ao reinício).
 */
export async function saveToDisk(autosave: boolean): Promise<string | null> {
  if (!desktop) return null;
  const id = getActiveProjectId();
  if (!id) return null;
  const s = useProject.getState();
  try {
    // descobre o que já está no disco (só na 1ª gravação da sessão)
    let known = sessionSaved.get(id);
    if (!known) {
      const prep = await desktop.projectPrepare(id, s.project.name);
      known = new Set(prep.savedMediaIds);
      sessionSaved.set(id, known);
    }
    // mídias que existem no registro mas ainda não estão no disco
    const newMedia: { id: string; ext: string; buffer: ArrayBuffer }[] = [];
    for (const m of s.media) {
      if (known.has(m.id) || !registry.hasBlob(m.id)) continue;
      const blob = registry.getBlob(m.id)!;
      newMedia.push({ id: m.id, ext: extOf(m.id), buffer: await blob.arrayBuffer() });
      known.add(m.id);
    }
    const snapshot: DiskSnapshot = {
      project: s.project,
      tracks: s.tracks,
      clips: s.clips,
      media: s.media.map((m) => ({ ...m, missing: !registry.hasBlob(m.id) })),
      folders: s.folders,
      // histórico de desfazer (limitado — arquivo não explode)
      past: s.past.slice(-30),
      future: s.future.slice(0, 30),
    };
    return await desktop.projectSave({ id, name: s.project.name, snapshot, newMedia, autosave });
  } catch {
    // disco cheio / pasta bloqueada: o autosave do navegador continua valendo
    return null;
  }
}

/** Lista as edições salvas em disco (desktop). */
export async function listDiskProjects() {
  if (!desktop) return [];
  try {
    return await desktop.projectList();
  } catch {
    return [];
  }
}

/** Lê a edição do disco e devolve snapshot + mídias já hidratadas no registro. */
export async function loadDiskProject(id: string): Promise<DiskSnapshot | null> {
  if (!desktop) return null;
  try {
    const res = await desktop.projectLoad(id);
    if (!res?.snapshot) return null;
    const snap = res.snapshot as unknown as DiskSnapshot;
    // arquivos de mídia voltam pro registro (e pro IndexedDB do navegador)
    for (const m of res.media ?? []) {
      if (!registry.hasBlob(m.id)) {
        registry.put(m.id, new Blob([m.buffer], { type: "application/octet-stream" }), { persist: false });
      }
    }
    sessionSaved.set(id, new Set((res.media ?? []).map((m) => m.id)));
    return snap;
  } catch {
    return null;
  }
}

/** Apaga a pasta da edição no disco. */
export async function deleteDiskProject(id: string): Promise<void> {
  if (!desktop) return;
  try {
    await desktop.projectDelete(id);
    sessionSaved.delete(id);
  } catch {
    /* noop */
  }
}
