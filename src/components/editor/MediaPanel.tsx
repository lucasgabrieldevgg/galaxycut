// GalaxyCut — painel esquerdo: mídia (com gravação de voz!), texto/legendas e busca online
"use client";

import { useEffect, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProject, usePlayback } from "@/lib/editor/store";
import { registry } from "@/lib/editor/media";
import { isDesktopBuild } from "@/lib/editor/desktop";
import { useSubtitleJob } from "@/lib/editor/subtitles";
import { CAPTION_PRESETS, LICENSE_STYLE, licenseLevel, MediaMeta } from "@/lib/editor/types";
import { gcDrag } from "@/lib/editor/dnd";
import { useLibPlayer } from "@/lib/editor/libPlayer";
import { toast } from "sonner";
import {
  Upload, FolderOpen, Trash2, Plus, Type, Sparkles, Search, Film, ImageIcon, Music2, FileWarning,
  Loader2, PlusCircle, Mic, Play as PlayIcon,
} from "lucide-react";
import { SubtitleDialog } from "./SubtitleDialog";
import { StockSearch } from "./StockSearch";
import { LibraryPlayerBar } from "./LibraryPlayerBar";
import { RecordDialog } from "./RecordDialog";
import { FloatMenu, MenuItem } from "./ClipMenu";
import { useT, t as tr } from "@/lib/editor/i18n";

const MEDIA_DND_TYPE = "application/x-galaxiacut-media";

/** filtros da aba Mídia (achar vídeo/áudio/imagem fácil) */
const KIND_FILTERS: { id: "all" | "video" | "audio" | "image"; key: string }[] = [
  { id: "all", key: "mp.all" },
  { id: "video", key: "mp.videos" },
  { id: "audio", key: "mp.audios" },
  { id: "image", key: "mp.images" },
];

function fmtDur(d: number) {
  if (!isFinite(d)) return "—";
  const m = Math.floor(d / 60);
  const s = Math.floor(d % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MediaPanel() {
  const t = useT();
  const media = useProject((s) => s.media);
  const addMedia = useProject((s) => s.addMedia);
  const removeMedia = useProject((s) => s.removeMedia);
  const relinkMedia = useProject((s) => s.relinkMedia);
  const addClipFromMedia = useProject((s) => s.addClipFromMedia);
  const addTextClip = useProject((s) => s.addTextClip);
  const playhead = usePlayback((s) => s.playhead);
  const [importing, setImporting] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState<MediaMeta | null>(null);
  /** mídia selecionada no painel (o Delete do teclado apaga ela) */
  const [selMedia, setSelMedia] = useState<string | null>(null);
  /** filtro da aba Mídia: tudo/vídeos/áudios/imagens */
  const [kindFilter, setKindFilter] = useState<"all" | "video" | "audio" | "image">("all");
  const [recordOpen, setRecordOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  /** Remove mídia — pede confirmação quando ela tá sendo usada na timeline */
  function askRemove(m: MediaMeta) {
    const used = useProject.getState().clips.filter((c) => c.mediaId === m.id).length;
    if (used > 0) setConfirmRemove(m);
    else removeMedia(m.id);
  }

  // o atalho "delete" (editável) dispara este evento quando a seleção tá no painel de mídia
  useEffect(() => {
    const del = () => {
      if (!selMedia) return;
      const m = useProject.getState().media.find((x) => x.id === selMedia);
      if (m) askRemove(m);
    };
    window.addEventListener("galaxiacut:delmedia", del);
    return () => window.removeEventListener("galaxiacut:delmedia", del);
     
  }, [selMedia]);

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter(
      (f) => /^(video|audio|image)\//.test(f.type) || /\.(mp4|webm|mov|mkv|m4v|avi|png|jpe?g|webp|gif|avif|bmp|mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(f.name)
    );
    if (!arr.length) {
      toast.info(t("mp.noFiles"));
      return;
    }
    setImporting(arr.length);
    let ok = 0;
    let fail = 0;
    for (const f of arr) {
      try {
        const meta = await registry.importFile(f);
        addMedia(meta);
        ok++;
      } catch (e) {
        fail++;
        toast.error(t("mp.relinkFail") + `: ${f.name}`, { description: String((e as Error).message ?? e) });
      } finally {
        setImporting((n) => Math.max(0, n - 1));
      }
    }
    if (ok > 0) {
      toast.success(
        fail > 0
          ? t("mp.importedPartial", { ok, n: arr.length, fail })
          : t("mp.importedN", { n: ok })
      );
    }
  }

  async function relink(id: string, file: File) {
    try {
      const meta = await registry.relink(id, file);
      if (!meta) {
        toast.error(t("mp.relinkFail"));
        return;
      }
      useProject.setState((s) => ({
        media: s.media.map((m) => (m.id === id ? { ...m, ...meta, missing: false, decodeError: false } : m)),
      }));
      relinkMedia(id);
      toast.success(t("mp.relinked"));
    } catch (e) {
      toast.error(t("mp.relinkFail"), { description: String((e as Error).message ?? e) });
    }
  }

  const job = useSubtitleJob();

  return (
    <div className="flex h-full flex-col bg-[#0c1017]">
      <Tabs defaultValue="media" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="shrink-0 border-b border-[#1c2430] px-2 pt-2">
          <TabsList className="grid h-8 w-full grid-cols-3 bg-[#151b26]">
            <TabsTrigger value="media" className="h-7 gap-1 text-[11px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-zinc-100">
              <Film className="h-3 w-3" /> {t("mp.media")}
            </TabsTrigger>
            <TabsTrigger value="text" className="h-7 gap-1 text-[11px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-zinc-100">
              <Type className="h-3 w-3" /> {t("mp.text")}
            </TabsTrigger>
            <TabsTrigger value="stock" className="h-7 gap-1 text-[11px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-zinc-100">
              <Search className="h-3 w-3" /> {t("mp.search")}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ---------- MÍDIA ---------- */}
        <TabsContent value="media" className="min-h-0 flex-1 overflow-hidden pt-0">
          <div className="flex h-full min-h-0 flex-col">
            <div className="grid shrink-0 grid-cols-[1fr_auto_auto] gap-1.5 p-2.5">
              <button
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
                }}
                className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-[#2a3546] bg-[#0e1320] px-3 py-3.5 text-zinc-500 transition hover:border[var(--gc-accent-60)] hover:text-[var(--gc-accent)]"
              >
                {importing > 0 ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                <span className="text-xs font-medium">{t("mp.importFiles")}</span>
                <span className="text-[10px] text-zinc-600">{t("mp.clickOrDrag")}</span>
              </button>
              <button
                onClick={() => folderRef.current?.click()}
                title={t("mp.importFolderHint")}
                className="flex w-[74px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#2a3546] bg-[#0e1320] px-1 py-3.5 text-zinc-500 transition hover:border[var(--gc-accent-60)] hover:text-[var(--gc-accent)]"
              >
                <FolderOpen className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-tight">{t("mp.importFolder").split(" ")[0]}<br />{t("mp.importFolder").split(" ").slice(1).join(" ")}</span>
              </button>
              <button
                onClick={() => setRecordOpen(true)}
                title={t("mp.recordHint")}
                className="flex w-[74px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#2a3546] bg-[#0e1320] px-1 py-3.5 text-zinc-500 transition hover:border-red-400/60 hover:text-red-400"
              >
                <Mic className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-tight">{t("mp.record").split(" ")[0]}<br />{t("mp.record").split(" ").slice(1).join(" ")}</span>
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="video/*,audio/*,image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <input
                ref={folderRef}
                type="file"
                multiple
                className="hidden"
                // @ts-expect-error atributo não padrão do navegador pra escolher PASTA
                webkitdirectory=""
                directory=""
                onChange={(e) => {
                  if (e.target.files?.length) void handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
            {/* filtros: achar vídeo/áudio/imagem num projeto cheio */}
            {media.length > 0 && (
              <div className="flex shrink-0 flex-wrap gap-1 px-2.5 pb-2">
                {KIND_FILTERS.map((f) => {
                  const n = f.id === "all" ? media.length : media.filter((m) => m.kind === f.id).length;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setKindFilter(f.id)}
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] transition ${
                        kindFilter === f.id
                          ? "border-[var(--gc-accent)] bg[var(--gc-accent-15)] text-[var(--gc-accent)]"
                          : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                      }`}
                    >
                      {t(f.key)} <span className="opacity-60">{n}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <ScrollArea className="min-h-0 flex-1 px-2.5 pb-3">
              {media.length === 0 ? (
                <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-zinc-600">{t("mp.empty")}</p>
              ) : kindFilter === "all" || media.some((m) => m.kind === kindFilter) ? (
                <div className="space-y-1.5">
                  {media
                    .filter((m) => kindFilter === "all" || m.kind === kindFilter)
                    .map((m) => (
                      <MediaRow
                        key={m.id}
                        m={m}
                        sel={selMedia === m.id}
                        onSelect={() => setSelMedia(selMedia === m.id ? null : m.id)}
                        onRemove={() => askRemove(m)}
                        onRelink={(f) => void relink(m.id, f)}
                        onAdd={() => {
                          const c = addClipFromMedia(m.id);
                          if (c) toast.success(t("mp.addedAt", { t: fmtDur(c.start) }));
                        }}
                      />
                    ))}
                </div>
              ) : (
                <p className="px-2 py-6 text-center text-[11px] text-zinc-600">{t("mp.noneOfKind")}</p>
              )}
            </ScrollArea>
          </div>
        </TabsContent>

        {/* ---------- TEXTO / LEGENDAS ---------- */}
        <TabsContent value="text" className="min-h-0 flex-1 overflow-hidden pt-0">
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-2.5">
            <Button
              onClick={() => {
                addTextClip(playhead);
                toast.success(t("mp.textAdded"));
              }}
              className="h-9 w-full shrink-0 gap-1.5 bg-[var(--gc-accent)] text-sm font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
            >
              <Type className="h-4 w-4" /> {t("mp.addText")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                job.setMinimized(false);
                job.setOpen(true);
              }}
              className="h-9 w-full shrink-0 gap-1.5 border-[#2a3546] bg-transparent text-sm text-zinc-200 hover:border[var(--gc-accent-50)] hover:text-[var(--gc-accent)]"
            >
              <Sparkles className="h-4 w-4 text-[var(--gc-accent)]" /> {t("mp.autoSubs")}
            </Button>
            <p className="rounded-md border border-[#2a3546] bg-[#0e1320] p-2.5 text-[10px] leading-relaxed text-zinc-500">
              {isDesktopBuild() ? t("mp.subsNoteApp") : t("mp.subsNoteWeb")}
            </p>
            <div className="mt-1 min-h-0 flex-1">
              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{t("mp.captionStyles")}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {CAPTION_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      addTextClip(playhead, p.props);
                      toast.success(t("mp.styleAdded", { name: p.name }));
                    }}
                    className="flex flex-col items-center gap-1 rounded-lg border border-[#232d3d] bg-[#121722] px-2 py-2.5 transition hover:border-[#3a4759]"
                    title={`Adicionar texto com estilo ${p.name}`}
                  >
                    <span
                      className="truncate text-[13px] leading-tight"
                      style={{
                        fontFamily: p.props.font,
                        color: p.props.highlight ? p.props.highlightColor : p.props.color,
                        WebkitTextStroke: (p.props.strokeW ?? 0) > 0 ? `1px ${p.props.strokeColor}` : undefined,
                        textShadow: p.props.shadow ? "0 1px 3px rgba(0,0,0,.8)" : undefined,
                      }}
                    >
                      AaBbCc
                    </span>
                    <span className="text-[9px] text-zinc-500">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ---------- BUSCA ONLINE ---------- */}
        <TabsContent value="stock" className="min-h-0 flex-1 overflow-hidden pt-0">
          <StockSearch />
        </TabsContent>
      </Tabs>

      {/* player da biblioteca: barra fixa embaixo (vídeo/música/efeito) */}
      <LibraryPlayerBar />

      <SubtitleDialog />
      <RecordDialog open={recordOpen} onOpenChange={setRecordOpen} />

      {/* confirmação de remoção de mídia em uso */}
      <AlertDialog open={!!confirmRemove} onOpenChange={(v) => !v && setConfirmRemove(null)}>
        <AlertDialogContent className="border-[#232d3d] bg-[#121722] text-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mp.removeTitle", { name: confirmRemove?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("mp.removeHint", { n: useProject.getState().clips.filter((c) => c.mediaId === confirmRemove?.id).length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">{t("misc.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              onClick={() => {
                if (confirmRemove) {
                  removeMedia(confirmRemove.id);
                  setSelMedia((s) => (s === confirmRemove.id ? null : s));
                }
                setConfirmRemove(null);
              }}
            >
              {t("mp.removeAll")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------------- linha de mídia da aba Mídia ----------------

function MediaRow({
  m,
  sel,
  onSelect,
  onRemove,
  onRelink,
  onAdd,
}: {
  m: MediaMeta;
  sel: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRelink: (f: File) => void;
  onAdd: () => void;
}) {
  const openPlayer = useLibPlayer((s) => s.open);
  const lic = m.source === "stock" ? licenseLevel(m.license) : null;
  const licStyle = lic ? LICENSE_STYLE[lic] : null;
  const url = registry.getUrl(m.id);

  const items: MenuItem[] = [
    { label: tr("mp.addToTimeline"), icon: <PlusCircle className="h-3.5 w-3.5 text-[var(--gc-accent)]" />, onClick: onAdd },
    ...(m.kind !== "image" && url
      ? [{
          label: tr("mp.listen"),
          icon: <PlayIcon className="h-3.5 w-3.5" />,
          onClick: () =>
            openPlayer({ id: m.id, title: m.name, url: url!, kind: m.kind === "audio" ? "audio" : "video", thumb: m.thumbnail }),
        }]
      : []),
    ...(m.creator ? [{ type: "info" as const, label: `Autor: ${m.creator}${licStyle ? ` · ${licStyle.title}` : ""}` }] : []),
    { type: "sep" as const },
    { label: tr("mp.removeMedia"), icon: <Trash2 className="h-3.5 w-3.5" />, danger: true, onClick: onRemove },
  ];

  return (
    <FloatMenu items={items}>
      <div
        draggable={!m.missing}
        onClick={onSelect}
        onDragStart={(e) => {
          e.dataTransfer.setData(MEDIA_DND_TYPE, m.id);
          e.dataTransfer.setData("text/plain", m.id);
          e.dataTransfer.effectAllowed = "copy";
          gcDrag.begin(m.id); // a timeline usa isso pra calcular o encaixe ANTES de soltar
        }}
        onDragEnd={() => gcDrag.end()}
        className={`group flex cursor-grab items-center gap-2 rounded-lg border p-1.5 transition active:cursor-grabbing ${
          sel
            ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)]"
            : m.missing
              ? "border-red-500/40 bg-red-500/5"
              : "border-[#232d3d] bg-[#121722] hover:border-[#3a4759]"
        }`}
        title={tr("mp.mediaHint")}
      >
        <div className="relative h-11 w-14 shrink-0 overflow-hidden rounded bg-[#0a0d14]">
          {m.thumbnail ? (
            <img src={m.thumbnail} alt="" className="h-full w-full object-cover" />
          ) : m.kind === "audio" ? (
            <Music2 className="absolute inset-0 m-auto h-4 w-4 text-amber-500/70" />
          ) : (
            <ImageIcon className="absolute inset-0 m-auto h-4 w-4 text-zinc-600" />
          )}
          {/* prévia de vídeo: passe o mouse e toca (mudo, em loop) — ANTES de colocar na timeline */}
          {m.kind === "video" && !m.missing && <LocalHoverVideo mediaId={m.id} />}
          {m.missing && <FileWarning className="absolute inset-0 m-auto h-4 w-4 text-red-500" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-zinc-300">{m.name}</p>
          <div className="flex items-center gap-1.5">
            <p className="text-[9px] text-zinc-500">
              {tr(m.kind === "image" ? "mp.image" : m.kind === "video" ? "mp.video" : "mp.audio")}
              {m.kind !== "image" && ` · ${fmtDur(m.duration)}`}
            </p>
            {licStyle && (
              <span className={`rounded border px-1 text-[8px] leading-[13px] ${licStyle.cls}`} title={licStyle.title}>
                {licStyle.label}
              </span>
            )}
            {m.missing && <span className="text-[9px] text-red-400">{tr("mp.missing")}</span>}
            {m.decodeError && !m.missing && (
              <span className="text-[9px] text-amber-400" title={tr("mp.decodeErrorHint")}>
                {tr("mp.decodeError")}
              </span>
            )}
          </div>
        </div>
        {m.missing ? (
          <label className="cursor-pointer rounded p-1 text-[10px] text-red-400 hover:bg-red-500/10">
            <input
              type="file"
              className="hidden"
              accept="video/*,audio/*,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onRelink(f);
              }}
            />
            {tr("mp.reimport")}
          </label>
        ) : (
          <>
            {(m.kind === "video" || m.kind === "audio") && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-zinc-400 opacity-0 transition group-hover:opacity-100 hover:bg[var(--gc-accent-10)] hover:text-[var(--gc-accent)]"
                onClick={(e) => {
                  e.stopPropagation();
                  if (url) openPlayer({ id: m.id, title: m.name, url, kind: m.kind === "audio" ? "audio" : "video", thumb: m.thumbnail });
                }}
                aria-label={tr("mp.listen")}
                title={tr("mp.listenHint")}
              >
                <PlayIcon className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-[var(--gc-accent)] hover:bg[var(--gc-accent-10)]"
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
              }}
              aria-label={tr("mp.addToTimeline")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              aria-label={tr("mp.removeMedia")}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </div>
    </FloatMenu>
  );
}

/** Prévia de vídeo da aba Mídia: hover 350ms → <video> mudo em loop sobre a miniatura. */
function LocalHoverVideo({ mediaId }: { mediaId: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (!active) {
      const v = hostRef.current?.querySelector("video");
      if (v) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
      hostRef.current?.replaceChildren();
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      const url = registry.getUrl(mediaId);
      if (cancelled || !url || !hostRef.current) return;
      const v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = "auto";
      v.className = "absolute inset-0 h-full w-full bg-black object-cover";
      v.src = url;
      void v.play().catch(() => undefined);
      hostRef.current.replaceChildren(v);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [active, mediaId]);
  return <div ref={hostRef} className="absolute inset-0" onMouseEnter={() => setActive(true)} onMouseLeave={() => setActive(false)} aria-hidden />;
}
