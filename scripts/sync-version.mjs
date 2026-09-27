// Publica src/lib/editor/changelog.json como public/version.json —
// o "servidor de atualizações" do site (o app compara com a versão embutida).
// Também mantém desktop/package.json em sincronia (o electron-builder nomeia
// os instaladores com a versão DE LÁ — v7: isso já causou release com nome errado).
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await readFile(join(root, "src/lib/editor/changelog.json"), "utf8"));

const out = {
  name: "GalaxyCut",
  version: data.version,
  changelog: data.entries,
  date: new Date().toISOString(),
};

await writeFile(join(root, "public/version.json"), JSON.stringify(out, null, 2) + "\n", "utf8");

// sincroniza a versão do app de desktop (electron-builder)
const desktopPkgPath = join(root, "desktop/package.json");
const desktopPkg = JSON.parse(await readFile(desktopPkgPath, "utf8"));
if (desktopPkg.version !== data.version) {
  desktopPkg.version = data.version;
  await writeFile(desktopPkgPath, JSON.stringify(desktopPkg, null, 2) + "\n", "utf8");
  console.log(`desktop/package.json: ${desktopPkg.version ?? "?"} → ${data.version}`);
}

console.log(`version.json gerado: v${data.version} (${data.entries.length} entradas de changelog)`);
