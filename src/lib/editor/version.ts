// GalaxyCut — versão do app + changelog (fonte única: changelog.json).
// O script scripts/sync-version.mjs publica isto em public/version.json no build.

import raw from "./changelog.json";

export interface ChangelogEntry {
  version: string;
  date: string;
  /** inglês — é o texto das releases no GitHub */
  items: string[];
  /** traduções pro app (o idioma do usuário ganha, fallback = items) */
  items_pt?: string[];
  items_es?: string[];
}

export const APP_VERSION: string = raw.version;
export const CHANGELOG: ChangelogEntry[] = raw.entries;

/** Notas de uma versão NO IDIOMA DO APP (EN padrão; pt/es quando tem tradução). */
export function notesForEntry(entry: ChangelogEntry | undefined, lang: string): string[] {
  if (!entry) return [];
  if (lang === "pt" && entry.items_pt?.length) return entry.items_pt;
  if (lang === "es" && entry.items_es?.length) return entry.items_es;
  return entry.items;
}

/** Compara versões semânticas: devolve >0 se a > b, <0 se a < b, 0 se iguais. */
export function cmpVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
