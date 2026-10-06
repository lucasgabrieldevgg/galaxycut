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
import { engine } from "@/lib/editor/playback";
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
  makeClip,
  defaultTextProps,
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
import { ConvertMediaDialog } from "./ConvertMediaDialog";
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

  /** drag & drop de arquivos e pastas no painel */
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [detectedFolder, setDetectedFolder] = useState<string | null>(null);
  const dragCounter = useRef(0);

  /** mídia selecionada no painel */
  const [selMedia, setSelMedia] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "video" | "audio" | "image">("all");
  const [effectSearch, setEffectSearch] = useState("");
  const [effectCategory, setEffectCategory] = useState<"all" | "motion" | "retro" | "light" | "stylize">("all");
  const [recordOpen, setRecordOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [convertMediaList, setConvertMediaList] = useState<MediaMeta[]>([]);
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

  useEffect(() => {
    if (currentFolderId && !folders.some((f) => f.id === currentFolderId)) {
      setCurrentFolderId(null);
    }
  }, [folders, currentFolderId]);

  function askRemove(m: MediaMeta) {
    const used = useProject.getState().clips.filter((c) => c.mediaId === m.id).length;
    if (used > 0) setConfirmRemove(m);
    else removeMedia(m.id);
  }

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
    const rawArr = Array.from(files);
    if (!rawArr.length) return;

    setImporting((prev) => prev + rawArr.length);
    let ok = 0;
    let fail = 0;
    const importedVideos: MediaMeta[] = [];

    for (const f of rawArr) {
      try {
        const meta = await registry.importFile(f);
        addMedia({ ...meta, folderId: targetFolderId });
        if (meta.kind === "video") {
          importedVideos.push(meta);
        }
        ok++;
      } catch (e) {
        fail++;
        console.error("import file error:", e);
      } finally {
        setImporting((n) => Math.max(0, n - 1));
      }
    }
    if (ok > 0) {
      toast.success(
        fail > 0
          ? t("mp.importedPartial", { ok, n: rawArr.length, fail })
          : t("mp.importedN", { n: ok })
      );

      // Se vídeos que NÃO são MP4 foram importados (ex: MKV, AVI, MOV, WMV, etc.),
      // pergunta se deseja converter para MP4 para máxima compatibilidade
      const nonMp4Videos = importedVideos.filter((m) => {
        const ext = (m.name.split(".").pop() || "").toLowerCase().trim();
        return ext !== "mp4";
      });

      if (nonMp4Videos.length > 0) {
        setConvertMediaList(nonMp4Videos);
        setConvertDialogOpen(true);
      }
    }
  }

  async function handleFolderUpload(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;

    const folderMap = new Map<string, File[]>();
    for (const f of arr) {
      const relPath = (f as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      const parts = relPath.split("/").filter(Boolean);
      const topDir = parts.length > 1 ? parts[0] : "Nova pasta";
      if (!folderMap.has(topDir)) folderMap.set(topDir, []);
      folderMap.get(topDir)!.push(f);
    }

    for (const [folderName, folderFiles] of folderMap) {
      const created = createFolder(folderName, currentFolderId);
      await handleFiles(folderFiles, created.id);
      toast.success(t("mp.folderImported", { name: folderName, n: folderFiles.length }));
      setCurrentFolderId(created.id);
    }
  }

  async function scanEntry(entry: any, currentPath: string[]): Promise<{ file: File; folderPath: string[] }[]> {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file(
          (file: File) => resolve([{ file, folderPath: currentPath }]),
          () => resolve([])
        );
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const newPath = [...currentPath, entry.name];
      const readSubEntries = (): Promise<any[]> => {
        return new Promise((resolve) => {
          dirReader.readEntries(
            (results: any[]) => {
              if (!results || !results.length) resolve([]);
              else {
                readSubEntries().then((more) => resolve([...results, ...more]));
              }
            },
            () => resolve([])
          );
        });
      };
      const subEntries = await readSubEntries();
      const nested = await Promise.all(subEntries.map((sub) => scanEntry(sub, newPath)));
      return nested.flat();
    }
    return [];
  }

  async function handlePanelDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDraggingOver(false);
    setDetectedFolder(null);

    const isInternalMedia = e.dataTransfer.types.includes(MEDIA_DND_TYPE);
    if (isInternalMedia) return;

    const items = e.dataTransfer.items;
    const scanned: { file: File; folderPath: string[] }[] = [];
    const detectedFoldersList: string[] = [];

    if (items && items.length > 0) {
      const promises: Promise<{ file: File; folderPath: string[] }[]>[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== "file") continue;
        if (typeof item.webkitGetAsEntry === "function") {
          const entry = item.webkitGetAsEntry();
          if (entry) {
            if (entry.isDirectory) {
              detectedFoldersList.push(entry.name);
            }
            promises.push(scanEntry(entry, []));
            continue;
          }
        }
        const file = item.getAsFile();
        if (file) {
          promises.push(Promise.resolve([{ file, folderPath: [] }]));
        }
      }
      if (promises.length > 0) {
        const res = await Promise.all(promises);
        scanned.push(...res.flat());
      }
    }

    if (!scanned.length && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const f = e.dataTransfer.files[i];
        if (f) scanned.push({ file: f, folderPath: [] });
      }
    }

    if (!scanned.length) return;

    const folderCache = new Map<string, string>();
    const getTargetFolderId = (pathArr: string[]): string | null => {
      if (!pathArr.length) return currentFolderId;
      let parentId = currentFolderId;
      let acc = "";
      for (const seg of pathArr) {
        acc = acc ? `${acc}/${seg}` : seg;
        if (folderCache.has(acc)) {
          parentId = folderCache.get(acc)!;
        } else {
          const existing = useProject.getState().folders.find((f) => f.name === seg && (f.parentId ?? null) === parentId);
          if (existing) {
            parentId = existing.id;
            folderCache.set(acc, existing.id);
          } else {
            const created = useProject.getState().createFolder(seg, parentId);
            parentId = created.id;
            folderCache.set(acc, created.id);
          }
        }
      }
      return parentId;
    };

    const byFolder = new Map<string | null, File[]>();
    for (const item of scanned) {
      const fid = getTargetFolderId(item.folderPath);
      if (!byFolder.has(fid)) byFolder.set(fid, []);
      byFolder.get(fid)!.push(item.file);
    }

    for (const [fid, files] of byFolder) {
      await handleFiles(files, fid);
    }

    if (detectedFoldersList.length > 0) {
      toast.success(`Pasta(s) "${detectedFoldersList.join(", ")}" importada(s) com sucesso!`);
      const firstId = folderCache.get(detectedFoldersList[0]);
      if (firstId) setCurrentFolderId(firstId);
    }
  }

  function handlePanelDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDraggingOver(true);
    }
  }

  function handlePanelDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setIsDraggingOver(false);
      setDetectedFolder(null);
      dragCounter.current = 0;
    }
  }

  function handlePanelDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    createFolder(name, currentFolderId);
    setNewFolderName("");
    setNewFolderOpen(false);
  }

  function handleRenameFolder(id: string) {
    const name = renamingFolderName.trim();
    if (!name) return;
    renameFolder(id, name);
    setRenamingFolderId(null);
    setRenamingFolderName("");
  }

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
        <TabsContent
          value="media"
          className="relative min-h-0 flex-1 overflow-hidden pt-0"
          onDragEnter={handlePanelDragEnter}
          onDragLeave={handlePanelDragLeave}
          onDragOver={handlePanelDragOver}
          onDrop={handlePanelDrop}
        >
          {/* Overlay de Dropzone */}
          {isDraggingOver && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#090d14]/95 p-6 backdrop-blur-sm border-2 border-dashed border-[var(--gc-accent)] rounded-lg text-center animate-in fade-in zoom-in-95 pointer-events-none">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--gc-accent-10)] text-[var(--gc-accent)] shadow-[0_0_24px_var(--gc-accent-30)] mb-3 animate-bounce">
                {detectedFolder ? <FolderOpen className="h-8 w-8 text-[var(--gc-accent)]" /> : <Upload className="h-8 w-8 text-[var(--gc-accent)]" />}
              </div>
              <h3 className="text-sm font-semibold text-zinc-100">
                {detectedFolder ? `Solte para importar a pasta "${detectedFolder}"!` : "Solte seus arquivos ou pastas aqui!"}
              </h3>
              <p className="mt-1 text-xs text-zinc-400 max-w-[260px] leading-relaxed">
                {detectedFolder
                  ? "As pastas serão criadas e todo o conteúdo será organizado automaticamente dentro do projeto."
                  : "Arquivos e pastas serão importados e organizados automaticamente na mídia."}
              </p>
              <div className="mt-3 flex items-center gap-1.5 rounded-full border border-[var(--gc-accent-30)] bg-[var(--gc-accent-10)] px-3 py-1 text-[11px] font-medium text-[var(--gc-accent)]">
                <Sparkles className="h-3.5 w-3.5" />
                <span>Importação inteligente com pastas</span>
              </div>
            </div>
          )}

          <div className="flex h-full min-h-0 flex-col">
            {/* botões de importação e gravação */}
            <div className="grid shrink-0 grid-cols-[1fr_auto_auto] gap-1.5 p-2.5">
              <button
                onClick={() => fileRef.current?.click()}
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
                <span className="text-[10px] font-medium leading-tight text-center">{t("mp.recordVoice").split(" ")[0]}<br />{t("mp.recordVoice").split(" ").slice(1).join(" ")}</span>
              </button>
            </div>

            <input
              ref={fileRef}
              type="file"
              multiple
              accept="video/*,audio/*,image/*,.mp4,.webm,.mov,.mkv,.m4v,.avi,.wmv,.flv,.ts,.mts,.m2ts,.vob,.ogv,.3gp,.3g2,.mpg,.mpeg,.mpe,.mpv,.m2v,.mxf,.rm,.rmvb,.asf,.f4v,.divx,.xvid,.y4m,.nut,.png,.jpg,.jpeg,.jfif,.jpe,.jif,.jfi,.webp,.gif,.avif,.bmp,.dib,.svg,.svgz,.ico,.tiff,.tif,.heic,.heif,.raw,.cr2,.nef,.arw,.dng,.psd,.ai,.eps,.hdr,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.opus,.wma,.aiff,.aif,.aifc,.alac,.caf,.mka,.ac3,.dts,.amr,.mid,.midi,*"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <input
              ref={folderRef}
              type="file"
              // @ts-expect-error webkitdirectory é padrão em navegadores modernos
              webkitdirectory=""
              directory=""
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleFolderUpload(e.target.files);
                e.target.value = "";
              }}
            />

            {/* Barra de ferramentas: filtros por tipo e nova pasta */}
            <div className="flex shrink-0 items-center justify-between gap-1 border-b border-[#1c2430] px-2.5 pb-2">
              <div className="flex items-center gap-0.5 rounded-md bg-[#151b26] p-0.5">
                {KIND_FILTERS.map((kf) => (
                  <button
                    key={kf.id}
                    onClick={() => setKindFilter(kf.id)}
                    className={`rounded px-1.5 py-0.5 text-[10px] transition ${
                      kindFilter === kf.id
                        ? "bg-[#232d3d] font-semibold text-zinc-100"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    {t(kf.key)}
                  </button>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewFolderOpen(true)}
                className="h-6 gap-1 px-1.5 text-[10px] text-zinc-400 hover:text-[var(--gc-accent)]"
              >
                <FolderPlus className="h-3 w-3" /> {t("mp.newFolder")}
              </Button>
            </div>

            {/* Navegação de Pastas (Breadcrumbs) */}
            {currentFolder && (
              <div className="flex shrink-0 items-center gap-1 border-b border-[#1c2430] bg-[#10151f] px-2.5 py-1 text-xs">
                <button
                  onClick={() => setCurrentFolderId(currentFolder.parentId ?? null)}
                  className="flex items-center gap-1 text-[11px] text-zinc-400 transition hover:text-zinc-200"
                  title="Voltar"
                >
                  <ArrowLeft className="h-3 w-3" />
                </button>
                <span className="text-[11px] text-zinc-500">/</span>
                <span className="truncate text-[11px] font-semibold text-zinc-200">
                  {currentFolder.name}
                </span>
              </div>
            )}

            {/* Grid de Mídias e Pastas */}
            <ScrollArea className="min-h-0 flex-1 p-2.5">
              {/* Pastas */}
              {folders
                .filter((f) => (f.parentId ?? null) === currentFolderId)
                .map((folder) => (
                  <div
                    key={folder.id}
                    onDoubleClick={() => setCurrentFolderId(folder.id)}
                    className="group mb-1.5 flex items-center justify-between rounded-lg border border-[#1e2633] bg-[#121722] p-2 transition hover:border-[#2f3b4f] hover:bg-[#161c2a]"
                  >
                    {renamingFolderId === folder.id ? (
                      <div className="flex flex-1 items-center gap-1">
                        <Input
                          value={renamingFolderName}
                          onChange={(e) => setRenamingFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleRenameFolder(folder.id);
                            if (e.key === "Escape") setRenamingFolderId(null);
                          }}
                          autoFocus
                          className="h-6 text-xs"
                        />
                        <button onClick={() => handleRenameFolder(folder.id)} className="text-emerald-400">
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => setRenamingFolderId(null)} className="text-zinc-500">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => setCurrentFolderId(folder.id)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <Folder className="h-4 w-4 shrink-0 text-amber-400" />
                          <span className="truncate text-xs font-medium text-zinc-200">
                            {folder.name}
                          </span>
                        </button>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                          <button
                            onClick={() => {
                              setRenamingFolderId(folder.id);
                              setRenamingFolderName(folder.name);
                            }}
                            className="text-zinc-400 hover:text-zinc-200"
                            title="Renomear"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteFolder(folder)}
                            className="text-zinc-400 hover:text-red-400"
                            title="Excluir"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

              {/* Arquivos de Mídia */}
              <div className="grid grid-cols-2 gap-2">
                {currentMedia.map((m) => (
                  <div
                    key={m.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(MEDIA_DND_TYPE, m.id);
                      e.dataTransfer.setData("text/plain", m.id);
                      gcDrag.begin(m.id);
                    }}
                    onDragEnd={() => gcDrag.end()}
                    onClick={() => setSelMedia(m.id)}
                    className={`group relative flex flex-col overflow-hidden rounded-lg border bg-[#121722] transition ${
                      selMedia === m.id
                        ? "border-[var(--gc-accent)] shadow-[0_0_12px_var(--gc-accent-20)]"
                        : "border-[#1e2633] hover:border-[#2f3b4f]"
                    }`}
                  >
                    {/* Miniatura */}
                    <div className="relative aspect-video w-full bg-[#0a0d14]">
                      {m.thumbnail ? (
                        <img src={m.thumbnail} alt={m.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-zinc-600">
                          {m.kind === "video" ? (
                            <Film className="h-6 w-6" />
                          ) : m.kind === "audio" ? (
                            <Music2 className="h-6 w-6 text-emerald-400" />
                          ) : (
                            <ImageIcon className="h-6 w-6 text-sky-400" />
                          )}
                        </div>
                      )}
                      {m.duration > 0 && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1 py-0.5 font-mono text-[9px] text-zinc-300">
                          {fmtDur(m.duration)}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addClipFromMedia(m.id);
                        }}
                        className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100"
                        title={t("mp.addToTimeline")}
                      >
                        <PlusCircle className="h-7 w-7 text-white drop-shadow-md" />
                      </button>
                    </div>

                    {/* Detalhes */}
                    <div className="flex items-center justify-between p-1.5">
                      <span className="truncate text-[10px] font-medium text-zinc-300" title={m.name}>
                        {m.name}
                      </span>
                      <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                        {m.kind === "video" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConvertMediaList([m]);
                              setConvertDialogOpen(true);
                            }}
                            className="text-zinc-500 transition hover:text-[var(--gc-accent)]"
                            title="Converter formato do vídeo"
                          >
                            <Sparkles className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            askRemove(m);
                          }}
                          className="text-zinc-500 transition hover:text-red-400"
                          title="Remover"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {!currentMedia.length && !folders.filter((f) => (f.parentId ?? null) === currentFolderId).length && (
                <div className="flex flex-col items-center justify-center p-8 text-center text-zinc-600">
                  <Film className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-xs">{t("mp.noFiles")}</p>
                  <p className="text-[10px] text-zinc-600 mt-1">Arraste seus vídeos e fotos aqui</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </TabsContent>

        {/* ---------- EFEITOS ---------- */}
        <TabsContent value="effects" className="min-h-0 flex-1 overflow-hidden pt-0">
          <ScrollArea className="h-full p-2.5">
            <div className="grid grid-cols-2 gap-2">
              {EFFECT_CATALOG.map((eff) => (
                <button
                  key={eff.type}
                  onClick={() => applyEffectToSelection(eff)}
                  className="flex flex-col items-start rounded-lg border border-[#1e2633] bg-[#121722] p-2 text-left transition hover:border-emerald-400/50 hover:bg-[#161c2a]"
                >
                  <span className="text-xs font-semibold text-zinc-200">{eff.name}</span>
                  <span className="text-[9px] text-zinc-500 line-clamp-1">{eff.description}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ---------- ANIMAÇÕES ---------- */}
        <TabsContent value="animations" className="min-h-0 flex-1 overflow-hidden pt-0">
          <ScrollArea className="h-full p-2.5">
            <div className="space-y-3">
              <div>
                <span className="text-[11px] font-bold text-zinc-400 mb-1.5 block">Entrada (In):</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {ANIMATIONS_IN.map((anim) => (
                    <button
                      key={anim.type}
                      onClick={() => applyAnimationToSelection(anim.type, "in")}
                      className="rounded border border-[#1e2633] bg-[#121722] p-1.5 text-left text-[11px] text-zinc-300 transition hover:border-violet-400/50 hover:bg-[#161c2a]"
                    >
                      {anim.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold text-zinc-400 mb-1.5 block">Loop / Ritmo:</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {ANIMATIONS_COMBO.map((anim) => (
                    <button
                      key={anim.type}
                      onClick={() => applyAnimationToSelection(anim.type, "combo")}
                      className="rounded border border-[#1e2633] bg-[#121722] p-1.5 text-left text-[11px] text-zinc-300 transition hover:border-violet-400/50 hover:bg-[#161c2a]"
                    >
                      {anim.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-[11px] font-bold text-zinc-400 mb-1.5 block">Saída (Out):</span>
                <div className="grid grid-cols-2 gap-1.5">
                  {ANIMATIONS_OUT.map((anim) => (
                    <button
                      key={anim.type}
                      onClick={() => applyAnimationToSelection(anim.type, "out")}
                      className="rounded border border-[#1e2633] bg-[#121722] p-1.5 text-left text-[11px] text-zinc-300 transition hover:border-violet-400/50 hover:bg-[#161c2a]"
                    >
                      {anim.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* ---------- TEXTO & LEGENDAS ---------- */}
        <TabsContent value="text" className="min-h-0 flex-1 overflow-hidden pt-0">
          <div className="flex h-full flex-col p-2.5">
            {/* Botão de Legendas Automáticas com IA */}
            <button
              onClick={() => job.setOpen(true)}
              className="mb-3 flex w-full items-center justify-between rounded-xl border border-[var(--gc-accent-40)] bg-gradient-to-r from-[var(--gc-accent-10)] to-transparent p-3 text-left transition hover:border-[var(--gc-accent)] hover:shadow-[0_0_16px_var(--gc-accent-20)]"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--gc-accent)] text-black font-bold">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-xs font-bold text-zinc-100">{t("sub.title")}</span>
                  <span className="block text-[10px] text-zinc-400">Karaokê, Estilos CapCut e Cores</span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--gc-accent)]" />
            </button>

            {/* Adicionar Texto Manual */}
            <Button
              onClick={() => addTextClip("Seu Texto Aqui")}
              className="w-full gap-2 bg-[#1c2430] hover:bg-[#283446] text-zinc-200 text-xs font-semibold mb-3"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar Texto Simples
            </Button>

            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2 block">
              Presets de Texto:
            </span>

            <ScrollArea className="min-h-0 flex-1">
              <div className="grid grid-cols-2 gap-2">
                {CAPTION_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      const st = useProject.getState();
                      const track = st.tracks.find((t) => t.kind === "text") ?? st.tracks[0];
                      const pb = usePlayback.getState().playhead;
                      const base = defaultTextProps();
                      st.addClip(
                        makeClip({
                          kind: "text",
                          trackId: track.id,
                          start: pb,
                          duration: 3,
                          inPoint: 0,
                          outPoint: 3,
                          text: {
                            ...base,
                            ...p.props,
                            content: p.name,
                          },
                        })
                      );
                      toast.success(`Texto "${p.name}" adicionado!`);
                    }}
                    className="flex flex-col items-center gap-1.5 rounded-lg border border-[#1e2633] bg-[#121722] p-2 transition hover:border-[var(--gc-accent)] hover:bg-[#161c2a]"
                  >
                    <PresetPreview tp={p.props} height={30} />
                    <span className="w-full truncate text-center text-[9px] font-medium text-zinc-400">
                      {p.name}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {/* ---------- BUSCA STOCK ---------- */}
        <TabsContent value="stock" className="min-h-0 flex-1 overflow-hidden pt-0">
          <StockSearch />
        </TabsContent>
      </Tabs>

      {/* Diálogos */}
      <SubtitleDialog />
      <RecordDialog open={recordOpen} onOpenChange={setRecordOpen} />

      {/* Diálogo Criar Pasta */}
      <Dialog open={newFolderOpen} onOpenChange={setNewFolderOpen}>
        <DialogContent className="max-w-xs border-[#232d3d] bg-[#121722] text-zinc-200">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">{t("mp.newFolder")}</DialogTitle>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
            placeholder="Nome da pasta..."
            className="my-2 h-8 text-xs"
            autoFocus
          />
          <DialogFooter className="gap-1">
            <Button variant="ghost" size="sm" onClick={() => setNewFolderOpen(false)} className="text-xs">
              Cancelar
            </Button>
            <Button size="sm" onClick={handleCreateFolder} className="bg-[var(--gc-accent)] text-black text-xs font-semibold">
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diálogo Confirmar Exclusão de Mídia */}
      <AlertDialog open={!!confirmRemove} onOpenChange={(v) => !v && setConfirmRemove(null)}>
        <AlertDialogContent className="max-w-xs border-[#232d3d] bg-[#121722] text-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">{t("mp.removeMedia")}</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-zinc-400">
              Esta mídia está sendo usada na linha do tempo. Deseja realmente removê-la?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-1">
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRemove && removeMedia(confirmRemove.id)}
              className="bg-red-500 text-white text-xs font-semibold hover:bg-red-600"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo Confirmar Exclusão de Pasta */}
      <AlertDialog open={!!confirmDeleteFolder} onOpenChange={(v) => !v && setConfirmDeleteFolder(null)}>
        <AlertDialogContent className="max-w-xs border-[#232d3d] bg-[#121722] text-zinc-200">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">Excluir Pasta</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-zinc-400">
              Deseja excluir a pasta &quot;{confirmDeleteFolder?.name}&quot;? As mídias dentro dela serão movidas para a raiz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-1">
            <AlertDialogCancel className="text-xs">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDeleteFolder && deleteFolder(confirmDeleteFolder.id)}
              className="bg-red-500 text-white text-xs font-semibold hover:bg-red-600"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Diálogo Converter Formato de Mídia */}
      <ConvertMediaDialog
        open={convertDialogOpen}
        onOpenChange={setConvertDialogOpen}
        mediaList={convertMediaList}
      />
    </div>
  );
}
