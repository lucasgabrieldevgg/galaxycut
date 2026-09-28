// GalaxyCut — casca do app: onboarding (1ª vez) → home (edições) ↔ editor.
// Carrega o projeto escolhido (disco > navegador no app) e devolve pra home.
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
import { useSettings } from "@/lib/editor/settings";
import { t as tr, useLang } from "@/lib/editor/i18n";
import { HomeScreen } from "./HomeScreen";
import { UpdateDialog } from "./UpdateDialog";
import { NewProjectDialog } from "./NewProjectDialog";
import { OnboardingScreen } from "./OnboardingScreen";

const EditorShell = dynamic(() => import("./EditorShell").then((m) => m.EditorShell), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-[#080b11]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--gc-accent)] border-t-transparent" />
        <p className="text-sm text-zinc-500">Abrindo o editor…</p>
      </div>
    </div>
  ),
});

export function GalaxyCutApp() {
  const [route, setRoute] = useState<"home" | "editor">("home");
  const [newOpen, setNewOpen] = useState(false);
  const onboarded = useSettings((s) => s.onboarded);
  // 1ª vez: nasce direto na configuração inicial (sem effect — sem piscar a home)
  const [onboarding, setOnboarding] = useState(() => !useSettings.getState().onboarded);
  // idioma mudou? os textos estáticos do dynamic loading acompanham
  useLang((s) => s.lang);

  // "ver de novo" nas configurações: reabre a configuração inicial
  useEffect(() => {
    const reopen = () => setOnboarding(true);
    window.addEventListener("galaxycut:onboarding", reopen);
    return () => window.removeEventListener("galaxycut:onboarding", reopen);
  }, []);

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
        toast.success(tr("app.recovered", { n: merged }), { description: tr("app.recoveredDesc") });
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
            folders: disk.folders ?? [],
            past: disk.past,
            future: disk.future,
          } as typeof snap;
        }
      }
    }
    if (!snap) {
      toast.error(tr("app.openFail"));
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
      toast.success(tr("app.diskRestored"), { description: tr("app.diskRestoredDesc") });
    } else if (after < before) {
      toast.success(tr("app.mediaRestored"), { description: tr("app.mediaRestoredDesc") });
    } else if (after > 0) {
      toast.info(tr("app.mediaMissingToast"), { description: tr("app.mediaMissingToastDesc", { n: after }) });
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

  if (onboarding) return <OnboardingScreen onDone={() => setOnboarding(false)} />;

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
