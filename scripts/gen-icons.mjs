// Rasteriza o logo SVG do GalaxyCut nos tamanhos necessários (ícone do app,
// favicon PNG, banner do README). Usa o Chromium do Playwright.
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = await readFile(join(root, "public/logo.svg"), "utf8");

const SHOTS = [
  { w: 192, h: 192, out: "public/icon-192.png" },
  { w: 512, h: 512, out: "public/icon-512.png" },
  { w: 1280, h: 640, out: "docs/banner.png", banner: true },
];

const browser = await chromium.launch();

for (const s of SHOTS) {
  const html = s.banner
    ? `<!doctype html><html><body style="margin:0;background:#080b11">
        <div id="shot" style="width:1280px;height:640px;display:flex;align-items:center;justify-content:center;gap:44px;
          background:
            radial-gradient(700px 420px at 14% -10%, rgba(34,197,94,.16), transparent 60%),
            radial-gradient(820px 480px at 92% 8%, rgba(139,92,246,.20), transparent 60%),
            radial-gradient(700px 480px at 50% 115%, rgba(34,197,94,.10), transparent 65%),
            #080b11;">
          <div style="width:360px;height:360px">${svg}</div>
          <div style="color:#e7ecf3;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
            <div style="font-size:104px;font-weight:800;letter-spacing:-3px;line-height:1">Galaxy<span style="color:#22C55E">Cut</span></div>
            <div style="font-size:30px;color:#98a5b8;margin-top:18px;font-weight:500">editor de vídeo grátis, no navegador</div>
            <div style="margin-top:26px;display:flex;gap:10px">
              <span style="font-size:22px;color:#22C55E;border:1.5px solid rgba(34,197,94,.45);border-radius:999px;padding:6px 18px">timeline estilo CapCut</span>
              <span style="font-size:22px;color:#a78bfa;border:1.5px solid rgba(167,139,250,.45);border-radius:999px;padding:6px 18px">legendas karaokê</span>
              <span style="font-size:22px;color:#38bdf8;border:1.5px solid rgba(56,189,248,.45);border-radius:999px;padding:6px 18px">sem marca d'água</span>
            </div>
          </div>
        </div></body></html>`
    : `<!doctype html><html><body style="margin:0;background:transparent"><div id="shot" style="width:${s.w}px;height:${s.h}px">${svg.replace("<svg ", `<svg width="${s.w}" height="${s.h}" `)}</div></body></html>`;
  const page = await browser.newPage({ viewport: { width: s.banner ? 1280 : s.w, height: s.banner ? 640 : s.h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  const el = page.locator("#shot").first();
  await mkdir(dirname(join(root, s.out)), { recursive: true });
  const buf = await el.screenshot({ type: "png", ...(s.banner ? {} : { omitBackground: true }) });
  await writeFile(join(root, s.out), buf);
  await page.close();
  console.log(`gerado: ${s.out} (${s.w}x${s.h})`);
}
await browser.close();
