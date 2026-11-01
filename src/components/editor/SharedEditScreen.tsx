// GalaxyCut — tela de chegada de um link de edição compartilhada (ADR-001).
// Mostra exatamente o que o link permite (nível + descrição, como o gerador
// prometeu) e oferece as ações compatíveis: assistir (viewer travado),
// editar ou criar uma cópia. Nada é persistido sem escolha explícita.
// v9.1: links com &w=1 (modo vídeo direto) abrem direto no player estilo
// shorts — sem a tela de apresentação.
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Eye, PencilLine, CopyPlus, Play, Pause, SkipBack, ChevronLeft, ChevronRight,
  ArrowLeft, FileVideo, TriangleAlert,
} from "lucide-react";
import { useProject, usePlayback, setActiveProject } from "@/lib/editor/store";
import { engine } from "@/lib/editor/playback";
import { rehydrateMedia } from "@/lib/editor/media";
import { fmtTime } from "@/lib/editor/types";
import { useT, useLang } from "@/lib/editor/i18n";
import { shareLevelInfo, type SharePayload } from "@/lib/editor/share";
import { BrandLogo } from "./BrandLogo";

const LEVEL_ICONS = { view: Eye, edit: PencilLine, copy: CopyPlus } as const;

export function SharedEditScreen({
  payload,
  onImport,
  onExit,
  direct = false,
}: {
  payload: SharePayload | null;
  onImport: (p: SharePayload, mode: "edit" | "copy") => void;
  onExit: () => void;
  /** link de vídeo direto (#s=…&w=1): cai direto no player, sem apresentação */
  direct?: boolean;
}) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const [watching, setWatching] = useState(direct);

  // link inválido/corrompido — erro amigável, sem stack na cara do usuário
  if (!payload) {
    return (
      <Shell>
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#232d3d] bg-[#0c1017] text-amber-400">
          <TriangleAlert className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-center text-xl font-bold text-zinc-100">{t("shared.invalidTitle")}</h1>
        <p className="mt-2 max-w-sm text-center text-sm leading-relaxed text-zinc-400">{t("shared.invalidDesc")}</p>
        <Button
          onClick={onExit}
          className="mt-6 h-10 gap-2 bg-[var(--gc-accent)] px-5 text-sm font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
        >
          <Play className="h-4 w-4" />
          {t("shared.goApp")}
        </Button>
      </Shell>
    );
  }

  const info = shareLevelInfo(payload.lvl);
  const Icon = LEVEL_ICONS[payload.lvl];
  const date = new Date(payload.made).toLocaleDateString(lang === "pt" ? "pt-BR" : lang === "es" ? "es-ES" : "en-US");

  if (watching) {
    return (
      <ShareViewer
        payload={payload}
        onBack={() => setWatching(false)}
        direct={direct}
        onMakeCopy={payload.lvl === "view" ? undefined : () => onImport(payload, "copy")}
      />
    );
  }

  const btnOutline =
    "h-10 gap-2 border-[#232d3d] bg-[#10151d] text-sm text-zinc-200 hover:bg-[#141a24] hover:text-white";
  const btnPrimary =
    "h-10 gap-2 bg-[var(--gc-accent)] text-sm font-semibold text-black hover:bg-[var(--gc-accent-hover)]";

  return (
    <Shell>
      <BrandLogo size={44} />
      <h1 className="mt-4 text-center text-xl font-bold text-zinc-100">{t("shared.title")}</h1>

      <div className="mt-5 w-full rounded-xl border border-[#232d3d] bg-[#0c1017] p-5">
        <p className="text-xs text-zinc-500">{t("share.linkFor")}</p>
        <p className="mt-1 truncate text-lg font-bold text-zinc-100">“{payload.name}”</p>

        <div className="my-4 h-px bg-[#1c2430]" />

        <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t("shared.level")}</p>
        <div className="mt-1.5 flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--gc-accent-15)] text-[var(--gc-accent)]">
            <Icon className="h-4 w-4" />
          </span>
          <p className="text-sm leading-snug text-zinc-300">
            <span className="font-semibold text-[var(--gc-accent)]">{t(info.nameKey)}</span>
            <span className="text-zinc-400"> — {t(info.descKey)}</span>
          </p>
        </div>

        <p className="mt-4 font-mono text-[10px] tracking-wide text-zinc-600">
          {t("shared.madeWith", { v: payload.app, date })}
        </p>
      </div>

      <p className="mt-3 flex max-w-md items-start gap-1.5 text-left text-[11px] leading-snug text-zinc-500">
        <FileVideo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t("shared.missingNote")}
      </p>

      <div className="mt-6 flex w-full flex-col gap-2">
        {payload.lvl === "view" ? (
          <>
            {/* v9.1: visualização não oferece mais "copiar pra mim" — o nível
                só deixa OLHAR, então o botão de copiar não tem por que existir */}
            <Button onClick={() => setWatching(true)} className={btnPrimary}>
              <Play className="h-4 w-4" />
              {t("shared.watch")}
            </Button>
          </>
        ) : payload.lvl === "edit" ? (
          <>
            <Button onClick={() => onImport(payload, "edit")} className={btnPrimary}>
              <PencilLine className="h-4 w-4" />
              {t("shared.editThis")}
            </Button>
            <Button variant="outline" onClick={() => setWatching(true)} className={btnOutline}>
              <Eye className="h-4 w-4" />
              {t("shared.watch")}
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => onImport(payload, "copy")} className={btnPrimary}>
              <CopyPlus className="h-4 w-4" />
              {t("shared.makeCopy")}
            </Button>
            <Button variant="outline" onClick={() => setWatching(true)} className={btnOutline}>
              <Eye className="h-4 w-4" />
              {t("shared.watch")}
            </Button>
          </>
        )}
        <button
          type="button"
          onClick={onExit}
          className="mt-2 text-xs text-zinc-500 underline-offset-2 transition hover:text-zinc-300 hover:underline"
        >
          {t("shared.goApp")}
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#080b11] px-4 py-10 text-zinc-200">
      <div className="flex w-full max-w-md flex-col items-center">{children}</div>
    </div>
  );
}

/** Visualizador travado: play/scrub no canvas do engine, zero edição.
 * v9.1: `direct` = modo vídeo (link #s=…&w=1): tela cheia estilo shorts,
 * autoplay com tentativa de desbloqueio por toque, controles mínimos. */
function ShareViewer({
  payload,
  onBack,
  direct = false,
  onMakeCopy,
}: {
  payload: SharePayload;
  onBack: () => void;
  direct?: boolean;
  onMakeCopy?: () => void;
}) {
  const t = useT();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const playhead = usePlayback((s) => s.playhead);
  const duration = usePlayback((s) => s.duration);
  const playing = usePlayback((s) => s.playing);
  const projectName = useProject((s) => s.project.name);
  const [blocked, setBlocked] = useState(false); // navegador exigiu gesto pra tocar

  // carrega a edição em memória SEM projeto ativo (não polui a biblioteca nem
  // persiste nada — o autosave guarda activeProjectId nulo) e liga o engine
  useEffect(() => {
    setActiveProject(null);
    useProject.getState().loadSnapshot({
      project: payload.project,
      tracks: payload.tracks,
      clips: payload.clips,
      media: payload.media,
      folders: payload.folders,
    });
    if (canvasRef.current) engine.bind(canvasRef.current);
    engine.seek(0);
    engine.markDirty();
    // se quem abriu é o próprio autor (mesma máquina), os blobs estão no
    // IndexedDB e a edição toca COM mídia; senão vira placeholder — honesto
    void rehydrateMedia(payload.media).then((media) => {
      useProject.setState({ media });
      engine.markDirty();
    });
    // modo vídeo direto: tenta dar play sozinho (estilo shorts); se depois
    // de meio segundo o engine não tocar (gesto bloqueado pelo navegador),
    // acende o botão grande de toque
    if (direct) {
      engine.play();
      const tid = setTimeout(() => {
        if (!usePlayback.getState().playing) setBlocked(true);
      }, 500);
      return () => {
        clearTimeout(tid);
        engine.pause();
      };
    }
    return () => engine.pause();
  }, [payload, direct]);

  const tapPlay = () => {
    setBlocked(false);
    void engine.play();
  };

  // ---- modo VÍDEO DIRETO: tela cheia, toque pausa/retoma, controles esquivos
  if (direct) {
    return (
      <div className="flex h-screen w-full flex-col bg-black text-zinc-200 select-none">
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          <canvas
            ref={canvasRef}
            width={payload.project.width}
            height={payload.project.height}
            onClick={() => (playing ? engine.pause() : tapPlay())}
            className="max-h-full max-w-full bg-black object-contain"
          />
          {(blocked || (!playing && playhead === 0)) && (
            <button
              type="button"
              onClick={tapPlay}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/45 transition hover:bg-black/55"
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-full border border-white/25 bg-black/60 shadow-2xl backdrop-blur-sm transition hover:scale-105">
                <Play className="ml-1 h-9 w-9 fill-current text-white" />
              </span>
              <span className="text-sm font-medium text-zinc-200 drop-shadow">{t("shared.tapToPlay")}</span>
            </button>
          )}
        </div>

        <footer className="absolute inset-x-0 bottom-0 flex items-center gap-3 bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-10">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-zinc-300 hover:bg-white/10 hover:text-white"
            onClick={() => (playing ? engine.pause() : tapPlay())}
            aria-label={playing ? t("pv.pause") : t("pv.play")}
          >
            {playing ? <Pause className="h-5 w-5 fill-current" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
          </Button>
          <span className="w-24 shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
            {fmtTime(playhead)} / {fmtTime(duration)}
          </span>
          <Slider
            value={[Math.min(playhead, Math.max(duration, 0))]}
            max={Math.max(duration, 0.1)}
            step={0.01}
            onValueChange={(v) => engine.seek(v[0], { mode: "free" })}
            className="flex-1"
          />
          <span className="hidden max-w-[180px] truncate text-[11px] text-zinc-500 sm:block">{projectName}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-zinc-400 hover:bg-white/10 hover:text-white"
            onClick={onBack}
            aria-label={t("shared.backToLink")}
            title={t("shared.backToLink")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </footer>
      </div>
    );
  }

  // ---- modo normal (botão “Assistir” na tela de apresentação)

  return (
    <div className="flex h-screen flex-col bg-[#080b11] text-zinc-200">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[#1c2430] bg-[#07070a] px-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-zinc-100"
          onClick={onBack}
          aria-label={t("shared.backToLink")}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <span className="truncate text-sm font-medium text-zinc-200">{projectName}</span>
        <span className="ml-2 hidden items-center gap-1.5 rounded-full border border-[var(--gc-accent-40)] bg-[var(--gc-accent-10)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--gc-accent)] sm:flex">
          <Eye className="h-3 w-3" />
          {t("shared.viewOnly")}
        </span>
        {onMakeCopy && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto h-7 gap-1.5 border-[#232d3d] bg-[#0c1017] px-2.5 text-xs text-zinc-300 hover:bg-[#141a24]"
            onClick={onMakeCopy}
          >
            <CopyPlus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("shared.copyForMe")}</span>
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center p-4">
        <canvas
          ref={canvasRef}
          width={payload.project.width}
          height={payload.project.height}
          className="max-h-full max-w-full rounded-lg border border-[#1c2430] bg-black object-contain shadow-[0_0_40px_rgba(0,0,0,0.6)]"
        />
      </div>

      <footer className="flex h-16 shrink-0 items-center gap-3 border-t border-[#1c2430] bg-[#07070a] px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-white"
          onClick={() => engine.seek(0)}
          aria-label={t("pv.start")}
        >
          <SkipBack className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-white"
          onClick={() => engine.nudgeFrames(-1)}
          aria-label={t("pv.prevFrame")}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="icon"
          className="h-9 w-9 shrink-0 rounded-full bg-[var(--gc-accent)] text-black hover:bg-[var(--gc-accent-hover)]"
          onClick={() => engine.toggle()}
          aria-label={t("pv.play")}
        >
          {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-zinc-400 hover:text-white"
          onClick={() => engine.nudgeFrames(1)}
          aria-label={t("pv.nextFrame")}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <span className="w-28 shrink-0 font-mono text-[11px] tabular-nums text-zinc-400">
          {fmtTime(playhead)} / {fmtTime(duration)}
        </span>
        <Slider
          value={[Math.min(playhead, Math.max(duration, 0))]}
          max={Math.max(duration, 0.1)}
          step={0.01}
          onValueChange={(v) => engine.seek(v[0], { mode: "free" })}
          className="flex-1"
        />
      </footer>
    </div>
  );
}
