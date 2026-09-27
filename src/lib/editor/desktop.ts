// GalaxyCut — ponte com o app de desktop (Electron). No navegador é só um stub:
// o mesmo código roda nos dois lugares, mudando só o destino do arquivo exportado.
"use client";

import { downloadBlob } from "./exporter";

export interface DesktopApi {
  isDesktop: true;
  appVersion: string;
  platform: string;
  /** salva o vídeo exportado na pasta própria (Vídeos/GalaxyCut) e devolve o caminho */
  saveExport(buf: ArrayBuffer, ext: string): Promise<string>;
  checkUpdates(): Promise<{ hasUpdate: boolean; version?: string; notes?: string[]; url?: string }>;
  openExternal(url: string): void;
  showInFolder(path: string): void;
  onUpdateAvailable(cb: (info: { version: string; notes: string[]; url: string }) => void): void;
}

export const desktop: DesktopApi | undefined =
  typeof window !== "undefined" ? ((window as Window & { galaxyDesktop?: DesktopApi }).galaxyDesktop ?? undefined) : undefined;

export function isDesktopBuild(): boolean {
  return !!desktop;
}

/**
 * Entrega o vídeo exportado: no desktop salva na pasta própria com nomeação
 * única (GalaxyCut_…); no navegador baixa como sempre. Devolve o caminho salvo
 * (desktop) ou null (navegador).
 */
export async function deliverExport(blob: Blob, filename: string): Promise<string | null> {
  if (desktop) {
    const ext = filename.split(".").pop() ?? "mp4";
    const path = await desktop.saveExport(await blob.arrayBuffer(), ext);
    desktop.showInFolder(path);
    return path;
  }
  downloadBlob(blob, filename);
  return null;
}
