// GalaxyCut — verificador rápido de atualização (web e desktop).
// Web: compara a versão embutida com o version.json publicado no site.
// Desktop: pergunta pro processo principal (que checa os releases do GitHub).
"use client";

import { APP_VERSION, CHANGELOG, ChangelogEntry, cmpVersions, notesForEntry } from "./version";
import { desktop } from "./desktop";
import { useLang } from "./i18n";

export interface UpdateInfo {
  version: string;
  notes: string[]; // changelog da versão nova
  url?: string; // página de download (desktop)
}

const SKIP_KEY = "galaxycut_skip_version";

export function skipVersion(v: string) {
  try {
    localStorage.setItem(SKIP_KEY, v);
  } catch {
    /* noop */
  }
}

function skipped(v: string): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === v;
  } catch {
    return false;
  }
}

function notesFor(version: string, fallback?: string[]): string[] {
  const lang = useLang.getState().lang;
  const entry: ChangelogEntry | undefined = CHANGELOG.find((c) => c.version === version);
  const fromChangelog = notesForEntry(entry, lang);
  if (fromChangelog.length) return fromChangelog;
  if (fallback?.length) {
    // as notas do main vêm em inglês (corpo do release) — traduz se tiver
    if (entry && lang !== "en") return fromChangelog;
    return fallback;
  }
  return [`GalaxyCut ${version}`];
}

/** Devolve a atualização disponível, ou null se você já tá na última. */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  // 1) app de desktop: o processo principal consulta os releases do GitHub
  if (desktop) {
    try {
      const r = await desktop.checkUpdates();
      if (r?.hasUpdate && r.version && cmpVersions(r.version, APP_VERSION) > 0) {
        return { version: r.version, notes: notesFor(r.version, r.notes), url: r.url };
      }
      return null;
    } catch {
      return null;
    }
  }
  // 2) web: version.json do próprio site (cache-busted)
  try {
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const r = await fetch(`${base}/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return null;
    const data = (await r.json()) as { version?: string; changelog?: ChangelogEntry[] };
    if (!data.version || cmpVersions(data.version, APP_VERSION) <= 0) return null;
    if (skipped(data.version)) return null;
    const entry = data.changelog?.find((c) => c.version === data.version);
    return { version: data.version, notes: entry?.items ?? notesFor(data.version) };
  } catch {
    return null;
  }
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Checa no boot e a cada 30 minutos (o dono pode desligar nas configurações). */
export function startAutoCheck(enabled: boolean, onFound: (u: UpdateInfo) => void) {
  if (timer) clearInterval(timer);
  if (!enabled) return;
  const go = () => {
    void checkForUpdate().then((u) => {
      if (u) onFound(u);
    });
  };
  timer = setInterval(go, 30 * 60 * 1000);
  setTimeout(go, 2500);
}
