// GalaxyCut — ponte entre o editor (página) e o app de desktop.
// Exposto com segurança via contextBridge (nada de nodeIntegration).
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("galaxyDesktop", {
  isDesktop: true,
  /** v7.3: pergunta ONDE salvar (diálogo nativo) — caminho escolhido ou null */
  askExportPath: (name) => ipcRenderer.invoke("export:askpath", name),
  /** v7.3: grava no caminho escolhido (gravação atômica) */
  saveExportAt: (filePath, arrayBuffer) => ipcRenderer.invoke("export:saveat", filePath, arrayBuffer),
  /** legado: salva o vídeo exportado na pasta própria (Vídeos/GalaxyCut) com nomeação única */
  saveExport: (arrayBuffer, ext) => ipcRenderer.invoke("save-export", arrayBuffer, ext),
  /** pergunta ao processo principal se tem versão nova no GitHub */
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  /** v7.1: baixa a atualização (se ainda não baixou) */
  downloadUpdate: () => ipcRenderer.invoke("update:download"),
  /** v7.1: instala a atualização baixada — o app reinicia sozinho */
  installUpdate: () => ipcRenderer.invoke("update:install"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  showInFolder: (p) => ipcRenderer.invoke("show-in-folder", p),
  /** o main avisa quando achar atualização (boot + a cada 6h) */
  onUpdateAvailable: (cb) => {
    const handler = (_ev, info) => cb(info);
    ipcRenderer.on("update-available", handler);
    return () => ipcRenderer.removeListener("update-available", handler);
  },
  /** progresso do download da atualização (0..1) */
  onUpdateProgress: (cb) => {
    const handler = (_ev, info) => cb(info);
    ipcRenderer.on("update-progress", handler);
    return () => ipcRenderer.removeListener("update-progress", handler);
  },
  /** a atualização terminou de baixar — pode instalar */
  onUpdateReady: (cb) => {
    const handler = (_ev, info) => cb(info);
    ipcRenderer.on("update-ready", handler);
    return () => ipcRenderer.removeListener("update-ready", handler);
  },
  // ---- projetos em disco (pasta dedicada por edição + autosave) ----
  /** cria/retorna a pasta do projeto + ids de mídia já salvos nela */
  projectPrepare: (id, name) => ipcRenderer.invoke("project:prepare", id, name),
  /** grava o snapshot (e as mídias novas) em projeto.json/autosave.json */
  projectSave: (payload) => ipcRenderer.invoke("project:save", payload),
  /** lista as edições salvas em disco (pra recuperar na abertura) */
  projectList: () => ipcRenderer.invoke("project:list"),
  /** lê a edição do disco (snapshot mais fresco + arquivos de mídia) */
  projectLoad: (id) => ipcRenderer.invoke("project:load", id),
  /** apaga a pasta da edição */
  projectDelete: (id) => ipcRenderer.invoke("project:delete", id),
  /** abre a pasta dos projetos no gerenciador de arquivos */
  openProjectsFolder: () => ipcRenderer.invoke("open-projects-folder"),
  // ---- configurações em disco (persistência garantida) ----
  settingsLoad: () => ipcRenderer.invoke("settings:load"),
  settingsSave: (data) => ipcRenderer.invoke("settings:save", data),
});
