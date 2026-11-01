// GalaxyCut — tela de chegada de um link de edição compartilhada (ADR-001).
// Mostra exatamente o que o link permite (nível + descrição, como o gerador
// prometeu) e oferece as ações compatíveis: assistir (viewer travado),
// editar ou criar uma cópia. Nada é persistido sem escolha explícita.
// v9.1: links com &w=1 (modo vídeo direto) abrem direto no player estilo
// shorts — sem a tela de apresentação.
// v9.2:
//  - link de VISUALIZAÇÃO também cai direto no player (o modo shorts virou o
//    modo padrão de assistir — não existe mais um "modo shorts" separado);
//  - o player espera a mídia ficar pronta (tela "Preparando…" com progresso)
//    antes de dar play — antes tocava com placeholder atrás e engasgava;
//  - controles de áudio (volume/mudo) no player;
//  - nível EDIÇÃO explica como as mudanças voltam pra edição local de quem
//    compartilhou (mesmo ID → atualiza em vez de duplicar).
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Eye, PencilLine, CopyPlus, Play, Pause, SkipBack, ChevronLeft, ChevronRight,
  ArrowLeft, FileVideo, TriangleAlert, Volume2, VolumeX, Loader2, RefreshCw,
} from "lucide-react";
import { useProject, usePlayback, setActiveProject } from "@/lib/editor/store";
import { engine } from "@/lib/editor/playback";
import { rehydrateMediaWithSources } from "@/lib/editor/media";
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
  // v9.2: visualização agora É o player direto (modo shorts padrão)
  const [watching, setWatching] = useState(direct || payload?.lvl === "view");

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
        direct={direct || payload.lvl === "view"}
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

        {/* v9.2 — explicação do round-trip de edição: as mudanças feitas por
            este link ATUALIZAM a edição local (mesmo ID) quando o link
            atualizado volta pra quem compartilhou */}
        {payload.lvl === "edit" && (
          <div className="mt-4 rounded-lg border border-[var(--gc-accent-40)] bg-[var(--gc-accent-7)] p-3">
            <p className="text-[11px] font-semibold text-[var(--gc-accent)]">{t("shared.editRoundTripTitle")}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{t("shared.editRoundTripDesc")}</p>
          </div>
        )}

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
 * autoplay com tentativa de desbloqueio por toque, controles mínimos.
 * v9.2: espera a mídia ficar pronta ("Preparando…" com progresso) ANTES de
 * tocar; mídia de stock é re-baixada da fonte; volume/mudo do player. */
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
  // v9.2: preparação da mídia (gate antes do play) + áudio do player — o estado
  // inicial nasce do lazy initializer (setState sincrono no effect é proibido
  // pelo lint do React Compiler)
  const [prep, setPrep] = useState<{ done: number; total: number } | null>(() => {
    const n = payload.media.filter((m) => m.stockUrl).length;
    return n > 0 ? { done: 0, total: n } : null;
  });
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const directMode = direct;

  // carrega a edição em memória SEM projeto ativo (não polui a biblioteca nem
  // persiste nada — o autosave guarda activeProjectId nulo) e liga o engine.
  // v9.2: a mídia de stock é re-baixada da fonte ANTES do autoplay — quem abriu
  // o link assiste a edição de verdade (não um placeholder preto sem áudio).
  useEffect(() => {
    let cancelled = false;
    let autoTid: ReturnType<typeof setTimeout> | undefined;
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

    void rehydrateMediaWithSources(payload.media, (done, total) => {
      if (!cancelled) setPrep({ done, total });
    }).then((media) => {
      if (cancelled) return;
      useProject.setState({ media });
      engine.markDirty();
      setPrep(null);
      // mídia pronta: agora sim, autoplay (modo vídeo direto); se depois de
      // meio segundo o engine não tocar (gesto bloqueado pelo navegador),
      // acende o botão grande de toque
      if (directMode) {
        engine.play();
        autoTid = setTimeout(() => {
          if (!usePlayback.getState().playing) setBlocked(true);
        }, 500);
      }
    });

    return () => {
      cancelled = true;
      if (autoTid) clearTimeout(autoTid);
      engine.pause();
    };
  }, [payload, directMode]);

  // áudio do player (master do engine)
  useEffect(() => {
    engine.setMasterVolume(volume, muted);
  }, [volume, muted]);

  const tapPlay = () => {
    setBlocked(false);
    void engine.play();
  };

  const isPreparing = prep !== null;

  // ---- modo VÍDEO DIRETO: tela cheia, toque pausa/retoma, controles esquivos
  if (directMode) {
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

          {/* v9.2: gate de preparação — a edição NÃO começa no escuro: mostra
              que a mídia tá chegando (com progresso) e dá play sozinha depois */}
          {isPreparing && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/85 backdrop-blur-xs">
              <Loader2 className="h-9 w-9 animate-spin text-[var(--gc-accent)]" />
              <p className="text-sm font-semibold text-zinc-200">{t("shared.preparing")}</p>
              <div className="h-1.5 w-44 overflow-hidden rounded-full bg-[#1c2430]">
                <div
                  className="h-full rounded-full bg-[var(--gc-accent)] transition-all"
                  style={{ width: `${prep.total ? Math.round((prep.done / prep.total) * 100) : 0}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-500">{t("shared.preparingDesc", { d: prep.done, n: prep.total })}</p>
            </div>
          )}

          {(blocked || (!playing && playhead === 0 && !isPreparing)) && (
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

          {/* v9.2: configuração de áudio do player (volume/mudo) */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-zinc-300 hover:bg-white/10 hover:text-white"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? t("lib.unmute") : t("lib.mute")}
            title={muted ? t("lib.unmute") : t("lib.mute")}
          >
            {muted || volume === 0 ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const v = Number(e.target.value);
              setVolume(v);
              if (muted && v > 0) setMuted(false);
            }}
            className="gc-range h-1.5 w-16 cursor-pointer accent-[var(--gc-accent)] sm:w-20"
            aria-label={t("shared.volume")}
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

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4">
        <canvas
          ref={canvasRef}
          width={payload.project.width}
          height={payload.project.height}
          className="max-h-full max-w-full rounded-lg border border-[#1c2430] bg-black object-contain shadow-[0_0_40px_rgba(0,0,0,0.6)]"
        />
        {isPreparing && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-[#080b11]/80">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--gc-accent)]" />
            <p className="text-sm font-semibold text-zinc-200">{t("shared.preparing")}</p>
            <div className="h-1.5 w-44 overflow-hidden rounded-full bg-[#1c2430]">
              <div
                className="h-full rounded-full bg-[var(--gc-accent)] transition-all"
                style={{ width: `${prep.total ? Math.round((prep.done / prep.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-[11px] text-zinc-500">{t("shared.preparingDesc", { d: prep.done, n: prep.total })}</p>
          </div>
        )}
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
        {/* v9.2: áudio também no modo assistindo normal */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-zinc-400 hover:text-white"
          onClick={() => setMuted((m) => !m)}
          aria-label={muted ? t("lib.unmute") : t("lib.mute")}
          title={muted ? t("lib.unmute") : t("lib.mute")}
        >
          {muted || volume === 0 ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4" />}
        </Button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            if (muted && v > 0) setMuted(false);
          }}
          className="gc-range hidden h-1.5 w-16 cursor-pointer accent-[var(--gc-accent)] sm:block"
          aria-label={t("shared.volume")}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-zinc-400 hover:text-white"
          onClick={() => {
            // recarrega a mídia que faltou (re-tenta as fontes)
            setPrep({ done: 0, total: 1 });
            void rehydrateMediaWithSources(payload.media, (done, total) => setPrep({ done, total })).then((media) => {
              useProject.setState({ media });
              engine.markDirty();
              setPrep(null);
            });
          }}
          aria-label={t("shared.retryMedia")}
          title={t("shared.retryMedia")}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </footer>
    </div>
  );
}
