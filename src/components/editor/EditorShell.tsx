// GalaxyCut — casca do editor: layout, atalhos (editáveis!), autosave, mídia persistente
"use client";

import { useEffect, useRef, useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { useProject, usePlayback, saveToStorage } from "@/lib/editor/store";
import { engine } from "@/lib/editor/playback";
import { actionForEvent } from "@/lib/editor/shortcuts";
import { useSubtitleJob } from "@/lib/editor/subtitles";
import { useSettings } from "@/lib/editor/settings";
import { saveToDisk } from "@/lib/editor/diskProjects";
import { isDesktopBuild } from "@/lib/editor/desktop";
import { toast } from "sonner";
import { useT, t as tr } from "@/lib/editor/i18n";
import { Loader2, Maximize2 } from "lucide-react";
import { TopBar } from "./TopBar";
import { MediaPanel } from "./MediaPanel";
import { PreviewStage } from "./PreviewStage";
import { Inspector } from "./Inspector";
import { Timeline } from "./Timeline";
import { ExportDialog } from "./ExportDialog";

export function EditorShell({ onExit }: { onExit: () => void }) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const isMobile = useIsMobile();
  // o projeto (e as mídias do IndexedDB) já foi carregado pela home antes de chegar aqui

  // autosave com debounce (navegador/IndexedDB)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const unsub = useProject.subscribe(() => {
      clearTimeout(timer);
      timer = setTimeout(saveToStorage, 800);
    });
    return () => {
      unsub();
      clearTimeout(timer);
      saveToStorage();
    };
  }, []);

  // autosave em DISCO (app de desktop): a cada N minutos (Configurações → Geral)
  // + na saída/beforeunload — sobrevive a crash, energia caindo, o que for.
  const autosaveMin = useSettings((s) => s.autosaveMin);
  useEffect(() => {
    if (!isDesktopBuild() || !autosaveMin) return;
    const iv = setInterval(() => {
      void saveToDisk(true);
    }, autosaveMin * 60_000);
    const onUnload = () => {
      void saveToDisk(true);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearInterval(iv);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [autosaveMin]);

  // abrir diálogo de exportação por evento
  useEffect(() => {
    const openExport = () => setExportOpen(true);
    window.addEventListener("galaxiacut:openexport", openExport);
    return () => window.removeEventListener("galaxiacut:openexport", openExport);
  }, []);

  // atalhos de teclado — EDITÁVEIS nas Configurações → Atalhos
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const action = actionForEvent(e);
      if (!action) return;
      const st = useProject.getState();
      const pb = usePlayback.getState();
      e.preventDefault();
      switch (action) {
        case "undo":
          if (e.shiftKey) st.redo();
          else st.undo();
          break;
        case "redo":
          st.redo();
          break;
        case "copy":
          if (st.selectedId) {
            st.copyClip(st.selectedId);
            toast.success(t("ed.copied"));
          }
          break;
        case "cut":
          if (st.selectedId) {
            st.cutClip(st.selectedId);
            toast.success(t("ed.cut"));
          }
          break;
        case "paste":
          st.pasteAtPlayhead();
          break;
        case "duplicate":
          if (st.selectedId) st.duplicateClip(st.selectedId);
          break;
        case "save":
          saveToStorage();
          toast.success(t("ed.saved"));
          break;
        case "export":
          setExportOpen(true);
          break;
        case "playPause":
          engine.toggle();
          break;
        case "split":
          st.splitAt(pb.playhead);
          engine.markDirty();
          break;
        case "mute": {
          const c = st.clips.find((x) => x.id === st.selectedId);
          if (c && (c.kind === "video" || c.kind === "audio")) st.updateClip(c.id, { muted: !c.muted });
          break;
        }
        case "delete":
          if (st.selectedIds.length) {
            const n = st.deleteSelected();
            if (n > 1) toast.info(t("ed.deletedN", { n }));
          } else {
            // sem clipe selecionado → apaga a MÍDIA selecionada no painel
            window.dispatchEvent(new CustomEvent("galaxiacut:delmedia"));
          }
          break;
        case "deleteClose":
          if (st.selectedId) {
            st.deleteClip(st.selectedId, true);
            engine.markDirty();
            toast.info(t("ed.deletedAndClosed"));
          }
          break;
        case "closeGap":
          if (st.selectedId) {
            st.closeGapBefore(st.selectedId);
            engine.markDirty();
            toast.success(t("ed.gapClosed"));
          }
          break;
        case "closeAllGaps": {
          const moved = st.closeAllGaps();
          engine.markDirty();
          if (moved > 0) toast.success(t("ed.allGapsClosed", { n: moved }));
          break;
        }
        case "broom": {
          const n = st.deleteSilentClips();
          engine.markDirty();
          if (n > 0) toast.success(t("tl.broomDone", { n }));
          break;
        }
        case "snapToggle": {
          const nextSnap = !useSettings.getState().snapEnabled;
          useSettings.getState().set({ snapEnabled: nextSnap });
          toast.info(nextSnap ? t("ed.snapOn") : t("ed.snapOff"));
          break;
        }
        case "silence":
          window.dispatchEvent(new CustomEvent("galaxiacut:opensilence"));
          break;
        case "settings":
          window.dispatchEvent(new CustomEvent("galaxiacut:opensettings"));
          break;
        case "selectAll":
          if (st.clips.length) {
            st.selectAll();
            toast.info(t("ed.allSelected", { n: st.clips.length }));
          }
          break;
        case "deselect":
          st.deselectAll();
          break;
        case "frameBack":
          engine.nudgeFrames(e.shiftKey ? -10 : -1);
          break;
        case "frameFwd":
          engine.nudgeFrames(e.shiftKey ? 10 : 1);
          break;
        case "goHome":
          engine.seek(0);
          break;
        case "goEnd":
          engine.seek(pb.duration);
          break;
        case "escape":
          if (st.batchMode) st.setBatchMode(false);
          st.deselectAll();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t]);

  // garante que as fontes bonitas (Anton, Bangers…) carregaram antes de desenhar no canvas
  useEffect(() => {
    const fonts = ["700 40px Anton", "400 40px Bangers", "400 40px 'Luckiest Guy'", "400 40px 'Bebas Neue'"];
    const f = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (!f) return;
    Promise.all(fonts.map((x) => f.load(x).catch(() => undefined))).then(() => engine.markDirty());
  }, []);

  const editor = isMobile ? (
    <MobileLayout canvasRef={canvasRef} onExport={() => setExportOpen(true)} />
  ) : (
    <div className="flex h-[calc(100vh-3rem)] min-h-0 flex-col">
      <ResizablePanelGroup direction="vertical" className="min-h-0">
        <ResizablePanel defaultSize={58} minSize={38}>
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={21} minSize={15} maxSize={34} className="min-h-0">
              <MediaPanel />
            </ResizablePanel>
            <ResizableHandle className="bg-[#1c2430]" />
            <ResizablePanel defaultSize={51} minSize={30} className="min-h-0">
              <PreviewStage canvasRef={canvasRef} />
            </ResizablePanel>
            <ResizableHandle className="bg-[#1c2430]" />
            <ResizablePanel defaultSize={28} minSize={18} maxSize={40} className="min-h-0">
              <Inspector />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
        <ResizableHandle className="bg-[#1c2430]" />
        <ResizablePanel defaultSize={42} minSize={18} className="min-h-0">
          <Timeline />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#080b11] text-zinc-200">
      <TopBar onExport={() => setExportOpen(true)} onExit={onExit} />
      <main className="min-h-0 flex-1">{editor}</main>
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
      <SubtitleMiniBar />
    </div>
  );
}

/** Barrinha flutuante: legendas sendo geradas em 2º plano (mostra a %). */
function SubtitleMiniBar() {
  const job = useSubtitleJob();
  if (!job.running || !job.minimized) return null;
  const pct = Math.round(job.pct * 100);
  return (
    <button
      onClick={() => {
        job.setMinimized(false);
        job.setOpen(true);
      }}
      className="fixed left-1/2 top-14 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border[var(--gc-accent-40)] bg-[#121722]/95 px-4 py-1.5 shadow-[0_0_18px_var(--gc-accent-25)] backdrop-blur transition hover:border-[var(--gc-accent)]"
      title={tr("sub.miniOpen")}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--gc-accent)]" />
      <span className="text-[11px] font-medium text-zinc-200">{tr("sub.minimized", { pct })}</span>
      <span className="h-1.5 w-24 overflow-hidden rounded-full bg-[#1c2430]">
        <span className="block h-full rounded-full bg-[var(--gc-accent)] transition-all" style={{ width: `${pct}%` }} />
      </span>
      <Maximize2 className="h-3 w-3 text-zinc-500" />
    </button>
  );
}

// ---------- layout mobile (empilhado) ----------
function MobileLayout({ canvasRef, onExport }: { canvasRef: React.RefObject<HTMLCanvasElement | null>; onExport: () => void }) {
  const t = useT();
  const [panel, setPanel] = useState<"none" | "media" | "inspector">("none");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-b border-[#1c2430] bg-[#10151d] px-2">
        <button
          onClick={() => setPanel((p) => (p === "media" ? "none" : "media"))}
          className={`rounded-md px-2.5 py-1 text-[11px] ${panel === "media" ? "bg[var(--gc-accent-15)] text-[var(--gc-accent)]" : "text-zinc-400"}`}
        >
          Mídia
        </button>
        <button
          onClick={() => setPanel((p) => (p === "inspector" ? "none" : "inspector"))}
          className={`rounded-md px-2.5 py-1 text-[11px] ${panel === "inspector" ? "bg[var(--gc-accent-15)] text-[var(--gc-accent)]" : "text-zinc-400"}`}
        >
          Propriedades
        </button>
        <span className="ml-auto text-[10px] text-zinc-600">{t("ed.mobile")}</span>
      </div>
      {panel !== "none" ? (
        <div className="min-h-0 flex-1">
          {panel === "media" ? <MediaPanel /> : <Inspector />}
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-[4]">
            <PreviewStage canvasRef={canvasRef} />
          </div>
          <div className="min-h-0 flex-[3] border-t border-[#1c2430]">
            <Timeline />
          </div>
        </>
      )}
      <button
        onClick={onExport}
        className="h-9 w-full shrink-0 bg-[var(--gc-accent)] text-sm font-bold text-black md:hidden"
      >
        {t("ed.export")}
      </button>
    </div>
  );
}
