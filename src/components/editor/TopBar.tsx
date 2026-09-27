// GaláxiaCut — barra superior
"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Zap, Undo2, Redo2, Settings, Settings2, Download, FilePlus2, House } from "lucide-react";
import { useProject } from "@/lib/editor/store";
import { ASPECTS } from "@/lib/editor/types";
import { exportFormatLabel } from "@/lib/editor/exporter";
import { SettingsDialog } from "./SettingsDialog";

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
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#22C55E] to-[#15803D] shadow-[0_0_12px_rgba(34,197,94,0.35)]">
          <Zap className="h-4 w-4 text-black" strokeWidth={2.5} />
        </div>
        <span className="text-[15px] font-bold tracking-tight text-zinc-100">
          Galaxy<span className="text-[#22C55E]">Cut</span>
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-1 h-7 gap-1 px-2 text-[11px] text-zinc-400 hover:text-zinc-200"
          onClick={onExit}
          title="Voltar pra home (suas edições) — o projeto salva sozinho"
        >
          <House className="h-3.5 w-3.5" /> Início
        </Button>
      </div>

      <div className="mx-2 hidden h-5 w-px bg-[#1c2430] sm:block" />
      <Input
        value={project.name}
        onChange={(e) => useProject.setState({ project: { ...project, name: e.target.value } })}
        className="h-7 w-40 border-transparent bg-transparent px-2 text-sm text-zinc-300 hover:border-[#2a3546] focus-visible:border-[#2a3546] focus-visible:ring-0 sm:w-56"
        aria-label="Nome do projeto"
      />

      <div className="ml-auto flex items-center gap-1">
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={undo} disabled={!canUndo} aria-label="Desfazer">
                <Undo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Desfazer (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400" onClick={redo} disabled={!canRedo} aria-label="Refazer">
                <Redo2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refazer (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-zinc-400 hover:text-zinc-200">
              <Settings2 className="hidden h-4 w-4 md:block" />
              <span className="hidden md:inline">Projeto</span>
              <span className="md:hidden">Projeto</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 border-[#232d3d] bg-[#121722] text-zinc-200">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-medium text-zinc-400">Formato da tela</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {Object.entries(ASPECTS).map(([key, a]) => (
                    <button
                      key={key}
                      onClick={() => setProject({ width: a.w, height: a.h })}
                      className={`rounded-md border px-2 py-2 text-xs transition ${
                        currentAspect === key
                          ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]"
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
                <p className="mb-2 text-xs font-medium text-zinc-400">Taxa de quadros</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {[30, 60].map((f) => (
                    <button
                      key={f}
                      onClick={() => setProject({ fps: f })}
                      className={`rounded-md border px-2 py-1.5 text-xs transition ${
                        project.fps === f
                          ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]"
                          : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                      }`}
                    >
                      {f} fps
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-md border border-[#2a3546] bg-[#0e1320] p-2.5 text-[10px] leading-relaxed text-zinc-500">
                <b className="text-zinc-400">Atalhos:</b> Espaço = tocar/pausar · S = cortar no cursor · Ctrl+A =
                selecionar tudo · Del = apagar · Ctrl+Z = desfazer · ← → = frame a frame · botão direito = menu do
                clipe — e dá pra TROCAR as teclas em Configurações → Atalhos
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full border-[#2a3546] text-red-400 hover:bg-red-500/10 hover:text-red-300">
                    <FilePlus2 className="mr-1.5 h-3.5 w-3.5" /> Começar projeto novo
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="border-[#232d3d] bg-[#121722] text-zinc-200">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apagar tudo e começar de novo?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Remove todos os clipes e a mídia importada do projeto atual. Dá para desfazer com Ctrl+Z.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">Cancelar</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-600 text-white hover:bg-red-500" onClick={clearProject}>
                      Começar novo
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
          className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
          onClick={() => setSettingsOpen(true)}
          aria-label="Configurações do aplicativo"
          title="Configurações (atalhos, seta, chaves de API)"
        >
          <Settings className="h-4 w-4" />
        </Button>

        <div className="mx-1 hidden h-5 w-px bg-[#1c2430] sm:block" />
        <Button
          size="sm"
          onClick={onExport}
          className="h-8 gap-1.5 bg-[#22C55E] font-semibold text-black shadow-[0_0_14px_rgba(34,197,94,0.25)] hover:bg-[#1ed467]"
        >
          <Download className="h-4 w-4" />
          Exportar
          <span className="hidden rounded bg-black/20 px-1 text-[9px] font-bold uppercase lg:inline">{exportFormatLabel()}</span>
        </Button>
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}
