// GalaxyCut — barra do player da biblioteca: fica embaixo do painel de mídia,
// perfeitamente ajustada para larguras estreitas sem cortar botões,
// com pausar, avançar/voltar, scrubbing suave e botão de expandir para prévia grande.
// v9.2 — modo PARTES (✂): em vez de UM trecho só, dá pra marcar VÁRIAS
// subpartes do vídeo (uma aqui, outra ali…) e mandar todas pra timeline de
// uma vez — cada parte vira um clipe. Remove/adiciona parte à vontade.
"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  X,
  Loader2,
  Music2,
  Video as VideoIcon,
  Maximize2,
  Plus,
  Volume2,
  VolumeX,
  Scissors,
  ChevronLeft,
  ChevronRight,
  ListPlus,
  Trash2,
  Info,
} from "lucide-react";
import { useLibPlayer, LibItem } from "@/lib/editor/libPlayer";
import { useT } from "@/lib/editor/i18n";
import { useProject } from "@/lib/editor/store";
import { registry } from "@/lib/editor/media";
import { downloadStockFile } from "@/lib/editor/stockClient";
import { StockPreviewModal } from "./StockPreviewModal";
import { toast } from "sonner";

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** um trecho marcado no modo partes */
interface Part {
  inPt: number;
  outPt: number;
}

const PARTS_HINT_KEY = "galaxycut_parts_hint_v1";

export function LibraryPlayerBar() {
  const item = useLibPlayer((s) => s.item);
  const src = useLibPlayer((s) => s.src);
  const loading = useLibPlayer((s) => s.loading);
  const close = useLibPlayer((s) => s.close);

  if (!item) return null;
  // key = item+src: trocar de mídia REMONTA o player (estado limpo, do zero)
  return <PlayerCore key={`${item.id}|${src ?? ""}`} item={item} src={src} loading={loading} onClose={close} />;
}

function PlayerCore({
  item,
  src,
  loading,
  onClose,
}: {
  item: LibItem;
  src: string | null;
  loading: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [muted, setMuted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  // ---- modo PARTES: lista de trechos + qual tá sendo ajustado ----
  const [partsMode, setPartsMode] = useState(Boolean(item.parts));
  const [parts, setParts] = useState<Part[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [hintOpen, setHintOpen] = useState(false);

  const addMedia = useProject((s) => s.addMedia);
  const addClipFromMedia = useProject((s) => s.addClipFromMedia);

  const getMediaEl = () => (item.kind === "video" ? videoRef.current : audioRef.current);
  const activePart = parts[activeIdx] ?? null;

  // dica de primeira vez ("não mostrar de novo")
  useEffect(() => {
    if (!partsMode) return;
    let seen = false;
    try {
      seen = localStorage.getItem(PARTS_HINT_KEY) === "1";
    } catch {}
    if (!seen) setHintOpen(true);
  }, [partsMode]);

  // entra no modo partes com UMA parte inteira pronta pra recortar
  useEffect(() => {
    if (partsMode && dur > 0 && parts.length === 0) {
      setParts([{ inPt: 0, outPt: dur }]);
    }
  }, [partsMode, dur, parts.length]);

  // modal aberto = o vídeo da barra PAUSA (senão tocam os dois juntos)
  useEffect(() => {
    if (!modalOpen) return;
    const el = item.kind === "video" ? videoRef.current : audioRef.current;
    if (el && !el.paused) {
      el.pause();
      setPlaying(false);
    }
  }, [modalOpen, item.kind]);

  // montou com src? toca
  useEffect(() => {
    const el = getMediaEl();
    if (!el || !src) return;
    el.src = src;
    el.currentTime = 0;
    el.volume = muted ? 0 : 1;
    try {
      el.load();
    } catch {}
    const p = el.play();
    if (p !== undefined) {
      p.then(() => setPlaying(true)).catch((e) => {
        console.warn("Playback auto-start notice:", e);
        setPlaying(false);
      });
    }
  }, [src, item.kind]);

  const toggle = () => {
    const el = getMediaEl();
    if (!el) return;
    if (el.paused) {
      void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const skip = (d: number) => {
    const el = getMediaEl();
    if (!el) return;
    el.currentTime = Math.max(0, Math.min((el.duration || dur || 0) - 0.05, el.currentTime + d));
    setTime(el.currentTime);
  };

  // modo partes: a prévia dá loop DENTRO do trecho ativo (feedback ao vivo)
  const handleTimeUpdate = (cur: number) => {
    const el = getMediaEl();
    if (partsMode && activePart && el && !el.paused && dur > 0.2 && cur >= activePart.outPt - 0.05 && activePart.outPt < dur - 0.05) {
      el.currentTime = activePart.inPt;
      setTime(activePart.inPt);
    } else {
      setTime(cur);
    }
  };

  // ---- edições de parte (a ativa) ----
  const markIn = () => {
    if (!activePart || !dur) return;
    const cur = getMediaEl()?.currentTime ?? time;
    const inPt = Math.max(0, Math.min(cur, dur - 0.2));
    const outPt = Math.max(inPt + 0.2, Math.min(activePart.outPt, dur));
    setParts((ps) => ps.map((p, i) => (i === activeIdx ? { inPt, outPt } : p)));
  };

  const markOut = () => {
    if (!activePart || !dur) return;
    const cur = getMediaEl()?.currentTime ?? time;
    const outPt = Math.min(dur, Math.max(cur, 0.2));
    const inPt = Math.min(Math.max(0, activePart.inPt), outPt - 0.2);
    setParts((ps) => ps.map((p, i) => (i === activeIdx ? { inPt, outPt } : p)));
  };

  const resetActive = () => {
    if (!dur) return;
    setParts((ps) => ps.map((p, i) => (i === activeIdx ? { inPt: 0, outPt: dur } : p)));
  };

  const addPart = () => {
    const cur = getMediaEl()?.currentTime ?? time;
    const inPt = Math.max(0, Math.min(cur, Math.max(0, dur - 0.4)));
    const outPt = dur ? Math.min(dur, inPt + Math.max(1, dur * 0.15)) : inPt + 2;
    setParts((ps) => [...ps, { inPt, outPt: Math.max(inPt + 0.2, outPt) }]);
    setActiveIdx(parts.length); // a nova vira a ativa (usa o estado atual do array)
  };

  const removePart = (i: number) => {
    const next = parts.filter((_, k) => k !== i);
    setParts(next);
    setActiveIdx((a) => Math.max(0, Math.min(a > i ? a - 1 : a, Math.max(0, next.length - 1))));
  };

  const seekToPart = (i: number) => {
    setActiveIdx(i);
    const p = parts[i];
    const el = getMediaEl();
    if (p && el) {
      el.currentTime = p.inPt;
      setTime(p.inPt);
    }
  };

  const dismissHintForever = () => {
    try {
      localStorage.setItem(PARTS_HINT_KEY, "1");
    } catch {}
    setHintOpen(false);
  };

  /** manda a parte ativa OU todas as partes pra timeline (cada uma = 1 clipe) */
  const addRangesToTimeline = async () => {
    setAdding(true);
    try {
      if (item.rawStockItem) {
        // stock: baixa o arquivo e adiciona inteiro (sem recorte — igual antes)
        const catName = item.kind === "video" ? "Vídeos" : "Músicas & Efeitos";
        const catFolder = useProject.getState().getOrCreateCategoryFolder(catName);
        const blob = await downloadStockFile(item.rawStockItem.url);
        const meta = await registry.importFile(blob, `${item.title}.${item.kind === "video" ? "mp4" : "mp3"}`);
        addMedia({
          ...meta,
          source: "stock",
          stockUrl: item.rawStockItem.url,
          folderId: catFolder.id,
          license: item.rawStockItem.license,
          licenseLabel: item.rawStockItem.license,
          creator: item.rawStockItem.creator,
        });
        addClipFromMedia(meta.id);
        useProject.getState().setCurrentFolderId(catFolder.id);
        toast.success(t("st.addedToTimeline"));
      } else if (partsMode && parts.length) {
        // PARTES: uma linha do tempo por trecho — na ordem em que foram marcadas
        const sorted = [...parts].sort((a, b) => a.inPt - b.inPt);
        let n = 0;
        for (const p of sorted) {
          if (p.outPt - p.inPt >= 0.2) {
            addClipFromMedia(item.id, { inPoint: p.inPt, outPoint: p.outPt });
            n++;
          }
        }
        toast.success(
          n > 1 ? t("lib.partsAddedMany", { n }) : n === 1 ? t("lib.rangeAdded") : t("lib.partsNothing"),
        );
      } else {
        addClipFromMedia(item.id);
        toast.success(t("mp.addedClip"));
      }
    } catch {
      toast.error(t("st.errorDownload"));
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <div className="flex shrink-0 flex-col gap-1.5 border-t border-[#1c2430] bg-[#0e1320] px-3 py-2 shadow-xl select-none">
        {/* Elemento de Áudio invisível · VÍDEO em miniatura VISÍVEL (v9.1:
            antes o vídeo tocava escondido no player “de música” — agora dá
            pra ver o que tá tocando e clicar expande a prévia grande) */}
        {item.kind === "video" ? (
          <div className="relative mx-auto w-full max-w-[180px] overflow-hidden rounded-md border border-[#232d3d] bg-black">
            <video
              ref={videoRef}
              playsInline
              preload="auto"
              muted={muted}
              onClick={toggle}
              className="aspect-video h-auto w-full cursor-pointer object-contain"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={() => handleTimeUpdate(videoRef.current?.currentTime ?? 0)}
              onLoadedMetadata={() => setDur(videoRef.current?.duration || 0)}
              onEnded={() => setPlaying(false)}
              onError={(e) => {
                console.warn("Video element playback warning:", e);
                setPlaying(false);
              }}
            />
            {!playing && (
              <button
                type="button"
                onClick={toggle}
                className="absolute inset-0 flex items-center justify-center bg-black/35 transition hover:bg-black/50"
                aria-label={t("lib.play")}
              >
                <Play className="h-6 w-6 fill-current text-white/90 drop-shadow" />
              </button>
            )}
          </div>
        ) : (
          <div className="sr-only pointer-events-none">
            <audio
              ref={audioRef}
              preload="auto"
              muted={muted}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onTimeUpdate={() => handleTimeUpdate(audioRef.current?.currentTime ?? 0)}
              onLoadedMetadata={() => setDur(audioRef.current?.duration || 0)}
              onEnded={() => setPlaying(false)}
              onError={(e) => {
                console.warn("Audio element playback warning:", e);
                setPlaying(false);
              }}
            />
          </div>
        )}

        {/* Linha 1: Thumbnail/Ícone + Título + Tempo + Botão Expandir + Fechar */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded bg-[#18202f] border border-[#232d3d] flex items-center justify-center">
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--gc-accent)]" />
            ) : item.thumb ? (
              <img src={item.thumb} alt={item.title} className="h-full w-full object-cover" />
            ) : item.kind === "video" ? (
              <VideoIcon className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Music2 className="h-3.5 w-3.5 text-amber-400" />
            )}
          </div>

          <p className="truncate text-xs font-semibold text-zinc-200 flex-1 min-w-0" title={item.title}>
            {item.title}
          </p>

          <span className="shrink-0 font-mono text-[10px] tabular-nums text-zinc-400">
            {fmt(time)} <span className="text-zinc-600">/ {fmt(dur)}</span>
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-zinc-400 hover:text-white hover:bg-[#1c2430] rounded"
            onClick={() => setModalOpen(true)}
            title={t("lib.expand")}
            aria-label={t("lib.expand")}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-zinc-500 hover:text-zinc-200 hover:bg-[#1c2430] rounded"
            onClick={onClose}
            title={t("lib.close")}
            aria-label={t("lib.close")}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* ===== MODO PARTES: escolher vários trechos antes de adicionar ===== */}
        {partsMode && dur > 0 && (
          <>
            {/* dica de primeira vez — com "não mostrar de novo" */}
            {hintOpen && (
              <div className="rounded-md border border-[var(--gc-accent-40)] bg-[var(--gc-accent-7)] p-2">
                <div className="flex items-start gap-1.5">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--gc-accent)]" />
                  <p className="text-[10px] leading-snug text-zinc-300">{t("lib.partsHint")}</p>
                </div>
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={dismissHintForever}
                    className="flex items-center gap-1 text-[10px] text-zinc-400 transition hover:text-zinc-200"
                  >
                    <span className="flex h-3 w-3 items-center justify-center rounded-[3px] border border-zinc-500 bg-transparent" aria-hidden />
                    {t("lib.partsHintDontShow")}
                  </button>
                  <Button
                    size="sm"
                    className="h-5 rounded px-2 text-[10px] font-semibold bg-[var(--gc-accent)] text-black hover:bg-[var(--gc-accent-hover)]"
                    onClick={() => setHintOpen(false)}
                  >
                    {t("lib.partsHintOk")}
                  </Button>
                </div>
              </div>
            )}

            {/* linha do tempo com TODAS as partes marcadas (a ativa em destaque) */}
            <div className="relative h-2.5 w-full rounded bg-[#1c2430]">
              {parts.map((p, i) => (
                <div
                  key={i}
                  className={`absolute inset-y-0 cursor-pointer rounded transition-colors ${
                    i === activeIdx ? "bg-[var(--gc-accent)]" : "bg-[var(--gc-accent-40)] hover:bg-[var(--gc-accent-60)]"
                  }`}
                  style={{
                    left: `${(p.inPt / dur) * 100}%`,
                    width: `${Math.max(0.5, ((p.outPt - p.inPt) / dur) * 100)}%`,
                  }}
                  onClick={() => seekToPart(i)}
                  title={`${t("lib.part")} ${i + 1}: ${fmt(p.inPt)}–${fmt(p.outPt)}`}
                />
              ))}
            </div>

            {/* controles da parte ativa */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 rounded px-2 text-[10px] font-semibold text-zinc-300 hover:bg-[#1c2430] hover:text-white"
                onClick={markIn}
                title={t("lib.setIn")}
              >
                <ChevronLeft className="h-3 w-3" /> {t("lib.setIn")} {fmt(activePart?.inPt ?? 0)}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 rounded px-2 text-[10px] font-semibold text-zinc-300 hover:bg-[#1c2430] hover:text-white"
                onClick={markOut}
                title={t("lib.setOut")}
              >
                {t("lib.setOut")} {fmt(activePart?.outPt ?? 0)} <ChevronRight className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 rounded px-2 text-[10px] text-zinc-500 hover:bg-[#1c2430] hover:text-zinc-300"
                onClick={() => {
                  const cur = getMediaEl()?.currentTime ?? time;
                  const next = parts.map((p, i) => (i === activeIdx ? { ...p, outPt: Math.max(p.inPt + 0.2, cur) } : p));
                  setParts(next);
                }}
                title={t("lib.markEndHere")}
              >
                {t("lib.endHere")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 rounded px-2 text-[10px] text-zinc-500 hover:bg-[#1c2430] hover:text-zinc-300"
                onClick={resetActive}
              >
                {t("lib.resetRange")}
              </Button>
              <span className="ml-auto font-mono text-[10px] tabular-nums text-zinc-500">
                {activePart
                  ? t("lib.range", {
                      a: fmt(activePart.inPt),
                      b: fmt(activePart.outPt),
                      d: (activePart.outPt - activePart.inPt).toFixed(1),
                    })
                  : ""}
              </span>
            </div>

            {/* as partes marcadas: adicionar / remover / escolher qual editar */}
            <div className="flex flex-wrap items-center gap-1">
              {parts.map((p, i) => (
                <span
                  key={i}
                  className={`group flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] tabular-nums transition ${
                    i === activeIdx
                      ? "border-[var(--gc-accent)] bg-[var(--gc-accent-15)] text-[var(--gc-accent)]"
                      : "border-[#2a3546] bg-[#121722] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <button type="button" className="font-semibold" onClick={() => seekToPart(i)} title={t("lib.partGo")}>
                    {t("lib.part")} {i + 1} · {fmt(p.inPt)}–{fmt(p.outPt)}
                  </button>
                  <button
                    type="button"
                    onClick={() => removePart(i)}
                    className="text-zinc-500 transition hover:text-red-400"
                    title={t("lib.partRemove")}
                    aria-label={t("lib.partRemove")}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 gap-1 rounded border border-dashed border-[#2a3546] px-2 text-[10px] font-semibold text-zinc-400 hover:text-[var(--gc-accent)] hover:border-[var(--gc-accent-60)]"
                onClick={addPart}
                title={t("lib.partAdd")}
              >
                <Plus className="h-3 w-3" /> {t("lib.partAdd")}
              </Button>
            </div>
          </>
        )}

        {/* Linha 2: Controles de Reprodução + Barra de Progresso Inteira + Volume + Adicionar */}
        <div className="flex items-center gap-1.5 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-zinc-400 hover:text-zinc-200 p-0"
            onClick={() => skip(-5)}
            aria-label={t("lib.back5")}
            title={t("lib.back5")}
          >
            <RotateCcw className="h-3 w-3" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 rounded-full bg-[var(--gc-accent)] p-0 text-black hover:bg-[var(--gc-accent-hover)] font-bold shadow-sm transition hover:scale-105"
            onClick={toggle}
            aria-label={playing ? t("lib.pause") : t("lib.play")}
          >
            {playing ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-zinc-400 hover:text-zinc-200 p-0"
            onClick={() => skip(5)}
            aria-label={t("lib.fwd5")}
            title={t("lib.fwd5")}
          >
            <RotateCw className="h-3 w-3" />
          </Button>

          {/* Range Slider de Scrubbing com largura flexível garantida */}
          <input
            type="range"
            min={0}
            max={dur || 0}
            step={0.05}
            value={Math.min(time, dur || 0)}
            onChange={(e) => {
              const v = Number(e.target.value);
              setTime(v);
              const el = getMediaEl();
              if (el) el.currentTime = v;
            }}
            className="gc-range h-1.5 min-w-0 flex-1 cursor-pointer accent-[var(--gc-accent)]"
            aria-label={t("lib.position")}
          />

          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-zinc-400 hover:text-zinc-200 p-0"
            onClick={() => setMuted((m) => !m)}
            title={muted ? t("lib.unmute") : t("lib.mute")}
          >
            {muted ? <VolumeX className="h-3 w-3 text-red-400" /> : <Volume2 className="h-3 w-3" />}
          </Button>

          {/** liga/desliga o modo PARTES (só pra mídia local — stock baixa inteiro) */}
          {!item.rawStockItem && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-6 w-6 shrink-0 rounded p-0 ${partsMode ? "bg-[var(--gc-accent-15)] text-[var(--gc-accent)]" : "text-zinc-400 hover:text-zinc-200 hover:bg-[#1c2430]"}`}
              onClick={() => setPartsMode((v) => !v)}
              title={t("lib.trim")}
              aria-label={t("lib.trim")}
              aria-pressed={partsMode}
            >
              <Scissors className="h-3 w-3" />
            </Button>
          )}

          <Button
            size="sm"
            onClick={addRangesToTimeline}
            disabled={adding}
            className="h-6 px-2 text-[10px] font-semibold bg-[var(--gc-accent)] hover:bg-[var(--gc-accent-hover)] text-black rounded shrink-0 shadow gap-1"
            title={partsMode && parts.length > 1 ? t("lib.addRangesMany", { n: parts.length }) : partsMode ? t("lib.addRange") : t("lib.addToTimeline")}
          >
            {adding ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : partsMode && parts.length > 1 ? (
              <ListPlus className="h-3 w-3" strokeWidth={3} />
            ) : (
              <Plus className="h-3 w-3" strokeWidth={3} />
            )}
            <span className="hidden xs:inline">
              {partsMode && parts.length > 1
                ? t("lib.addRangesMany", { n: parts.length })
                : partsMode
                  ? t("lib.addRange")
                  : t("lib.add")}
            </span>
          </Button>
        </div>
      </div>

      {/* Modal Grande quando clicar em Expandir */}
      {modalOpen && (
        <StockPreviewModal
          item={
            item.rawStockItem || {
              id: item.id,
              title: item.title,
              url: item.url,
              // item.thumb é opcional no LibItem; o modal tolera ausência em runtime (comportamento pré-tipagem)
              thumb: item.thumb as string,
              duration: dur || 0,
              provider: item.provider || "GalaxyCut",
              license: item.license || "cc0",
              creator: item.creator,
              audio: item.kind === "audio",
            }
          }
          open={modalOpen}
          onOpenChange={setModalOpen}
          onAddStock={async () => {
            await addRangesToTimeline();
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}
