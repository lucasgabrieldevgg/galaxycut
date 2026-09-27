// Publica src/lib/editor/changelog.json como public/version.json —
// o "servidor de atualizações" do site (o app compara com a versão embutida).
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
console.log(`version.json gerado: v${data.version} (${data.entries.length} entradas de changelog)`);
