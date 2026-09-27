// GalaxyCut — processo principal do app de desktop (Electron).
// - serve o editor (build estático) num servidor local
// - salva os vídeos exportados na pasta própria Vídeos/GalaxyCut com nomeação única
// - verifica atualizações nos releases do GitHub e mostra o changelog
// - limpa lixo de versões anteriores (só arquivo nosso, só o que não presta)
"use strict";

const { app, BrowserWindow, ipcMain, shell, dialog, Menu, session } = require("electron");
const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

// v7.1: auto-update de verdade — o app baixa a versão nova sozinho e instala
// sozinho (é só aceitar). Funciona com os releases do GitHub (latest.yml).
let autoUpdater = null;
try {
  autoUpdater = require("electron-updater").autoUpdater;
  autoUpdater.autoDownload = true; // baixa em 2º plano assim que acha
  autoUpdater.autoInstallOnAppQuit = true; // se fechar sem responder, instala na saída
  autoUpdater.setFeedURL({ provider: "github", owner: "lucasgabrieldevgg", repo: "galaxycut" });
} catch (e) {
  log("electron-updater indisponível (dev?):", String(e));
}

const UPDATE_FEED = "https://github.com/lucasgabrieldevgg/galaxycut/releases/latest/download/latest.json";
const GITHUB_RELEASES = "https://github.com/lucasgabrieldevgg/galaxycut";

// ---------- pastas ----------
const userData = app.getPath("userData");
const logDir = path.join(userData, "logs");
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, "main.log");

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(" ")}\n`;
  fs.appendFile(logFile, line, () => undefined);
}

/** Pasta de vídeos própria do GalaxyCut — nunca briga com outros vídeos do usuário. */
function exportDir() {
  const base = path.join(app.getPath("videos"), "GalaxyCut");
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function exportName(ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const ts = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  return `GalaxyCut_${ts}.${ext}`;
}

// ---------- limpeza de lixo de versões anteriores ----------
// Regras CONSERVADORAS: só apaga arquivo que o próprio GalaxyCut deixa pra trás
// (temporários de export interrompida, logs velhos). Nada de tocar em vídeo final
// ou em arquivo que não seja nosso.
async function cleanupOldVersions() {
  const targets = [];

  // temporários soltos na pasta de dados do app (*.tmp / *.part / *.download)
  try {
    for (const f of await fsp.readdir(userData)) {
      if (/\.(tmp|part|download)$/i.test(f)) {
        const full = path.join(userData, f);
        const st = await fsp.stat(full).catch(() => null);
        if (st?.isFile()) targets.push(full);
      }
    }
  } catch {
    /* noop */
  }

  // exportações interrompidas na pasta do GalaxyCut (padrão tmp- nosso) com mais de 24h
  try {
    const dir = exportDir();
    for (const f of await fsp.readdir(dir)) {
      if (/^(tmp-|GalaxyCut_tmp_)/i.test(f) || /\.(part|crdownload)$/i.test(f)) {
        const full = path.join(dir, f);
        const st = await fsp.stat(full).catch(() => null);
        if (st?.isFile() && Date.now() - st.mtimeMs > 24 * 3600 * 1000) targets.push(full);
      }
    }
  } catch {
    /* pasta ainda não existe */
  }

  // logs com mais de 30 dias
  try {
    for (const f of await fsp.readdir(logDir)) {
      if (!f.endsWith(".log")) continue;
      const full = path.join(logDir, f);
      const st = await fsp.stat(full).catch(() => null);
      if (st?.isFile() && Date.now() - st.mtimeMs > 30 * 24 * 3600 * 1000) targets.push(full);
    }
  } catch {
    /* noop */
  }

  let removed = 0;
  for (const t of targets) {
    try {
      await fsp.unlink(t);
      removed++;
      log("limpeza:", path.basename(t));
    } catch {
      /* já foi */
    }
  }
  if (removed) log(`limpeza automática: ${removed} arquivo(s) obsoleto(s) removido(s)`);
  return removed;
}

// ---------- servidor local do editor ----------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};

function startServer(root) {
  const server = http.createServer((req, res) => {
    try {
      let urlPath = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
      if (urlPath.endsWith("/")) urlPath += "index.html";
      const file = path.normalize(path.join(root, urlPath));
      if (!file.startsWith(root)) {
        res.writeHead(403);
        return res.end("forbidden");
      }
      const ext = path.extname(file).toLowerCase();
      const stream = fs.createReadStream(file);
      res.writeHead(200, {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "no-cache",
        // v7.1: cross-origin isolation destrava SharedArrayBuffer → o modelo de
        // IA (Whisper/WASM) usa TODOS os núcleos do PC — legendas bem mais rápidas
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "credentialless",
      });
      stream.pipe(res);
      stream.on("error", () => {
        if (!res.headersSent) res.writeHead(404);
        res.end("not found");
      });
    } catch {
      res.writeHead(500);
      res.end("error");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ---------- atualizações ----------
let APP_VERSION = "0.0.0";

async function fetchJson(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "GalaxyCut-Desktop" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function cmpVersions(a, b) {
  const pa = String(a).split(".").map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

async function checkUpdates() {
  // 1º caminho: electron-updater (baixa e instala sozinho — o fluxo novo)
  if (autoUpdater) {
    try {
      const r = await autoUpdater.checkForUpdates();
      if (r?.updateInfo?.version && cmpVersions(r.updateInfo.version, APP_VERSION) > 0) {
        return {
          hasUpdate: true,
          version: r.updateInfo.version,
          notes: [], // o renderer pega do changelog embutido (traduzido)
          url: GITHUB_RELEASES,
        };
      }
      return { hasUpdate: false };
    } catch (e) {
      log("autoUpdater.checkForUpdates:", String(e));
      // cai pro caminho antigo (latest.json) abaixo
    }
  }
  // 2º caminho (fallback): feed latest.json do release
  const feed = await fetchJson(UPDATE_FEED);
  if (!feed || !feed.version) return { hasUpdate: false };
  const has = cmpVersions(feed.version, APP_VERSION) > 0;
  return {
    hasUpdate: has,
    version: feed.version,
    notes: Array.isArray(feed.notes) ? feed.notes : [],
    url: feed.url || GITHUB_RELEASES,
  };
}

// ---------- eventos do auto-update (baixa sozinho, instala quando o dono aceita) ----------
function wireAutoUpdater() {
  if (!autoUpdater) return;
  autoUpdater.on("checking-for-update", () => log("autoUpdater: verificando…"));
  autoUpdater.on("update-available", (info) => {
    log("autoUpdater: versão nova disponível:", info?.version);
    // o download começa sozinho (autoDownload)
  });
  autoUpdater.on("download-progress", (p) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send("update-progress", {
        pct: Math.max(0, Math.min(1, (p && p.percent) / 100 || 0)),
        transferred: p && p.transferred,
        total: p && p.total,
        bps: p && p.bytesPerSecond,
      });
    }
  });
  autoUpdater.on("update-downloaded", (info) => {
    log("autoUpdater: atualização baixada:", info?.version);
    if (win && !win.isDestroyed()) {
      win.webContents.send("update-ready", { version: info?.version });
    }
  });
  autoUpdater.on("error", (e) => log("autoUpdater erro:", String(e)));
}

// ---------- janela ----------
let win = null;
let APP_URL = "about:blank";

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: "#080b11",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.loadURL(APP_URL);
  win.on("closed", () => (win = null));
}

// ---------- menu pt-BR ----------
function buildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "GalaxyCut",
        submenu: [
          {
            label: "Sobre o GalaxyCut",
            click: () =>
              dialog.showMessageBox(win, {
                type: "info",
                title: "GalaxyCut",
                message: `GalaxyCut v${APP_VERSION}`,
                detail: "Editor de vídeo grátis — web e desktop.\n" + GITHUB_RELEASES,
                buttons: ["OK"],
              }),
          },
          {
            label: "Verificar atualizações",
            click: async () => {
              const u = await checkUpdates();
              if (win && !win.isDestroyed()) win.webContents.send("update-available", u);
            },
          },
          { type: "separator" },
          { label: "Sair", role: "quit" },
        ],
      },
      {
        label: "Ver",
        submenu: [
          { label: "Recarregar", role: "reload" },
          { label: "Tela cheia", role: "togglefullscreen" },
          { type: "separator" },
          { label: "Ferramentas do desenvolvedor", role: "toggleDevTools" },
        ],
      },
      {
        label: "Ajuda",
        submenu: [
          { label: "Página do projeto (GitHub)", click: () => shell.openExternal(GITHUB_RELEASES) },
          { label: "Pasta dos vídeos exportados", click: () => shell.openPath(exportDir()) },
          { label: "Pasta dos projetos (saves)", click: () => shell.openPath(projectsRoot()) },
        ],
      },
    ])
  );
}

// ---------- single instance ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(async () => {
    void cleanupOldVersions(); // não bloqueia a abertura

    const root = path.join(__dirname, "www");
    const server = await startServer(root);
    const port = server.address().port;
    APP_URL = `http://127.0.0.1:${port}/`;

    // versão do app = a do build embutido (version.json servido localmente)
    const vjson = await fetchJson(`${APP_URL}version.json`);
    if (vjson?.version) APP_VERSION = vjson.version;
    log(`GalaxyCut v${APP_VERSION} iniciado (http://127.0.0.1:${port})`);

    // microfone do gravador de voz + permissões mínimas
    try {
      session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
        callback(permission === "media" || permission === "fullscreen" || permission === "pointerLock");
      });
    } catch (e) {
      log("permission handler:", String(e));
    }

    buildMenu();
    createWindow();
    wireAutoUpdater();

    // verificador de atualização: 4s após abrir + a cada 6h
    // (o autoUpdater já BAIXA sozinho; o renderer pergunta se instala)
    const runCheck = async () => {
      const u = await checkUpdates();
      if (u.hasUpdate && win && !win.isDestroyed()) {
        log(`atualização disponível: v${u.version}`);
        win.webContents.send("update-available", u);
      }
    };
    setTimeout(() => void runCheck(), 4000);
    setInterval(() => void runCheck(), 6 * 3600 * 1000);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}

// ---------- IPC ----------
// ---------- pasta de projetos (persistência de verdade no desktop) ----------
// Cada edição ganha uma pasta própria: ~/Documentos/GalaxyCut/Projetos/<nome>__<id>/
//   projeto.json  — o snapshot completo (clipes, faixas, histórico de desfazer)
//   autosave.json — o mesmo, sobrescrito a cada N minutos
//   media/        — os arquivos de vídeo/áudio/imagem da edição
// Se o app fechar na marra (crash), o autosave recupera tudo na próxima abertura.
function projectsRoot() {
  const docs = app.getPath("documents");
  const base = path.join(docs && docs !== "." ? docs : app.getPath("home"), "GalaxyCut", "Projetos");
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function sanitizeDirName(name) {
  const clean = String(name || "edicao").replace(/[^\p{L}\p{N} _-]+/gu, "").replace(/\s+/g, "-").slice(0, 48);
  return clean || "edicao";
}

function projectDir(id, name) {
  // id sanitizado COMPLETO (mesma regra do load/list — sem truncar)
  return path.join(projectsRoot(), `${sanitizeDirName(name)}__${safeProjectId(id)}`);
}

function safeProjectId(id) {
  return String(id).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
}

/** lê o snapshot mais fresco de uma pasta (autosave mais novo que o save manual vence) */
async function readSnapshot(dir) {
  const files = ["projeto.json", "autosave.json"].map((f) => path.join(dir, f));
  let best = null;
  for (const f of files) {
    try {
      const st = await fsp.stat(f);
      const raw = await fsp.readFile(f, "utf8");
      const data = JSON.parse(raw);
      if (!best || st.mtimeMs > best.mtime) best = { data, mtime: st.mtimeMs };
    } catch {
      /* arquivo não existe / inválido */
    }
  }
  return best;
}

ipcMain.handle("project:prepare", async (_ev, id, name) => {
  try {
    const pid = safeProjectId(id);
    const dir = projectDir(pid, name);
    const mediaDir = path.join(dir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    // ids de mídia já salvos em disco (o renderer só manda o que falta)
    const saved = [];
    for (const f of await fsp.readdir(mediaDir)) {
      const m = /^([a-zA-Z0-9-]+)\.[a-z0-9]+$/i.exec(f);
      if (m) saved.push(m[1]);
    }
    return { dir, savedMediaIds: saved };
  } catch (e) {
    log("project:prepare:", String(e));
    throw new Error(String(e));
  }
});

ipcMain.handle("project:save", async (_ev, payload) => {
  try {
    const pid = safeProjectId(payload.id);
    const dir = projectDir(pid, payload.name);
    const mediaDir = path.join(dir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    // mídias novas (o renderer manda só as que faltam)
    for (const m of payload.newMedia ?? []) {
      const ext = String(m.ext || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin";
      await fsp.writeFile(path.join(mediaDir, `${safeProjectId(m.id)}.${ext}`), Buffer.from(m.buffer));
    }
    // snapshot completo (com histórico de desfazer — Ctrl+Z sobrevive ao restart)
    const file = payload.autosave ? path.join(dir, "autosave.json") : path.join(dir, "projeto.json");
    await fsp.writeFile(file, JSON.stringify(payload.snapshot), "utf8");
    log(`projeto salvo (${payload.autosave ? "autosave" : "manual"}):`, path.basename(dir));
    return dir;
  } catch (e) {
    log("project:save:", String(e));
    throw new Error(String(e));
  }
});

ipcMain.handle("project:list", async () => {
  const out = [];
  try {
    for (const entry of await fsp.readdir(projectsRoot(), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const m = /^(.*)__([a-zA-Z0-9-]{1,40})$/.exec(entry.name);
      const snap = await readSnapshot(path.join(projectsRoot(), entry.name));
      if (!m || !snap) continue;
      const s = snap.data || {};
      out.push({
        id: m[2],
        name: (s.project && s.project.name) || m[1],
        savedAt: snap.mtime,
        duration: (s.clips || []).reduce((acc, c) => Math.max(acc, (c.start || 0) + (c.duration || 0)), 0),
        clipCount: (s.clips || []).length,
        hasAutosave: true,
      });
    }
  } catch (e) {
    log("project:list:", String(e));
  }
  return out;
});

ipcMain.handle("project:load", async (_ev, id) => {
  try {
    const pid = safeProjectId(id);
    const root = projectsRoot();
    for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.endsWith(`__${pid}`)) continue;
      const dir = path.join(root, entry.name);
      const snap = await readSnapshot(dir);
      if (!snap) continue;
      const media = [];
      const mediaDir = path.join(dir, "media");
      try {
        for (const f of await fsp.readdir(mediaDir)) {
          const m = /^([a-zA-Z0-9-]+)\.([a-z0-9]+)$/i.exec(f);
          if (!m) continue;
          const buf = await fsp.readFile(path.join(mediaDir, f));
          media.push({ id: m[1], ext: m[2], buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
        }
      } catch {
        /* sem pasta media */
      }
      return { snapshot: snap.data, media };
    }
    return null;
  } catch (e) {
    log("project:load:", String(e));
    return null;
  }
});

ipcMain.handle("project:delete", async (_ev, id) => {
  try {
    const pid = safeProjectId(id);
    const root = projectsRoot();
    for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.endsWith(`__${pid}`)) {
        await fsp.rm(path.join(root, entry.name), { recursive: true, force: true });
        log("projeto apagado do disco:", entry.name);
      }
    }
    return true;
  } catch (e) {
    log("project:delete:", String(e));
    return false;
  }
});

ipcMain.handle("open-projects-folder", () => {
  shell.openPath(projectsRoot());
});

ipcMain.handle("app-info", () => ({
  isDesktop: true,
  appVersion: APP_VERSION,
  platform: process.platform,
}));

ipcMain.handle("save-export", async (_ev, arrayBuffer, ext) => {
  try {
    const safeExt = String(ext || "mp4").replace(/[^a-z0-9]/gi, "").slice(0, 4) || "mp4";
    const file = path.join(exportDir(), exportName(safeExt));
    await fsp.writeFile(file, Buffer.from(arrayBuffer));
    log("exportado:", path.basename(file));
    return file;
  } catch (e) {
    log("erro no export:", String(e));
    throw new Error(String(e));
  }
});

ipcMain.handle("check-updates", () => checkUpdates());

// v7.1: instala a atualização já baixada (reinicia o app sozinho)
ipcMain.handle("update:install", () => {
  if (!autoUpdater) return { ok: false };
  try {
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  } catch (e) {
    log("update:install:", String(e));
    return { ok: false };
  }
});

// força o download (caso o autoDownload não tenha disparado)
ipcMain.handle("update:download", async () => {
  if (!autoUpdater) return { ok: false };
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (e) {
    log("update:download:", String(e));
    return { ok: false };
  }
});

ipcMain.handle("show-in-folder", (_ev, p) => {
  if (typeof p === "string" && p.startsWith(exportDir())) shell.showItemInFolder(p);
});

ipcMain.handle("open-external", (_ev, url) => {
  if (typeof url === "string" && /^https:\/\/(github\.com|galaxycut\.vercel\.app|lucasgabrieldevgg\.github\.io)/.test(url)) shell.openExternal(url);
});
