// GalaxyCut — versão do app + changelog (fonte única: changelog.json).
// O script scripts/sync-version.mjs publica isto em public/version.json no build.

import raw from "./changelog.json";

export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

export const APP_VERSION: string = raw.version;
export const CHANGELOG: ChangelogEntry[] = raw.entries;

/** Compara versões semânticas: devolve >0 se a > b, <0 se a < b, 0 se iguais. */
export function cmpVersions(a: string, b: string): number {
  const pa = a.split(".").map((x) => parseInt(x, 10) || 0);
  const pb = b.split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
