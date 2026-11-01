// GalaxyCut — casca do app: link compartilhado (#s=) → onboarding (1ª vez) → home ↔ editor.
// Carrega o projeto escolhido (disco > navegador no app) e devolve pra home.
"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useProject, usePlayback, saveToStorage, setActiveProject } from "@/lib/editor/store";
import { rehydrateMedia } from "@/lib/editor/media";
import { engine } from "@/lib/editor/playback";
import * as projects from "@/lib/editor/projects";
import { saveToDisk, loadDiskProject, listDiskProjects } from "@/lib/editor/diskProjects";
import { desktop } from "@/lib/editor/desktop";
import { useSettings } from "@/lib/editor/settings";
import { t as tr, useLang } from "@/lib/editor/i18n";
import { uid } from "@/lib/editor/types";
import { parseShareLink, shareFragmentFromLocation, shareIsDirectVideo, setShareIds, type SharePayload } from "@/lib/editor/share";
import { HomeScreen } from "./HomeScreen";
import { UpdateDialog } from "./UpdateDialog";
import { NewProjectDialog } from "./NewProjectDialog";
import { OnboardingScreen } from "./OnboardingScreen";
import { SharedEditScreen } from "./SharedEditScreen";

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
  // 1ª vez: nasce direto na configuração inicial (sem effect — sem piscar a home)
  const [onboarding, setOnboarding] = useState(() => !useSettings.getState().onboarded);
  // link de edição compartilhada (#s=… no fragmento — ADR-001): a tela de
  // chegada tem prioridade sobre tudo (inclusive o onboarding de 1ª visita)
  const [share, setShare] = useState<"none" | "loading" | "ready" | "invalid">(() =>
    shareFragmentFromLocation() ? "loading" : "none",
  );
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);
  // idioma mudou? os textos estáticos do dynamic loading acompanham…
  const lang = useLang((s) => s.lang);
  // …e o <html lang> acompanha (leitores de tela, tradutores, corretores)
  useEffect(() => {
    document.documentElement.lang = lang === "pt" ? "pt-BR" : lang;
  }, [lang]);

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

  // decodifica o link compartilhado (payload validado na fronteira — share.ts);
  // toda mudança de estado acontece em callback assíncrono (sem render em cascata)
  useEffect(() => {
    if (share !== "loading") return;
    let cancelled = false;
    const frag = shareFragmentFromLocation();
    void parseShareLink(frag ?? "")
      .then((p) => {
        if (cancelled) return;
        setSharePayload(p);
        setShare("ready");
      })
      .catch(() => {
        if (!cancelled) setShare(frag ? "invalid" : "none");
      });
    return () => {
      cancelled = true;
    };
  }, [share]);

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

  // ---- link compartilhado (ADR-001) ----

  function stripShareHash() {
    try {
      if (typeof location !== "undefined" && location.hash) {
        history.replaceState(null, "", location.pathname + location.search);
      }
    } catch {
      /* noop */
    }
  }

  /** importa a edição compartilhada pra biblioteca local e abre no editor.
   * v9.1 — a diferença entre EDITAR e COPIAR ficou de verdade:
   *  - "edit" usa um ID estável derivado do link: abrir o mesmo link de novo
   *    ATUALIZA a mesma edição local (a edição local de quem abriu é afetada),
   *    em vez de criar cópias infinitas;
   *  - "copy" sempre duplica com nome (cópia) — nunca toca numa edição existente.
   * v9.2 — round-trip DE VERDADE: o link carrega sid (id estável do
   * compartilhamento) e oid (id do projeto ORIGINAL de quem compartilhou).
   *  - abrindo na máquina do AUTOR (link de retorno): oid bate com um projeto
   *    local existente → ATUALIZA a edição dele em lugar (as edições de quem
   *    abriu o link AFETAM a edição local de quem compartilhou);
   *  - abrindo na máquina de OUTRA pessoa: cria/reaproveita "shared-{sid}"
   *    (estável), e os sid/oid são herdados — se essa pessoa gerar um link
   *    de volta, o ciclo continua fechando na máquina do autor. */
  function importShared(payload: SharePayload, mode: "edit" | "copy") {
    let id = uid();
    let updatingOriginal = false;

    if (mode === "edit") {
      // 1) link de RETORNO na máquina do autor? atualiza o original em lugar
      if (payload.oid && projects.getSavedAt(payload.oid) != null) {
        id = payload.oid;
        updatingOriginal = true;
      } else if (payload.sid) {
        // 2) id estável do próprio link (reabrir atualiza a mesma cópia local)
        id = `shared-${payload.sid}`;
      } else {
        // link v1 (sem sid): hash estável de nome+data (comportamento 9.1)
        let h = 0;
        const key = `${payload.name}|${payload.made}|${payload.clips.length}`;
        for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
        id = `shared-${(h >>> 0).toString(36)}`;
      }
    }

    const name = mode === "copy" ? `${payload.name} (cópia)`.slice(0, 60) : payload.name.slice(0, 60);
    projects.saveProjectSnapshot(id, {
      project: { ...payload.project, name },
      tracks: payload.tracks,
      clips: payload.clips,
      media: payload.media,
      folders: payload.folders,
    });

    // v9.2: herda sid/oid na cópia local — os links gerados daqui pra frente
    // devolvem o mesmo id (é isso que fecha o ciclo com quem compartilhou)
    if (mode === "edit" && payload.sid) {
      setShareIds(id, { sid: payload.sid, oid: payload.oid ?? null });
    }

    stripShareHash();
    setShare("none");
    // quem chegou por link na 1ª visita considera-se apresentado (o onboarding
    // pode ser revisto em Configurações)
    if (!useSettings.getState().onboarded) useSettings.getState().set({ onboarded: true });
    toast.success(updatingOriginal ? tr("shared.updatedOriginal") : tr("shared.imported"));
    void openProject(id);
  }

  function goHomeFromShare() {
    stripShareHash();
    setShare("none");
    if (!useSettings.getState().onboarded) useSettings.getState().set({ onboarded: true });
  }

  if (share === "loading") {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#080b11]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--gc-accent)]" />
          <p className="text-sm text-zinc-500">{tr("app.openingShare")}</p>
        </div>
      </div>
    );
  }
  const shareDirect = shareIsDirectVideo();
  if (share === "invalid") {
    return <SharedEditScreen payload={null} onImport={importShared} onExit={goHomeFromShare} direct={shareDirect} />;
  }
  if (share === "ready" && sharePayload) {
    return <SharedEditScreen payload={sharePayload} onImport={importShared} onExit={goHomeFromShare} direct={shareDirect} />;
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
