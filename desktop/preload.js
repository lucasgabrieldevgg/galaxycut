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
});
