// GalaxyCut — ponte entre o editor (página) e o app de desktop.
// Exposto com segurança via contextBridge (nada de nodeIntegration).
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("galaxyDesktop", {
  isDesktop: true,
  /** salva o vídeo exportado na pasta Vídeos/GalaxyCut com nomeação única */
  saveExport: (arrayBuffer, ext) => ipcRenderer.invoke("save-export", arrayBuffer, ext),
  /** pergunta ao processo principal se tem versão nova no GitHub */
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  showInFolder: (p) => ipcRenderer.invoke("show-in-folder", p),
  /** o main avisa quando achar atualização (boot + a cada 6h) */
  onUpdateAvailable: (cb) => {
    const handler = (_ev, info) => cb(info);
    ipcRenderer.on("update-available", handler);
    return () => ipcRenderer.removeListener("update-available", handler);
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
});
