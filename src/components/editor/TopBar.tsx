// GaláxiaCut — barra superior (logo redondinha + projeto + exportar)
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Undo2, Redo2, Settings, Settings2, Download, FilePlus2, House, MessageSquareHeart } from "lucide-react";
import { useProject } from "@/lib/editor/store";
import { ASPECTS } from "@/lib/editor/types";
import { exportFormatLabel } from "@/lib/editor/exporter";
import { SettingsDialog } from "./SettingsDialog";
import { FeedbackDialog } from "./FeedbackDialog";
import { BrandLogo } from "./BrandLogo";
import { useT } from "@/lib/editor/i18n";

export function TopBar({ onExport, onExit }: { onExport: () => void; onExit: () => void }) {
  const project = useProject((s) => s.project);
  const setProject = useProject((s) => s.setProject);
  const clearProject = useProject((s) => s.clearProject);
  const undo = useProject((s) => s.undo);
  const redo = useProject((s) => s.redo);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const t = useT();

  // a aba de IA pede pra abrir as configurações (falta de chave etc.)
  useEffect(() => {
    const openSettings = () => setSettingsOpen(true);
    window.addEventListener("galaxiacut:opensettings", openSettings);
    return () => window.removeEventListener("galaxiacut:opensettings", openSettings);
  }, []);

  const currentAspect =
    project.width / project.height > 1.2 ? "16:9" : Math.abs(project.width / project.height - 1) < 0.01 ? "1:1" : "9:16";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1c2430] bg-[#0c1017] px-3">
      <div className="flex items-center gap-2">
        <BrandLogo size={28} />
        <span className="text-[15px] font-bold tracking-tight text-zinc-100">
          Galaxy<span className="text-[var(--gc-accent)]">Cut</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-1 h-7 gap-1 px-2 text-[11px] text-zinc-400 hover:text-zinc-200"
          onClick={onExit}
          title={t("tb.homeHint")}
        >
          <House className="h-3.5 w-3.5" /> {t("tb.home")}
        </Button>
      </div>

      <div className="mx-2 hidden h-5 w-px bg-[#1c2430] sm:block" />
      <Input
        value={project.name}
        onChange={(e) => useProject.setState({ project: { ...project, name: e.target.value } })}
        className="h-7 w-40 border-transparent bg-transparent px-2 text-sm text-zinc-300 hover:border-[#2a3546] focus-visible:border-[#2a3546] focus-visible:ring-0 sm:w-56"
        aria-label={t("tb.projectName")}
      />

      <div className="ml-auto flex items-center gap-1">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={undo} disabled={!canUndo} aria-label={t("tb.undo")}>
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("tb.undo")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={redo} disabled={!canRedo} aria-label={t("tb.redo")}>
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t("tb.redo")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-zinc-400 hover:text-zinc-200">
              <Settings2 className="hidden h-4 w-4 md:block" />
              <span>{t("tb.project")}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 border-[#232d3d] bg-[#121722] text-zinc-200">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-400">{t("tb.screenFormat")}</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {Object.entries(ASPECTS).map(([key, a]) => (
                    <button
                      key={key}
                      onClick={() => setProject({ width: a.w, height: a.h })}
                      className={`rounded-md border px-2 py-2 text-xs transition ${
                        currentAspect === key
                          ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]"
                          : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                      }`}
                    >
                      <span className="block font-semibold">{key}</span>
                      <span className="block text-[9px] opacity-70">{a.w}×{a.h}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-zinc-500">{ASPECTS[currentAspect].label}</p>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-400">{t("tb.fps")}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[30, 60].map((f) => (
                    <button
                      key={f}
                      onClick={() => setProject({ fps: f })}
                      className={`rounded-md border px-2 py-1.5 text-xs transition ${
                        project.fps === f
                          ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)]"
                          : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                      }`}
                    >
                      {f} fps
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-[#2a3546] bg-[#0e1320] p-2.5 text-[10px] leading-relaxed text-zinc-500">
                {t("tb.shortcutsNote")}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full border-[#2a3546] text-red-400 hover:bg-red-500/10 hover:text-red-300">
                    <FilePlus2 className="mr-1.5 h-3.5 w-3.5" /> {t("tb.newProject")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-[#232d3d] bg-[#121722] text-zinc-200">
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("tb.newProjectTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>{t("tb.newProjectHint")}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">{t("misc.cancel")}</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 text-white hover:bg-red-500" onClick={clearProject}>
                      {t("tb.startNew")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </PopoverContent>
        </Popover>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-[var(--gc-accent)]"
          onClick={() => setFeedbackOpen(true)}
          aria-label={t("tb.feedback")}
          title={t("tb.feedbackHint")}
        >
          <MessageSquareHeart className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
          onClick={() => setSettingsOpen(true)}
          aria-label={t("tb.settings")}
          title={t("tb.settings")}
        >
          <Settings className="h-4 w-4" />
        </Button>

        <div className="mx-1 hidden h-5 w-px bg-[#1c2430] sm:block" />
        <Button
          size="sm"
          onClick={onExport}
          className="h-8 gap-1.5 bg-[var(--gc-accent)] font-semibold text-black shadow-[0_0_14px_var(--gc-accent-25)] hover:bg-[var(--gc-accent-hover)]"
        >
          <Download className="h-4 w-4" />
          {t("tb.export")}
          <span className="hidden rounded bg-black/20 px-1 text-[9px] font-bold uppercase lg:inline">{exportFormatLabel()}</span>
        </Button>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </header>
  );
}
