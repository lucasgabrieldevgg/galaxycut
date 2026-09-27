// GalaxyCut — casca do app: home (edições) ↔ editor. Decide qual tela mostrar,
// carrega o projeto escolhido (disco > navegador no app) e devolve pra home.
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useProject, usePlayback, saveToStorage, setActiveProject } from "@/lib/editor/store";
import { rehydrateMedia } from "@/lib/editor/media";
import { engine } from "@/lib/editor/playback";
import * as projects from "@/lib/editor/projects";
import { saveToDisk, loadDiskProject, listDiskProjects } from "@/lib/editor/diskProjects";
import { desktop } from "@/lib/editor/desktop";
import { HomeScreen } from "./HomeScreen";
import { UpdateDialog } from "./UpdateDialog";
import { NewProjectDialog } from "./NewProjectDialog";

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
  const [newOpen, setNewOpen] = useState(false);

  // ---- desktop: recupera as edições salvas em DISCO pra dentro da home ----
  useEffect(() => {
    if (!desktop) return;
    void (async () => {
      const disk = await listDiskProjects();
      if (!disk.length) return;
      const local = projects.listProjects();
      let merged = 0;
      for (const d of disk) {
        const cur = local.find((c) => c.id === d.id);
        // edição só no disco (app fechou antes de salvar no navegador?) OU disco mais novo
        if (!cur || d.savedAt > cur.savedAt + 1000) {
          projects.upsertCard({
            id: d.id,
            name: d.name,
            createdAt: cur?.createdAt ?? d.savedAt,
            savedAt: d.savedAt,
            duration: d.duration,
            clipCount: d.clipCount,
          });
          merged++;
        }
      }
      if (merged) {
        toast.success(`${merged} edição(ões) recuperada(s) do disco 💾`, {
          description: "Salvas na pasta GalaxyCut/Projetos — sobrevivem a qualquer fechamento.",
        });
      }
    })();
  }, []);

  async function openProject(id: string) {
    // 1) no app de desktop, o DISCO tem prioridade se for mais fresco (autosave do crash)
    let snap = projects.loadProject(id);
    let fromDiskAt = 0;
    if (desktop) {
      const disk = await loadDiskProject(id);
      if (disk?.project) {
        const localSaved = projects.getSavedAt(id) ?? 0;
        fromDiskAt = (await diskTimestamp(id)) ?? 0;
        if (fromDiskAt >= localSaved - 1000) {
          snap = {
            project: disk.project,
            tracks: disk.tracks ?? [],
            clips: disk.clips ?? [],
            media: disk.media ?? [],
            past: disk.past,
            future: disk.future,
          } as typeof snap;
        }
      }
    }
    if (!snap) {
      toast.error("Essa edição não abriu — pode ter sido apagada em outra janela");
      return;
    }
    setActiveProject(id);
    useProject.getState().loadSnapshot(snap);
    setRoute("editor");
    // recupera os ARQUIVOS (IndexedDB no navegador; disco no app)
    const hydrated = await rehydrateMedia(snap.media);
    useProject.setState({ media: hydrated });
    engine.markDirty();
    const before = snap.media.filter((m) => m.missing).length;
    const after = hydrated.filter((m) => m.missing).length;
    if (fromDiskAt > 0 && after < before) {
      toast.success("Edição restaurada do disco", {
        description: "Arquivos, clipes e até o Ctrl+Z vieram da pasta de saves do app.",
      });
    } else if (after < before) {
      toast.success("Mídias recuperadas do navegador", {
        description: "Os arquivos importados ficam salvos aí — recarregar a página não perde nada.",
      });
    } else if (after > 0) {
      toast.info("Edição restaurada", {
        description: `${after} mídia(s) não estão neste dispositivo — reimporte na aba Mídia.`,
      });
    }
  }

  async function diskTimestamp(id: string): Promise<number | null> {
    const list = await listDiskProjects();
    return list.find((p) => p.id === id)?.savedAt ?? null;
  }

  function newProjectWithFormat(fmt: { w: number; h: number }, title: string) {
    setNewOpen(false);
    const card = projects.createProject(title || undefined, fmt);
    void openProject(card.id);
  }

  function exitToHome() {
    engine.pause();
    usePlayback.getState().setPlaying(false);
    saveToStorage(); // garante o projeto salvo antes de sair
    void saveToDisk(false); // app: grava projeto.json no disco também
    setActiveProject(null);
    setRoute("home");
  }

  return route === "home" ? (
    <>
      <HomeScreen onOpen={(id) => void openProject(id)} onNew={() => setNewOpen(true)} />
      <NewProjectDialog open={newOpen} onOpenChange={setNewOpen} onCreate={newProjectWithFormat} />
    </>
  ) : (
    <>
      <EditorShell onExit={exitToHome} />
      <UpdateDialog />
    </>
  );
}
