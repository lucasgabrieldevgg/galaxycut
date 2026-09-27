// GalaxyCut — casca do app: home (edições) ↔ editor. Decide qual tela mostrar,
// carrega o projeto escolhido e devolve pra home quando o dono manda.
"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useProject, usePlayback, saveToStorage, setActiveProject } from "@/lib/editor/store";
import { rehydrateMedia } from "@/lib/editor/media";
import { engine } from "@/lib/editor/playback";
import * as projects from "@/lib/editor/projects";
import { HomeScreen } from "./HomeScreen";
import { UpdateDialog } from "./UpdateDialog";

const EditorShell = dynamic(() => import("./EditorShell").then((m) => m.EditorShell), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-[#080b11]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#22C55E] border-t-transparent" />
        <p className="text-sm text-zinc-500">Abrindo o editor…</p>
      </div>
    </div>
  ),
});

export function GalaxyCutApp() {
  const [route, setRoute] = useState<"home" | "editor">("home");

  async function openProject(id: string) {
    const snap = projects.loadProject(id);
    if (!snap) {
      toast.error("Essa edição não abriu — pode ter sido apagada em outra janela");
      return;
    }
    setActiveProject(id);
    useProject.getState().loadSnapshot(snap);
    setRoute("editor");
    // recupera os ARQUIVOS do IndexedDB (sobrevivem ao F5)
    const hydrated = await rehydrateMedia(snap.media);
    useProject.setState({ media: hydrated });
    engine.markDirty();
    const before = snap.media.filter((m) => m.missing).length;
    const after = hydrated.filter((m) => m.missing).length;
    if (after < before) {
      toast.success("Mídias recuperadas do navegador", {
        description: "Os arquivos importados ficam salvos aí — recarregar a página não perde nada.",
      });
    } else if (after > 0) {
      toast.info("Edição restaurada", {
        description: `${after} mídia(s) não estão neste navegador — reimporte na aba Mídia.`,
      });
    }
  }

  function newProject() {
    const card = projects.createProject();
    void openProject(card.id);
  }

  function exitToHome() {
    engine.pause();
    usePlayback.getState().setPlaying(false);
    saveToStorage(); // garante o projeto salvo antes de sair
    setActiveProject(null);
    setRoute("home");
  }

  return route === "home" ? (
    <>
      <HomeScreen onOpen={(id) => void openProject(id)} onNew={newProject} />
    </>
  ) : (
    <>
      <EditorShell onExit={exitToHome} />
      <UpdateDialog />
    </>
  );
}
