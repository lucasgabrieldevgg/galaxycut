// GalaxyCut — painel esquerdo: mídia (com pastas, recortar/copiar/colar, gravação de voz!), texto/legendas e busca online
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useProject, usePlayback } from "@/lib/editor/store";
import { registry } from "@/lib/editor/media";
import { isDesktopBuild } from "@/lib/editor/desktop";
import { useSubtitleJob } from "@/lib/editor/subtitles";
import {
  CAPTION_PRESETS,
  LICENSE_STYLE,
  licenseLevel,
  MediaFolder,
  MediaMeta,
  EFFECT_CATALOG,
  EffectMeta,
  ANIMATIONS_IN,
  ANIMATIONS_OUT,
  ANIMATIONS_COMBO,
  AnimationInType,
  AnimationOutType,
  AnimationComboType,
  ClipEffect,
  uid,
} from "@/lib/editor/types";
import { gcDrag } from "@/lib/editor/dnd";
import { useLibPlayer } from "@/lib/editor/libPlayer";
import { toast } from "sonner";
import {
  Upload, FolderOpen, FolderPlus, Folder, ChevronRight, ArrowLeft, Trash2, Plus, Type, Sparkles,
  Search, Film, ImageIcon, Music2, FileWarning, Loader2, PlusCircle, Mic, Play as PlayIcon,
  Scissors, Copy, ClipboardPaste, MoreVertical, Pencil, Check, X, Wand2,
} from "lucide-react";
import { SubtitleDialog } from "./SubtitleDialog";
import { StockSearch } from "./StockSearch";
import { LibraryPlayerBar } from "./LibraryPlayerBar";
import { RecordDialog } from "./RecordDialog";
import { FloatMenu, MenuItem } from "./ClipMenu";
import { useT, t as tr } from "@/lib/editor/i18n";
import { PresetPreview } from "./PresetPreview";

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
  const folders = useProject((s) => s.folders);
  const addMedia = useProject((s) => s.addMedia);
  const removeMedia = useProject((s) => s.removeMedia);
  const relinkMedia = useProject((s) => s.relinkMedia);
  const addClipFromMedia = useProject((s) => s.addClipFromMedia);
  const addTextClip = useProject((s) => s.addTextClip);
  const createFolder = useProject((s) => s.createFolder);
  const renameFolder = useProject((s) => s.renameFolder);
  const deleteFolder = useProject((s) => s.deleteFolder);
  const moveMediaToFolder = useProject((s) => s.moveMediaToFolder);
  const mediaClipboard = useProject((s) => s.mediaClipboard);
  const cutMedia = useProject((s) => s.cutMedia);
  const copyMedia = useProject((s) => s.copyMedia);
  const pasteMedia = useProject((s) => s.pasteMedia);
  const clearMediaClipboard = useProject((s) => s.clearMediaClipboard);

  const playhead = usePlayback((s) => s.playhead);
  const [importing, setImporting] = useState(0);
  const [confirmRemove, setConfirmRemove] = useState<MediaMeta | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<MediaFolder | null>(null);

  /** navegação de pastas: null = raiz */
  const currentFolderId = useProject((s) => s.currentFolderId);
  const setCurrentFolderId = useProject((s) => s.setCurrentFolderId);
  const [activeTab, setActiveTab] = useState("media");

  useEffect(() => {
    const handleNav = (e: any) => {
      setActiveTab("media");
      if (e.detail?.folderId !== undefined) {
        setCurrentFolderId(e.detail.folderId);
      }
    };
    window.addEventListener("galaxiacut:navmedia", handleNav);
    return () => window.removeEventListener("galaxiacut:navmedia", handleNav);
  }, [setCurrentFolderId]);
  /** diálogo de criar pasta */
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  /** renomeando pasta */
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renamingFolderName, setRenamingFolderName] = useState("");

  /** mídia selecionada no painel (o Delete do teclado apaga ela) */
  const [selMedia, setSelMedia] = useState<string | null>(null);
  /** filtro da aba Mídia: tudo/vídeos/áudios/imagens */
  const [kindFilter, setKindFilter] = useState<"all" | "video" | "audio" | "image">("all");
  const [effectSearch, setEffectSearch] = useState("");
  const [effectCategory, setEffectCategory] = useState<"all" | "motion" | "retro" | "light" | "stylize">("all");
  const [recordOpen, setRecordOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const applyEffectToSelection = (meta: EffectMeta) => {
    const st = useProject.getState();
    const selId = st.selectedId;
    let target = st.clips.find((c) => c.id === selId);
    if (!target || target.kind === "audio") {
      const pb = usePlayback.getState().playhead;
      target = st.clips.find(
        (c) => c.start <= pb + 0.001 && c.start + c.duration > pb - 0.001 && c.kind !== "audio"
      );
    }
    if (!target) {
      toast.info("Selecione um clipe de vídeo, imagem ou texto na linha do tempo.");
      return;
    }
    st.addClipEffect(target.id, {
      id: uid(),
      type: meta.type,
      enabled: true,
      intensity: meta.defaultIntensity,
      speed: 1,
    });
    engine.markDirty();
    toast.success(`Efeito "${meta.name}" aplicado!`);
  };

  const applyAnimationToSelection = (type: string, kind: "in" | "out" | "combo") => {
    const st = useProject.getState();
    const selId = st.selectedId;
    let target = st.clips.find((c) => c.id === selId);
    if (!target || target.kind === "audio") {
      const pb = usePlayback.getState().playhead;
      target = st.clips.find(
        (c) => c.start <= pb + 0.001 && c.start + c.duration > pb - 0.001 && c.kind !== "audio"
      );
    }
    if (!target) {
      toast.info("Selecione um clipe na linha do tempo para aplicar a animação.");
      return;
    }
    const anim = target.animation || {};
    if (kind === "in") {
      st.setClipAnimation(target.id, { ...anim, inType: type as AnimationInType, inDuration: anim.inDuration ?? 0.5 });
    } else if (kind === "out") {
      st.setClipAnimation(target.id, { ...anim, outType: type as AnimationOutType, outDuration: anim.outDuration ?? 0.5 });
    } else {
      st.setClipAnimation(target.id, { ...anim, comboType: type as AnimationComboType, comboSpeed: anim.comboSpeed ?? 1 });
    }
    engine.markDirty();
    toast.success("Animação aplicada no clipe!");
  };

  const currentFolder = useMemo(
    () => folders.find((f) => f.id === currentFolderId) ?? null,
    [folders, currentFolderId]
  );

  // se a pasta atual for excluída, volta pra raiz
  useEffect(() => {
    if (currentFolderId && !folders.some((f) => f.id === currentFolderId)) {
      setCurrentFolderId(null);
    }
  }, [folders, currentFolderId]);

  /** Remove mídia — pede confirmação quando ela tá sendo usada na timeline */
  function askRemove(m: MediaMeta) {
    const used = useProject.getState().clips.filter((c) => c.mediaId === m.id).length;
    if (used > 0) setConfirmRemove(m);
    else removeMedia(m.id);
  }

  // atalhos de teclado (Delete, Ctrl+C, Ctrl+X, Ctrl+V) no painel de mídia
  useEffect(() => {
    const del = () => {
      if (!selMedia) return;
      const m = useProject.getState().media.find((x) => x.id === selMedia);
      if (m) askRemove(m);
    };
    window.addEventListener("galaxiacut:delmedia", del);
    return () => window.removeEventListener("galaxiacut:delmedia", del);
  }, [selMedia]);

  async function handleFiles(files: FileList | File[], targetFolderId: string | null = currentFolderId) {
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
        addMedia({ ...meta, folderId: targetFolderId });
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

  /** Upload de PASTA inteira: cria a pasta correspondente e guarda os arquivos dentro dela */
  async function handleFolderUpload(files: FileList | File[]) {
    const arr = Array.from(files).filter(
      (f) => /^(video|audio|image)\//.test(f.type) || /\.(mp4|webm|mov|mkv|m4v|avi|png|jpe?g|webp|gif|avif|bmp|mp3|wav|ogg|m4a|aac|flac|opus)$/i.test(f.name)
    );
    if (!arr.length) {
      toast.info(t("mp.noFiles"));
      return;
    }

    // agrupa por subpastas relativas
    const folderMap = new Map<string, File[]>();
    for (const f of arr) {
      const relPath = (f as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      const parts = relPath.split("/").filter(Boolean);
      const topDir = parts.length > 1 ? parts[0] : "Nova pasta";
      if (!folderMap.has(topDir)) folderMap.set(topDir, []);
      folderMap.get(topDir)!.push(f);
    }

    for (const [folderName, folderFiles] of folderMap) {
      // cria a pasta no nível atual
      const created = createFolder(folderName, currentFolderId);
      await handleFiles(folderFiles, created.id);
      toast.success(t("mp.folderImported", { name: folderName, n: folderFiles.length }));
      // entra na pasta recém-importada
      setCurrentFolderId(created.id);
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

  function handleCreateFolder() {
    if (!newFolderName.trim()) return;
    const f = createFolder(newFolderName.trim(), currentFolderId);
    setNewFolderName("");
    setNewFolderOpen(false);
    toast.success(t("mp.newFolder") + `: ${f.name}`);
  }

  function handleRenameFolder() {
    if (renamingFolderId && renamingFolderName.trim()) {
      renameFolder(renamingFolderId, renamingFolderName.trim());
      setRenamingFolderId(null);
      setRenamingFolderName("");
      toast.success(t("mp.renameFolder"));
    }
  }

  function handlePaste() {
    const res = pasteMedia(currentFolderId);
    if (res) {
      toast.success(t("mp.pasted") + `: ${res.name}`);
    }
  }

  // pastas e mídias do nível atual
  const currentFolders = useMemo(
    () => folders.filter((f) => (f.parentId ?? null) === currentFolderId),
    [folders, currentFolderId]
  );

  const currentMedia = useMemo(() => {
    let list = media.filter((m) => (m.folderId ?? null) === currentFolderId);
    if (kindFilter !== "all") list = list.filter((m) => m.kind === kindFilter);
    return list;
  }, [media, currentFolderId, kindFilter]);

  const job = useSubtitleJob();

  return (
    <div className="flex h-full flex-col bg-[#0c1017]">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="shrink-0 border-b border-[#1c2430] px-2 pt-2">
          <TabsList className="grid h-8 w-full grid-cols-5 bg-[#151b26]">
            <TabsTrigger value="media" className="h-7 gap-0.5 px-1 text-[10px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-zinc-100" title={t("mp.media")}>
              <Film className="h-3 w-3" /> {t("mp.media")}
            </TabsTrigger>
            <TabsTrigger value="effects" className="h-7 gap-0.5 px-1 text-[10px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-emerald-300" title={t("mp.effects")}>
              <Sparkles className="h-3 w-3 text-emerald-400" /> {t("mp.effects")}
            </TabsTrigger>
            <TabsTrigger value="animations" className="h-7 gap-0.5 px-1 text-[10px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-violet-300" title={t("mp.animations")}>
              <Wand2 className="h-3 w-3 text-violet-400" /> {t("mp.animations")}
            </TabsTrigger>
            <TabsTrigger value="text" className="h-7 gap-0.5 px-1 text-[10px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-zinc-100" title={t("mp.text")}>
              <Type className="h-3 w-3" /> {t("mp.text")}
            </TabsTrigger>
            <TabsTrigger value="stock" className="h-7 gap-0.5 px-1 text-[10px] text-zinc-400 data-[state=active]:bg-[#232d3d] data-[state=active]:text-zinc-100" title={t("mp.search")}>
              <Search className="h-3 w-3" /> {t("mp.search")}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ---------- MÍDIA ---------- */}
        <TabsContent value="media" className="min-h-0 flex-1 overflow-hidden pt-0">
          <div className="flex h-full min-h-0 flex-col">
            {/* botões de importação e gravação */}
            <div className="grid shrink-0 grid-cols-[1fr_auto_auto] gap-1.5 p-2.5">
              <button
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
                }}
                className="flex w-full flex-col items-center gap-1 rounded-lg border border-dashed border-[#2a3546] bg-[#0e1320] px-3 py-3 text-zinc-500 transition hover:border[var(--gc-accent-60)] hover:text-[var(--gc-accent)]"
              >
                {importing > 0 ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
                <span className="text-xs font-medium">{t("mp.importFiles")}</span>
                <span className="text-[10px] text-zinc-600">{t("mp.clickOrDrag")}</span>
              </button>
              <button
                onClick={() => folderRef.current?.click()}
                title={t("mp.importFolderHint")}
                className="flex w-[74px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#2a3546] bg-[#0e1320] px-1 py-3 text-zinc-500 transition hover:border[var(--gc-accent-60)] hover:text-[var(--gc-accent)]"
              >
                <FolderOpen className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-tight text-center">{t("mp.importFolder").split(" ")[0]}<br />{t("mp.importFolder").split(" ").slice(1).join(" ")}</span>
              </button>
              <button
                onClick={() => setRecordOpen(true)}
                title={t("mp.recordHint")}
                className="flex w-[74px] flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[#2a3546] bg-[#0e1320] px-1 py-3 text-zinc-500 transition hover:border-red-400/60 hover:text-red-400"
              >
                <Mic className="h-5 w-5" />
                <span className="text-[10px] font-medium leading-tight text-center">{t("mp.record").split(" ")[0]}<br />{t("mp.record").split(" ").slice(1).join(" ")}</span>
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
                // @ts-expect-error atributo webkitdirectory para pastas
                webkitdirectory=""
                directory=""
                onChange={(e) => {
                  if (e.target.files?.length) void handleFolderUpload(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {/* barra de navegação de pastas + botão nova pasta + colar */}
            <div className="flex shrink-0 items-center justify-between gap-1.5 border-b border-[#1c2430] bg-[#0e1320] px-2.5 py-1.5">
              <div className="flex min-w-0 items-center gap-1">
                {currentFolderId !== null ? (
                  <button
                    onClick={() => setCurrentFolderId(currentFolder?.parentId ?? null)}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold text-[var(--gc-accent)] transition hover:bg[var(--gc-accent-10)]"
                    title={t("mp.back")}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    <span>{t("mp.back")}</span>
                  </button>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-medium text-zinc-400">
                    <Folder className="h-3.5 w-3.5 text-zinc-500" />
                    <span>{t("mp.root")}</span>
                  </span>
                )}
                {currentFolder && (
                  <div className="flex min-w-0 items-center gap-1 text-xs text-zinc-300">
                    <ChevronRight className="h-3 w-3 shrink-0 text-zinc-600" />
                    <span className="truncate font-semibold text-zinc-200" title={currentFolder.name}>
                      {currentFolder.name}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {/* botão criar pasta */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewFolderOpen(true)}
                  className="h-7 gap-1 px-2 text-[11px] text-zinc-300 hover:bg-[#1c2430] hover:text-zinc-100"
                  title={t("mp.createFolder")}
                >
                  <FolderPlus className="h-3.5 w-3.5 text-[var(--gc-accent)]" />
                  <span>{t("mp.newFolder")}</span>
                </Button>

                {/* botão colar se houver item no clipboard */}
                {mediaClipboard && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handlePaste}
                    className="h-7 gap-1 border border[var(--gc-accent-40)] bg[var(--gc-accent-10)] px-2 text-[11px] font-semibold text-[var(--gc-accent)] hover:bg[var(--gc-accent-20)]"
                    title={t("mp.paste")}
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" />
                    <span>{t("mp.paste")} ({mediaClipboard.mode === "cut" ? t("mp.cut") : t("mp.copy")})</span>
                  </Button>
                )}
              </div>
            </div>

            {/* filtros: tudo / vídeos / áudios / imagens */}
            {media.length > 0 && (
              <div className="flex shrink-0 flex-wrap gap-1 px-2.5 py-1.5">
                {KIND_FILTERS.map((f) => {
                  const n = f.id === "all" ? media.length : media.filter((m) => m.kind === f.id).length;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setKindFilter(f.id)}
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                        kindFilter === f.id
                          ? "bg-[var(--gc-accent)] text-black"
                          : "bg-[#141a24] text-zinc-400 hover:bg-[#1c2430] hover:text-zinc-200"
                      }`}
                    >
                      {t(f.key)} ({n})
                    </button>
                  );
                })}
              </div>
            )}

            {/* lista de pastas e mídias do diretório atual */}
            <ScrollArea className="min-h-0 flex-1 px-2.5 pb-2">
              <div className="space-y-1 pt-1">
                {/* pastas do nível atual */}
                {currentFolders.map((folder) => {
                  const itemCount = media.filter((m) => m.folderId === folder.id).length;
                  const isRenaming = renamingFolderId === folder.id;
                  return (
                    <div
                      key={folder.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.add("border-[var(--gc-accent)]", "bg[var(--gc-accent-10)]");
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove("border-[var(--gc-accent)]", "bg[var(--gc-accent-10)]");
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove("border-[var(--gc-accent)]", "bg[var(--gc-accent-10)]");
                        const mediaId = e.dataTransfer.getData(MEDIA_DND_TYPE) || e.dataTransfer.getData("text/plain");
                        if (mediaId) {
                          moveMediaToFolder([mediaId], folder.id);
                          toast.success(t("mp.pasted") + `: ${folder.name}`);
                        }
                      }}
                      onClick={() => {
                        if (!isRenaming) setCurrentFolderId(folder.id);
                      }}
                      className="group flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-[#232d3d] bg-[#121722] p-2 transition hover:border-[#3a4759] hover:bg-[#161d2b]"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <Folder className="h-4 w-4 shrink-0 text-amber-400" />
                        {isRenaming ? (
                          <div className="flex flex-1 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <Input
                              autoFocus
                              value={renamingFolderName}
                              onChange={(e) => setRenamingFolderName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameFolder();
                                if (e.key === "Escape") setRenamingFolderId(null);
                              }}
                              className="h-6 border-[#2a3546] bg-[#0e1320] px-1.5 text-xs text-zinc-100"
                            />
                            <button onClick={handleRenameFolder} className="p-1 text-[var(--gc-accent)] hover:bg[var(--gc-accent-10)]">
                              <Check className="h-3 w-3" />
                            </button>
                            <button onClick={() => setRenamingFolderId(null)} className="p-1 text-zinc-500 hover:bg-[#1c2430]">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[12px] font-semibold text-zinc-200">{folder.name}</p>
                            <p className="text-[9px] text-zinc-500">{itemCount} {t("mp.itemsCount", { n: itemCount })}</p>
                          </div>
                        )}
                      </div>

                      {!isRenaming && (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <FloatMenu
                            items={[
                              {
                                label: tr("mp.renameFolder"),
                                icon: <Pencil className="h-3.5 w-3.5" />,
                                onClick: () => {
                                  setRenamingFolderId(folder.id);
                                  setRenamingFolderName(folder.name);
                                },
                              },
                              { type: "sep" },
                              {
                                label: tr("mp.deleteFolder"),
                                icon: <Trash2 className="h-3.5 w-3.5" />,
                                danger: true,
                                onClick: () => setConfirmDeleteFolder(folder),
                              },
                            ]}
                          >
                            <button className="rounded p-1 text-zinc-500 opacity-0 transition group-hover:opacity-100 hover:bg-[#1c2430] hover:text-zinc-200">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </button>
                          </FloatMenu>
                          <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-zinc-300" />
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* mídias do nível atual */}
                {currentMedia.map((m) => {
                  const isCut = mediaClipboard?.mode === "cut" && mediaClipboard.mediaId === m.id;
                  return (
                    <MediaRow
                      key={m.id}
                      m={m}
                      sel={selMedia === m.id}
                      isCut={isCut}
                      onSelect={() => setSelMedia(m.id)}
                      onRemove={() => askRemove(m)}
                      onRelink={(f) => void relink(m.id, f)}
                      onAdd={() => {
                        const clip = addClipFromMedia(m.id);
                        if (clip) toast.success(t("mp.addedAt", { t: fmtDur(clip.start) }));
                      }}
                      onCut={() => {
                        cutMedia(m.id);
                        toast.info(t("mp.cutDone"));
                      }}
                      onCopy={() => {
                        copyMedia(m.id);
                        toast.info(t("mp.copyDone"));
                      }}
                    />
                  );
                })}

                {/* pasta vazia */}
                {currentFolders.length === 0 && currentMedia.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#1c2430] p-6 text-center text-zinc-600">
                    <p className="text-xs">{currentFolderId ? t("mp.emptyFolder") : t("mp.empty")}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* ---------- EFEITOS VISUAIS ---------- */}
        <TabsContent value="effects" className="min-h-0 flex-1 overflow-y-auto p-3 timeline-scroll">
          <div className="space-y-3">
            {/* Campo de busca de efeitos */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
              <Input
                placeholder="Buscar efeitos (tremor, vhs, glitch, luz...)"
                value={effectSearch}
                onChange={(e) => setEffectSearch(e.target.value)}
                className="h-8 pl-8 text-xs border-[#2a3546] bg-[#121722] text-zinc-200"
              />
            </div>

            {/* Categorias de filtro */}
            <div className="flex gap-1 overflow-x-auto pb-1 timeline-scroll">
              {[
                { id: "all", label: "Todos" },
                { id: "motion", label: "Impacto" },
                { id: "retro", label: "Retrô/VHS" },
                { id: "light", label: "Luz" },
                { id: "stylize", label: "Cinema" },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setEffectCategory(c.id as any)}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition whitespace-nowrap ${
                    effectCategory === c.id
                      ? "bg-emerald-600 text-white shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                      : "bg-[#151b26] text-zinc-400 hover:text-zinc-200 border border-[#232d3d]"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* Grid de Efeitos */}
            <div className="grid grid-cols-2 gap-2">
              {EFFECT_CATALOG
                .filter((e) => {
                  if (effectCategory !== "all" && e.category !== effectCategory) return false;
                  if (effectSearch.trim()) {
                    const q = effectSearch.toLowerCase();
                    return e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q);
                  }
                  return true;
                })
                .map((e) => (
                  <button
                    key={e.type}
                    type="button"
                    onClick={() => applyEffectToSelection(e)}
                    className="flex flex-col items-start p-2.5 rounded-lg border border-[#232d3d] bg-[#121722] hover:border-emerald-500/60 hover:bg-[#161f2e] transition text-left group"
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <span className="text-xl group-hover:scale-110 transition">{e.icon}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                        + Aplicar
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-zinc-200 leading-tight mb-0.5">{e.name}</span>
                    <span className="text-[10px] text-zinc-500 line-clamp-2 leading-tight">{e.description}</span>
                  </button>
                ))}
            </div>
          </div>
        </TabsContent>

        {/* ---------- ANIMAÇÕES (ENTRADA, SAÍDA, COMBO) ---------- */}
        <TabsContent value="animations" className="min-h-0 flex-1 overflow-y-auto p-3 timeline-scroll">
          <Tabs defaultValue="in" className="space-y-3">
            <TabsList className="grid grid-cols-3 h-7 bg-[#151b26] p-0.5">
              <TabsTrigger value="in" className="h-6 text-[10px] data-[state=active]:bg-violet-600/30 data-[state=active]:text-violet-300">
                Entrada (In)
              </TabsTrigger>
              <TabsTrigger value="out" className="h-6 text-[10px] data-[state=active]:bg-violet-600/30 data-[state=active]:text-violet-300">
                Saída (Out)
              </TabsTrigger>
              <TabsTrigger value="combo" className="h-6 text-[10px] data-[state=active]:bg-violet-600/30 data-[state=active]:text-violet-300">
                Combo / Loop
              </TabsTrigger>
            </TabsList>

            <TabsContent value="in" className="space-y-2">
              <p className="text-[10px] text-zinc-500 px-1">Clique para aplicar no clipe selecionado:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {ANIMATIONS_IN.filter((a) => a.type !== "none").map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => applyAnimationToSelection(item.type, "in")}
                    className="flex items-center gap-2 p-2 rounded-md border border-[#232d3d] bg-[#121722] hover:border-violet-500 hover:bg-[#1a172e] transition text-left"
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-[11px] font-medium text-zinc-200">{item.label}</span>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="out" className="space-y-2">
              <p className="text-[10px] text-zinc-500 px-1">Clique para aplicar no clipe selecionado:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {ANIMATIONS_OUT.filter((a) => a.type !== "none").map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => applyAnimationToSelection(item.type, "out")}
                    className="flex items-center gap-2 p-2 rounded-md border border-[#232d3d] bg-[#121722] hover:border-violet-500 hover:bg-[#1a172e] transition text-left"
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-[11px] font-medium text-zinc-200">{item.label}</span>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="combo" className="space-y-2">
              <p className="text-[10px] text-zinc-500 px-1">Clique para aplicar no clipe selecionado:</p>
              <div className="grid grid-cols-2 gap-1.5">
                {ANIMATIONS_COMBO.filter((a) => a.type !== "none").map((item) => (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => applyAnimationToSelection(item.type, "combo")}
                    className="flex items-center gap-2 p-2 rounded-md border border-[#232d3d] bg-[#121722] hover:border-violet-500 hover:bg-[#1a172e] transition text-left"
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span className="text-[11px] font-medium text-zinc-200">{item.label}</span>
                  </button>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>

        {/* ---------- TEXTO & LEGENDAS ---------- */}
        <TabsContent value="text" className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-4">
            <Button
              onClick={() => {
                addTextClip(playhead);
                toast.success(t("mp.textAdded"));
              }}
              className="w-full gap-2 bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
            >
              <Plus className="h-4 w-4" /> {t("mp.addText")}
            </Button>

            {/* legendas com IA */}
            <div className="space-y-2 rounded-xl border border-[#232d3d] bg-[#121722] p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">
                  <Sparkles className="h-3.5 w-3.5 text-[var(--gc-accent)]" /> {t("mp.autoSubs")}
                </span>
                <Button
                  size="sm"
                  onClick={() => job.setOpen(true)}
                  className="h-7 bg-[var(--gc-accent)] px-2.5 text-xs font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
                >
                  {t("tb.export").slice(0, 0) || "Gerar"}
                </Button>
              </div>
              <p className="text-[10px] leading-relaxed text-zinc-400">
                {isDesktopBuild() ? t("mp.subsNoteApp") : t("mp.subsNoteApp")}
              </p>
            </div>

            {/* presets de legenda */}
            <div>
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
                    <PresetPreview tp={p.props} />
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

      {/* modal nova pasta */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="border-[#232d3d] bg-[#121722] text-zinc-200">
          <DialogHeader>
            <DialogTitle>{t("mp.newFolder")}</DialogTitle>
            <DialogDescription>{t("mp.createFolder")}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              placeholder={t("mp.folderName")}
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFolder();
              }}
              className="border-[#2a3546] bg-[#0e1320] text-zinc-100"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFolderOpen(false)} className="border-[#2a3546] bg-transparent text-zinc-300">
              {t("misc.cancel")}
            </Button>
            <Button onClick={handleCreateFolder} className="bg-[var(--gc-accent)] font-semibold text-black hover:bg-[var(--gc-accent-hover)]">
              {t("mp.createFolder")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* confirmação de exclusão de pasta */}
      <AlertDialog open={!!confirmDeleteFolder} onOpenChange={(v) => !v && setConfirmDeleteFolder(null)}>
        <AlertDialogContent className="border-[#232d3d] bg-[#121722] text-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("mp.deleteFolderTitle", { name: confirmDeleteFolder?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("mp.deleteFolderHint")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[#2a3546] bg-transparent text-zinc-300 hover:bg-[#1c2430]">{t("misc.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-500"
              onClick={() => {
                if (confirmDeleteFolder) {
                  deleteFolder(confirmDeleteFolder.id);
                  toast.success(t("mp.deleteFolder"));
                }
                setConfirmDeleteFolder(null);
              }}
            >
              {t("misc.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
  isCut,
  onSelect,
  onRemove,
  onRelink,
  onAdd,
  onCut,
  onCopy,
}: {
  m: MediaMeta;
  sel: boolean;
  isCut?: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRelink: (f: File) => void;
  onAdd: () => void;
  onCut: () => void;
  onCopy: () => void;
}) {
  const openPlayer = useLibPlayer((s) => s.open);
  const lic = m.source === "stock" ? licenseLevel(m.license) : null;
  const licStyle = lic ? LICENSE_STYLE[lic] : null;
  const url = registry.getUrl(m.id);

  const items: MenuItem[] = [
    { label: tr("mp.addToTimeline"), icon: <PlusCircle className="h-3.5 w-3.5 text-[var(--gc-accent)]" />, onClick: onAdd },
    { label: tr("mp.cut"), icon: <Scissors className="h-3.5 w-3.5" />, onClick: onCut },
    { label: tr("mp.copy"), icon: <Copy className="h-3.5 w-3.5" />, onClick: onCopy },
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
          gcDrag.begin(m.id);
        }}
        onDragEnd={() => gcDrag.end()}
        className={`group flex cursor-grab items-center gap-2 rounded-lg border p-1.5 transition active:cursor-grabbing ${
          isCut
            ? "opacity-40 border-dashed border-amber-500/50 bg-[#121722]"
            : sel
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
