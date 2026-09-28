// GalaxyCut — ponte com o app de desktop (Electron). No navegador é só um stub:
// o mesmo código roda nos dois lugares, mudando só o destino do arquivo exportado.
"use client";

import { downloadBlob } from "./exporter";

export interface DesktopSavedMedia {
  id: string;
  ext: string;
  buffer: ArrayBuffer;
}

export interface DesktopProjectCard {
  id: string;
  name: string;
  savedAt: number;
  duration: number;
  clipCount: number;
}

export interface DesktopProjectSave {
  id: string;
  name: string;
  snapshot: unknown;
  newMedia: { id: string; ext: string; buffer: ArrayBuffer }[];
  autosave?: boolean;
}

export interface DesktopApi {
  isDesktop: true;
  appVersion: string;
  platform: string;
  /** v7.3: pergunta ONDE salvar (diálogo nativo) — devolve caminho ou null se cancelou */
  askExportPath?(name: string): Promise<string | null>;
  /** v7.3: grava o arquivo no caminho escolhido (gravação atômica) */
  saveExportAt?(path: string, buffer: ArrayBuffer): Promise<string>;
  /** salva o vídeo exportado na pasta própria (Vídeos/GalaxyCut) e devolve o caminho */
  saveExport(buf: ArrayBuffer, ext: string): Promise<string>;
  checkUpdates(): Promise<{ hasUpdate: boolean; version?: string; notes?: string[]; url?: string }>;
  /** v7.1: baixa a atualização (se ainda não baixou) */
  downloadUpdate(): Promise<{ ok: boolean }>;
  /** v7.1: instala a atualização baixada — o app reinicia sozinho */
  installUpdate(): Promise<{ ok: boolean }>;
  openExternal(url: string): void;
  showInFolder(path: string): void;
  onUpdateAvailable(cb: (info: { version: string; notes: string[]; url: string }) => void): void;
  /** progresso do download da atualização (0..1 + bytes) */
  onUpdateProgress?(cb: (info: { pct: number; transferred?: number; total?: number; bps?: number }) => void): () => void;
  /** a atualização terminou de baixar — pode instalar */
  onUpdateReady?(cb: (info: { version?: string }) => void): () => void;
  // ---- projetos em disco ----
  projectPrepare(id: string, name: string): Promise<{ dir: string; savedMediaIds: string[] }>;
  projectSave(payload: DesktopProjectSave): Promise<string>;
  projectList(): Promise<DesktopProjectCard[]>;
  projectLoad(id: string): Promise<{ snapshot: Record<string, unknown>; media: DesktopSavedMedia[] } | null>;
  projectDelete(id: string): Promise<boolean>;
  openProjectsFolder(): void;
  // ---- configurações em disco ----
  settingsLoad?(): Promise<Record<string, unknown> | null>;
  settingsSave?(data: unknown): Promise<boolean>;
}

export const desktop: DesktopApi | undefined =
  typeof window !== "undefined" ? ((window as Window & { galaxyDesktop?: DesktopApi }).galaxyDesktop ?? undefined) : undefined;

export function isDesktopBuild(): boolean {
  return !!desktop;
}

/**
 * Pergunta ANTES de exportar onde o arquivo vai ser salvo (app de desktop).
 * Devolve { dest: "desktop", path } com o caminho escolhido, { dest: "desktop",
 * canceled: true } se a pessoa fechou o diálogo, ou { dest: "web" } no navegador.
 * Perguntar antes evita renderizar um vídeo inteiro à toa.
 */
export async function askExportDestination(filename: string): Promise<
  { dest: "desktop"; path: string } | { dest: "desktop"; canceled: true } | { dest: "web" }
> {
  if (!desktop) return { dest: "web" };
  if (desktop.askExportPath) {
    const path = await desktop.askExportPath(filename);
    if (!path) return { dest: "desktop", canceled: true };
    return { dest: "desktop", path };
  }
  // app antigo (pré-v7.3): sem diálogo — cai no destino padrão
  return { dest: "desktop", path: "" };
}

/**
 * Entrega o vídeo exportado: no desktop grava no caminho escolhido no início
 * (ou na pasta própria, num app antigo); no navegador baixa como sempre.
 * Devolve o caminho salvo (desktop) ou null (navegador).
 */
export async function deliverExport(blob: Blob, filename: string, chosenPath?: string): Promise<string | null> {
  if (desktop) {
    if (chosenPath && desktop.saveExportAt) {
      const saved = await desktop.saveExportAt(chosenPath, await blob.arrayBuffer());
      desktop.showInFolder(saved);
      return saved;
    }
    const ext = filename.split(".").pop() ?? "mp4";
    const path = await desktop.saveExport(await blob.arrayBuffer(), ext);
    desktop.showInFolder(path);
    return path;
  }
  downloadBlob(blob, filename);
  return null;
}
