// GaláxiaCut — barra superior (logo redondinha + projeto + proporção + desfazer + exportar)
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Undo2, Redo2, Settings, Settings2, Download, FilePlus2, House, MessageSquareHeart } from "lucide-react";
import { useProject } from "@/lib/editor/store";
import { ASPECTS, ASPECT_CHOICES } from "@/lib/editor/types";
import { exportFormatLabel } from "@/lib/editor/exporter";
import { SettingsDialog } from "./SettingsDialog";
import { FeedbackDialog } from "./FeedbackDialog";
import { BrandLogo } from "./BrandLogo";
import { useT } from "@/lib/editor/i18n";

export function TopBar({
  onExport,
  onExit,
}: {
  onExport: () => void;
  onExit: () => void;
}) {
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
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1c2430] bg-[#07070a] px-3">
      <div className="flex items-center gap-2">
        <BrandLogo size={28} />
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
        className="h-7 w-40 border-transparent bg-transparent px-2 text-sm text-zinc-300 hover:border-[#2a3546] focus-visible:border-[#2a3546] focus-visible:ring-0 sm:w-56 font-medium"
        aria-label={t("tb.projectName")}
        title={t("tb.projectName")}
      />

      <div className="flex items-center gap-1">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-400 disabled:opacity-30"
                onClick={undo}
                disabled={!canUndo}
                aria-label={t("tb.undo")}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">{t("tb.undoTooltip")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-400 disabled:opacity-30"
                onClick={redo}
                disabled={!canRedo}
                aria-label={t("tb.redo")}
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">{t("tb.redoTooltip")}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 border-[#232d3d] bg-[#0c1017] px-2.5 text-xs text-zinc-300 hover:bg-[#141a24]">
            <Settings2 className="h-3 w-3 text-zinc-400" />
            <span>{exportFormatLabel()}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 border-[#232d3d] bg-[#0c1017] p-2 text-zinc-200">
          <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{t("tb.aspectRatio")}</p>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {ASPECT_CHOICES.map((a) => {
              const isSelected = project.width === a.w && project.height === a.h;
              return (
                <button
                  key={a.key}
                  onClick={() => {
                    setProject({ width: a.w, height: a.h });
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs transition ${
                    isSelected ? "bg-[var(--gc-accent)] text-black font-semibold" : "text-zinc-300 hover:bg-[#141a24]"
                  }`}
                >
                  <div className="flex flex-col text-left">
                    <span className="leading-tight font-medium">{a.label}</span>
                    <span className={`text-[10px] leading-tight ${isSelected ? "text-zinc-900 font-normal" : "text-zinc-400"}`}>{a.hint}</span>
                  </div>
                  <span className={`font-mono text-[10px] ${isSelected ? "text-black font-semibold" : "text-zinc-400"}`}>{a.w}×{a.h}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 border-[#232d3d] bg-[#0c1017] px-2.5 text-xs text-zinc-300 hover:bg-[#141a24]"
          onClick={() => setFeedbackOpen(true)}
          title={t("tb.feedback")}
        >
          <MessageSquareHeart className="h-3.5 w-3.5 text-rose-400" />
          <span className="hidden sm:inline">{t("tb.feedback")}</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 border-[#232d3d] bg-[#0c1017] px-2.5 text-xs text-zinc-300 hover:bg-[#141a24]"
          onClick={() => setSettingsOpen(true)}
          title={t("tb.settings")}
        >
          <Settings className="h-3.5 w-3.5 text-zinc-400" />
          <span className="hidden sm:inline">{t("tb.settings")}</span>
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 border-[#232d3d] bg-[#0c1017] px-2.5 text-xs text-zinc-300 hover:bg-[#141a24]"
              title={t("tb.clear")}
            >
              <FilePlus2 className="h-3.5 w-3.5 text-zinc-400" />
              <span className="hidden sm:inline">{t("tb.clear")}</span>
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="border-[#232d3d] bg-[#0c1017] text-zinc-200">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("tb.clearTitle")}</AlertDialogTitle>
              <AlertDialogDescription className="text-zinc-400">
                {t("tb.clearDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-[#232d3d] bg-[#141a24] text-zinc-300 hover:bg-[#1c2430]">
                {t("tb.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={clearProject}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {t("tb.clear")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Button
          size="sm"
          onClick={onExport}
          className="h-7 gap-1.5 bg-[var(--gc-accent)] px-3 text-xs font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
        >
          <Download className="h-3.5 w-3.5" />
          <span>{t("tb.export")}</span>
        </Button>
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
    </header>
  );
}
