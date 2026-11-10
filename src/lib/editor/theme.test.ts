// v9.4.3: todo --gc-accent-N usado no app precisa EXISTIR. A tela inicial e o
// onboarding usavam --gc-accent-6 e a timeline --gc-accent-8 — variáveis que
// nunca foram definidas (o gradiente caía no transparent e a sombra da
// setinha sumia). Este teste varre o fonte inteiro e cobra a paridade.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const SRC_FILES = walk(join(ROOT, "src")).filter((f) => /\.(tsx?|css)$/.test(f));
const CSS_PATH = join(ROOT, "src/app/globals.css");
const THEME_PATH = join(ROOT, "src/lib/editor/theme.ts");

function cssLevels(): number[] {
  const css = readFileSync(CSS_PATH, "utf8");
  return [...css.matchAll(/--gc-accent-(\d+)\s*:/g)].map((m) => Number(m[1]));
}

describe("variáveis de accent (--gc-accent-N)", () => {
  it("todo nível usado no app está definido no globals.css", () => {
    const defined = new Set(cssLevels());
    const used = new Map<number, Set<string>>();
    for (const f of SRC_FILES) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/var\(\s*--gc-accent-(\d+)/g)) {
        const lvl = Number(m[1]);
        if (!used.has(lvl)) used.set(lvl, new Set());
        used.get(lvl)!.add(relative(ROOT, f));
      }
    }
    const missing = [...used.entries()]
      .filter(([lvl]) => !defined.has(lvl))
      .map(([lvl, files]) => `--gc-accent-${lvl} (usado em ${[...files].join(", ")})`);
    expect(missing).toEqual([]);
  });

  it("theme.ts aplica exatamente os níveis definidos no CSS", () => {
    const theme = readFileSync(THEME_PATH, "utf8");
    const m = theme.match(/const LEVELS = \[([^\]]+)\]/);
    expect(m, "LEVELS não encontrado em theme.ts").toBeTruthy();
    const levels = m![1]
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
    expect(levels.slice().sort((a, b) => a - b)).toEqual(cssLevels().sort((a, b) => a - b));
  });
});
