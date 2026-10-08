// GalaxyCut — busca online de fotos, vídeos, músicas (livres de direitos) e figurinhas.
// Layout 100% responsivo e otimizado para qualquer monitor e resolução:
// cabeçalho ultra-compacto com rolagem suave contínua para visualização ampla dos vídeos/áudios.
"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Video,
  Music4,
  ImageIcon,
  AudioLines,
  Sticker,
  Loader2,
  Plus,
  Play,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Copyright,
  Clock,
  Film,
  Music2,
  Flame,
  Star,
  SlidersHorizontal,
} from "lucide-react";
import { useProject } from "@/lib/editor/store";
import { useSettings } from "@/lib/editor/settings";
import { registry } from "@/lib/editor/media";
import { licenseLevel, LICENSE_STYLE } from "@/lib/editor/types";
import { StockItem, downloadStockFile, searchStock, searchStickers } from "@/lib/editor/stockClient";
import { useLibPlayer } from "@/lib/editor/libPlayer";
import { useFavorites } from "@/lib/editor/favorites";
import { useT } from "@/lib/editor/i18n";
import {
  SHORTS_CATEGORIES,
  CURATED_SHORTS_TRACKS,
  CuratedShortsTrack,
  ShortsVibe,
} from "@/lib/editor/shortsAudio";
import { StockPreviewModal } from "./StockPreviewModal";
import { toast } from "sonner";

type StockType = "image" | "video" | "music" | "sfx" | "sticker";
type DurId = "any" | "short" | "mid" | "long" | "custom";

/** Emojis (sub-aba de Stickers — 100% offline). */
const STICKER_SETS: { key: string; emojis: string[] }[] = [
  { key: "reactions", emojis: ["😂", "🔥", "❤️", "😍", "💀", "😭", "🤯", "😎", "🥳", "🤔", "👀", "👏"] },
  { key: "gaming", emojis: ["🎮", "🕹️", "🏆", "👾", "🎯", "⚡", "💥", "👑", "🚀", "💣", "💎", "⭐"] },
  { key: "symbols", emojis: ["✨", "💯", "⚠️", "❌", "✅", "❗", "❓", "🔔", "💰", "💸", "🔞", "🎵"] },
  { key: "arrows", emojis: ["➡️", "⬅️", "⬆️", "⬇️", "↗️", "↘️", "👉", "👈", "👆", "👇", "🔥", "💫"] },
];

/** Gêneros musicais */
const GENRES = [
  { id: "all", label: "Todas" },
  { id: "shorts", label: "🔥 Shorts (Sem Voz)" },
  { id: "lofi", label: "Lo-Fi" },
  { id: "electronic", label: "Eletrônica" },
  { id: "ambient", label: "Ambiente" },
  { id: "hiphop", label: "Hip-Hop" },
  { id: "cinematic", label: "Cinematográfica" },
  { id: "rock", label: "Rock" },
  { id: "pop", label: "Pop" },
  { id: "jazz", label: "Jazz" },
  { id: "classical", label: "Clássica" },
  { id: "acoustic", label: "Acústica" },
];

/** Duração */
const DURATIONS: { id: DurId; label: string; min?: number; max?: number }[] = [
  { id: "any", label: "Qualquer duração" },
  { id: "short", label: "Curto (< 15s)", max: 15 },
  { id: "mid", label: "Médio (15s–1min)", min: 15, max: 60 },
  { id: "long", label: "Longo (> 1min)", min: 60 },
  { id: "custom", label: "Personalizado" },
];

/** Exemplos rápidos de efeitos sonoros */
const SFX_EXAMPLES = [
  { label: "Transição Whoosh", q: "whoosh transition" },
  { label: "Pop", q: "pop" },
  { label: "Impacto / Boom", q: "cinematic boom impact" },
  { label: "Clique de Mouse", q: "mouse click" },
  { label: "Notificação", q: "notification bell" },
  { label: "Risada / Meme", q: "meme laugh" },
  { label: "Moeda / Level Up", q: "coin level up" },
  { label: "Explosão", q: "explosion" },
];

function fmtDur(d: number) {
  if (!isFinite(d)) return "—";
  const m = Math.floor(d / 60);
  const s = Math.floor(d % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function StockSearch() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<StockType>("video");
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<StockItem[] | null>(null);
  const [translated, setTranslated] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [dur, setDur] = useState<DurId>("any");
  const [genre, setGenre] = useState("all");
  const [shortsVibe, setShortsVibe] = useState<ShortsVibe>("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [cmin, setCmin] = useState(10);
  const [cmax, setCmax] = useState(60);
  const [stickTab, setStickTab] = useState<"stickers" | "emojis">("stickers");
  const [showFilters, setShowFilters] = useState(false);

  // Modal de Prévia Grande
  const [previewItem, setPreviewItem] = useState<StockItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const addMedia = useProject((s) => s.addMedia);
  const addClipFromMedia = useProject((s) => s.addClipFromMedia);
  const openPlayer = useLibPlayer((s) => s.open);
  const isFavorite = useFavorites((s) => s.isFavorite);
  const toggleFavorite = useFavorites((s) => s.toggleFavorite);
  const favoriteItems = useFavorites((s) => s.items);

  const searchedRef = useRef(false);
  const [hoverVideo, setHoverVideo] = useState<string | null>(null);

  const TYPE_TABS: { id: StockType; label: string; icon: typeof ImageIcon; ph: string }[] = [
    { id: "video", label: t("ss.video"), icon: Video, ph: t("ss.phVideo") },
    { id: "music", label: t("ss.music"), icon: Music4, ph: "Ex: curiosidades, lofi, tech, mistério..." },
    { id: "sfx", label: t("ss.sfx"), icon: AudioLines, ph: t("ss.phSfx") },
    { id: "image", label: t("ss.photo"), icon: ImageIcon, ph: t("ss.phPhoto") },
    { id: "sticker", label: t("ss.sticker"), icon: Sticker, ph: t("ss.phSticker") },
  ];

  const showDur = type !== "image" && type !== "sticker";
  const showGenre = type === "music";
  const isSticker = type === "sticker";
  const isShortsMode = type === "music" && (genre === "shorts" || genre.startsWith("shorts_"));

  async function search(e?: FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    if (isSticker) {
      setLoading(true);
      setTranslated(null);
      try {
        const results = await searchStickers(query.trim());
        setItems(results);
        if (!results.length) {
          toast.info(t("ss.nothing"), { description: t("ss.stickerNone", { q: query.trim() }) });
        }
      } catch {
        toast.error(t("ss.fail"), { description: t("ss.failDesc") });
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setTranslated(null);
    try {
      const keys = useSettings.getState().keys;
      const { results, translated: tr } = await searchStock({
        q: query,
        type: type as "video" | "image" | "music" | "sfx",
        dur,
        genre,
        ...(dur === "custom" ? { dmin: Math.max(0, Math.min(cmin, cmax)), dmax: Math.max(1, Math.max(cmin, cmax)) } : {}),
        pexelsKey: keys.pexels || undefined,
        pixabayKey: keys.pixabay || undefined,
      });
      setItems(results);
      if (tr && tr !== query) setTranslated(tr);
      if (!results.length && !isShortsMode) {
        toast.info(t("ss.nothing"), { description: t("ss.nothingDesc") });
      }
    } catch {
      toast.error(t("ss.fail"), { description: t("ss.failDesc") });
    } finally {
      setLoading(false);
    }
  }

  async function searchDirect(qText: string, searchType = type, searchDur = dur, searchGenre = genre) {
    const qClean = qText.trim() || (searchType === "music" ? "instrumental background beat" : searchType === "sfx" ? "sound effect" : "");
    if (!qClean) return;
    setLoading(true);
    setTranslated(null);
    try {
      const keys = useSettings.getState().keys;
      const { results, translated: tr } = await searchStock({
        q: qClean,
        type: searchType as "video" | "image" | "music" | "sfx",
        dur: searchDur,
        genre: searchGenre,
        ...(searchDur === "custom" ? { dmin: Math.max(0, Math.min(cmin, cmax)), dmax: Math.max(1, Math.max(cmin, cmax)) } : {}),
        pexelsKey: keys.pexels || undefined,
        pixabayKey: keys.pixabay || undefined,
      });
      setItems(results);
      if (tr && tr !== qClean) setTranslated(tr);
      if (!results.length && !isShortsMode) {
        toast.info(t("ss.nothing"), { description: t("ss.nothingDesc") });
      }
    } catch {
      toast.error(t("ss.fail"), { description: t("ss.failDesc") });
    } finally {
      setLoading(false);
    }
  }

  // Busca inicial automática ao trocar de aba se ainda não buscou
  useEffect(() => {
    if (!isSticker && items === null && !searchedRef.current) {
      const defaultQ =
        type === "music"
          ? "instrumental background beat"
          : type === "video"
          ? "nature drone background"
          : type === "sfx"
          ? "whoosh transition"
          : "wallpaper background";
      void searchDirect(defaultQ, type, dur, genre);
    }
  }, [type]);

  async function addStock(st: StockItem) {
    setAdding(st.id);
    try {
      const isAud = Boolean(st.audio);
      const isStick = type === "sticker";
      const catName = isAud
        ? type === "sfx"
          ? "Efeitos Sonoros"
          : "Músicas"
        : isStick
        ? "Figurinhas / Stickers"
        : type === "video"
        ? "Vídeos"
        : "Imagens / Fotos";

      const catFolder = useProject.getState().getOrCreateCategoryFolder(catName);
      const blob = await downloadStockFile(st.url);
      const ext = isAud ? "mp3" : isStick ? "png" : type === "video" ? "mp4" : "jpg";
      const meta = await registry.importFile(blob, `${st.title || "midia"}.${ext}`);

      addMedia({
        ...meta,
        source: "stock",
        stockUrl: st.url,
        folderId: catFolder.id,
        license: st.license,
        licenseLabel: st.license,
        creator: st.creator,
      });

      addClipFromMedia(meta.id);
      useProject.getState().setCurrentFolderId(catFolder.id);
      window.dispatchEvent(new CustomEvent("galaxiacut:navmedia", { detail: { folderId: catFolder.id } }));
      toast.success(t("st.addedToTimeline"));
    } catch {
      toast.error(t("st.errorDownload"));
    } finally {
      setAdding(null);
    }
  }

  function handleOpenPreview(it: StockItem) {
    setPreviewItem(it);
    setPreviewOpen(true);
    openPlayer({
      id: it.id,
      title: it.title,
      url: it.url,
      kind: it.audio ? "audio" : "video",
      thumb: it.thumb,
      isIa: it.provider.includes("Internet Archive"),
      provider: it.provider,
      creator: it.creator,
      license: it.license,
      duration: it.duration,
      rawStockItem: it,
    });
  }

  async function addSticker(emoji: string) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 256, 256);
    ctx.font = "180px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, 128, 138);

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return;

    const catFolder = useProject.getState().getOrCreateCategoryFolder("Figurinhas / Stickers");
    const meta = await registry.importFile(blob, `emoji-${emoji}.png`);
    addMedia({
      ...meta,
      source: "sticker",
      folderId: catFolder.id,
    });
    addClipFromMedia(meta.id);
    useProject.getState().setCurrentFolderId(catFolder.id);
    window.dispatchEvent(new CustomEvent("galaxiacut:navmedia", { detail: { folderId: catFolder.id } }));
    toast.success(t("ss.addedEmoji", { emoji }));
  }

  const activeTab = TYPE_TABS.find((t) => t.id === type) ?? TYPE_TABS[0];

  // Itens para exibir (Favoritos ou Busca)
  let displayItems: StockItem[] | null = items;
  if (onlyFavorites) {
    displayItems = favoriteItems.map((fav) => ({
      id: fav.id,
      title: fav.title,
      url: fav.url || "",
      thumb: fav.thumb || "",
      duration: fav.duration || 0,
      provider: fav.provider || "Stock",
      license: fav.license || "cc0",
      creator: fav.creator,
      audio: fav.kind === "music" || fav.kind === "sfx",
    }));
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#0c1017]">
      {/* ==================== CABEÇALHO COMPACTO FIXO ==================== */}
      <div className="shrink-0 border-b border-[#1c2430] p-2 space-y-1.5 bg-[#0f141d]">
        {/* Linha 1: Abas de Tipo (Vídeo, Música, Efeito, Foto, Sticker) */}
        <div className="grid grid-cols-5 gap-1">
          {TYPE_TABS.map((tb) => {
            const Icon = tb.icon;
            const active = type === tb.id && !onlyFavorites;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => {
                  setType(tb.id);
                  setOnlyFavorites(false);
                  setItems(null);
                  setTranslated(null);
                  searchedRef.current = false;
                }}
                className={`flex items-center justify-center gap-1 rounded-md border py-1 px-1 transition text-center ${
                  active
                    ? "border-[var(--gc-accent)] bg-[var(--gc-accent-10)] text-[var(--gc-accent)] font-semibold shadow-xs"
                    : "border-[#232d3d] bg-[#121722] text-zinc-400 hover:border-[#3a4759] hover:text-zinc-200"
                }`}
                title={tb.label}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="text-[10px] truncate leading-none">{tb.label}</span>
              </button>
            );
          })}
        </div>

        {/* Linha 2: Barra de Busca + Botão Favoritos + Botão Filtros */}
        <div className="flex items-center gap-1.5">
          <form
            onSubmit={(e) => {
              searchedRef.current = true;
              void search(e);
            }}
            className="flex flex-1 items-center gap-1 min-w-0"
          >
            <div className="relative flex-1 min-w-0">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  onlyFavorites
                    ? "Filtrar favoritos..."
                    : isShortsMode
                    ? "Fundo para Shorts..."
                    : activeTab.ph
                }
                className="h-7 border-[#2a3546] bg-[#121722] text-xs text-zinc-200 placeholder:text-zinc-600 pl-2 pr-7"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchedRef.current = false;
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
                >
                  ×
                </button>
              )}
            </div>

            <Button
              type="submit"
              size="icon"
              className="h-7 w-7 shrink-0 bg-[var(--gc-accent)] text-black hover:bg-[var(--gc-accent-hover)] rounded-md font-bold"
              aria-label={t("ss.search")}
              title={t("ss.search")}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </Button>
          </form>

          {/* Botão ⭐ Meus Favoritos */}
          <button
            type="button"
            onClick={() => setOnlyFavorites((f) => !f)}
            className={`flex h-7 items-center gap-1 shrink-0 rounded-md border px-2 text-xs transition ${
              onlyFavorites
                ? "border-amber-400 bg-amber-400/20 text-amber-300 font-bold shadow-[0_0_8px_rgba(251,191,36,0.3)]"
                : "border-[#2a3546] bg-[#121722] text-zinc-400 hover:border-amber-400/50 hover:text-amber-300"
            }`}
            title="Ver meus arquivos favoritados com estrela"
          >
            <Star className={`h-3.5 w-3.5 ${onlyFavorites ? "fill-amber-400 text-amber-400" : ""}`} />
            <span className="text-[11px] font-semibold">{favoriteItems.length}</span>
          </button>

          {/* Toggle de Filtros Avançados */}
          {(showDur || showGenre) && !onlyFavorites && (
            <button
              type="button"
              onClick={() => setShowFilters((s) => !s)}
              className={`flex h-7 w-7 items-center justify-center shrink-0 rounded-md border transition ${
                showFilters || genre !== "all" || dur !== "any"
                  ? "border-[var(--gc-accent)] bg-[var(--gc-accent-10)] text-[var(--gc-accent)]"
                  : "border-[#2a3546] bg-[#121722] text-zinc-400 hover:text-zinc-200"
              }`}
              title="Filtros de estilo e duração"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ==================== ÁREA DE CONTEÚDO ROLÁVEL (100% VISÍVEL) ==================== */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2 timeline-scroll space-y-2">
        {/* sub-aba de STICKERS */}
        {isSticker && !onlyFavorites && (
          <div className="flex rounded-lg border border-[#2a3546] bg-[#0e1320] p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setStickTab("stickers")}
              className={`flex-1 rounded-md py-1 text-[11px] font-semibold transition ${
                stickTab === "stickers"
                  ? "bg-[var(--gc-accent)] text-black shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              🎨 Figurinhas (PNG)
            </button>
            <button
              type="button"
              onClick={() => setStickTab("emojis")}
              className={`flex-1 rounded-md py-1 text-[11px] font-semibold transition ${
                stickTab === "emojis"
                  ? "bg-[var(--gc-accent)] text-black shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              😀 Emojis Prontos
            </button>
          </div>
        )}

        {/* EFEITOS SONOROS: chips rápidos */}
        {type === "sfx" && !onlyFavorites && (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-emerald-400" /> Efeitos Populares
              </span>
            </div>
            <div className="flex gap-1 overflow-x-auto pb-1 timeline-scroll">
              {SFX_EXAMPLES.map((ex) => (
                <button
                  key={ex.q}
                  type="button"
                  onClick={() => {
                    setQuery(ex.q);
                    searchedRef.current = true;
                    void searchDirect(ex.q, "sfx", dur, genre);
                  }}
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] transition ${
                    query === ex.q
                      ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 font-medium"
                      : "border-[#2a3546] bg-[#121722] text-zinc-300 hover:border-emerald-500/60 hover:text-white"
                  }`}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MÚSICAS: Categorias de Shorts & Gêneros */}
        {showGenre && !onlyFavorites && (
          <div className="space-y-1.5">
            {/* Chips de Shorts Instrumental */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 timeline-scroll">
              <span className="shrink-0 text-[10px] font-bold text-amber-400 flex items-center gap-1">
                <Flame className="h-3.5 w-3.5" /> Shorts:
              </span>
              {SHORTS_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setShortsVibe(cat.id);
                    const targetGenre = cat.id === "all" ? "shorts" : `shorts_${cat.id}`;
                    setGenre(targetGenre);
                    searchedRef.current = true;
                    void searchDirect(
                      query || (cat.id === "all" ? "instrumental background beat" : cat.searchTerms),
                      "music",
                      dur,
                      targetGenre
                    );
                  }}
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] transition flex items-center gap-1 ${
                    shortsVibe === cat.id && genre.startsWith("shorts")
                      ? "border-amber-400 bg-amber-400/20 text-amber-200 font-semibold shadow-xs"
                      : "border-[#2a3546] bg-[#121722] text-zinc-300 hover:border-amber-400/60 hover:text-white"
                  }`}
                >
                  <span>{cat.icon}</span>
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {/* Gêneros Tradicionais */}
            {showFilters && (
              <div className="rounded-lg border border-[#232d3d] bg-[#101520] p-2 space-y-1.5">
                <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
                  <Music4 className="h-3 w-3 text-amber-400" /> Todos os Gêneros
                </div>
                <div className="flex flex-wrap gap-1">
                  {GENRES.map((g) => {
                    const active = genre === g.id || (g.id === "shorts" && genre.startsWith("shorts"));
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setGenre(g.id);
                          searchedRef.current = true;
                          void searchDirect(query || (g.id === "all" ? "instrumental music" : g.label), "music", dur, g.id);
                        }}
                        className={`rounded-md border px-2 py-0.5 text-[10px] transition ${
                          active
                            ? "border-[var(--gc-accent)] bg-[var(--gc-accent-10)] text-[var(--gc-accent)] font-semibold"
                            : "border-[#232d3d] bg-[#121722] text-zinc-400 hover:text-zinc-200"
                        }`}
                      >
                        {g.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Filtros de Duração (quando ativado) */}
        {showFilters && showDur && !onlyFavorites && (
          <div className="rounded-lg border border-[#232d3d] bg-[#101520] p-2 space-y-1">
            <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-400">
              <Clock className="h-3 w-3 text-sky-400" /> Duração do Áudio/Vídeo
            </div>
            <div className="flex flex-wrap gap-1">
              {DURATIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDur(d.id);
                    searchedRef.current = true;
                    void searchDirect(query, type, d.id, genre);
                  }}
                  className={`rounded-md border px-2 py-0.5 text-[10px] transition ${
                    dur === d.id
                      ? "border-[var(--gc-accent)] bg-[var(--gc-accent-10)] text-[var(--gc-accent)] font-semibold"
                      : "border-[#232d3d] bg-[#121722] text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Emojis Prontos */}
        {isSticker && stickTab === "emojis" && !onlyFavorites && (
          <div className="space-y-3">
            {STICKER_SETS.map((set) => (
              <div key={set.key}>
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{t(`ss.cat.${set.key}`)}</p>
                <div className="grid grid-cols-6 gap-1">
                  {set.emojis.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => addSticker(e)}
                      className="flex aspect-square items-center justify-center rounded-lg border border-[#232d3d] bg-[#0e1320] text-xl transition hover:scale-110 hover:border-[var(--gc-accent)] hover:bg-[var(--gc-accent-10)]"
                      title={e}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tradução PT -> EN */}
        {translated && (
          <p className="rounded border border-[#1e2633] bg-[#0e1320] px-2 py-1 text-[10px] text-zinc-400">
            🔍 {t("ss.searchedFor")}: <strong className="text-zinc-200">{translated}</strong>
          </p>
        )}

        {/* Loading Spinner */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-zinc-400">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--gc-accent)]" />
            <span className="text-xs">{t("ss.searching")}...</span>
          </div>
        )}

        {/* ==================== GRID DE RESULTADOS (VÍDEOS, MÚSICAS, IMAGENS) ==================== */}
        {!loading && displayItems && displayItems.length > 0 && (
          <div className={`grid gap-2 ${isSticker ? "grid-cols-3" : "grid-cols-1 xs:grid-cols-2"}`}>
            {displayItems.map((it) => {
              const lv = licenseLevel(it.license);
              const ls = LICENSE_STYLE[lv];
              const isVideoTile = (type === "video" || !it.audio) && !isSticker && type !== "image";
              const isAudioTile = Boolean(it.audio);
              const curated = (it as any).badge ? (it as CuratedShortsTrack) : undefined;
              const starred = isFavorite(it.id);

              return (
                <div
                  key={it.id}
                  className="group relative flex flex-col overflow-hidden rounded-xl border border-[#232d3d] bg-[#121722] hover:border-[#3d4f68] transition shadow-md"
                  onMouseEnter={() => isVideoTile && setHoverVideo(it.id)}
                  onMouseLeave={() => setHoverVideo((v) => (v === it.id ? null : v))}
                >
                  {/* Miniatura / Player Viewport */}
                  <div
                    className={`relative ${isSticker ? "aspect-square" : "aspect-video"} ${
                      isSticker ? "bg-[#0a0d14]" : "bg-black"
                    } cursor-pointer overflow-hidden flex items-center justify-center`}
                    onClick={() => handleOpenPreview(it)}
                  >
                    {it.thumb ? (
                      <img
                        src={it.thumb}
                        alt={it.title}
                        loading="lazy"
                        className={`h-full w-full ${isSticker ? "object-contain p-2" : "object-cover"} transition duration-300 group-hover:scale-105`}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#1c1809] to-[#0a0d14]">
                        {isAudioTile ? <Music2 className="h-8 w-8 text-amber-400/80" /> : <Film className="h-8 w-8 text-emerald-400/80" />}
                      </div>
                    )}

                    {isVideoTile && <VideoPreviewLayer item={it} active={hoverVideo === it.id} />}

                    {/* Botão de Estrela (Favorito) no canto superior direito */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        const resolvedKind = it.audio ? (type === "sfx" ? "sfx" : "music") : isSticker ? "sticker" : isVideoTile ? "video" : "image";
                        toggleFavorite(it, resolvedKind);
                      }}
                      className={`absolute right-1.5 top-1.5 z-30 flex h-6 w-6 items-center justify-center rounded-md border transition ${
                        starred
                          ? "border-amber-400 bg-amber-400 text-black shadow-md scale-105"
                          : "border-black/50 bg-black/60 text-zinc-300 hover:border-amber-400 hover:text-amber-300"
                      }`}
                      title={starred ? "Remover dos Favoritos" : "Favoritar"}
                      aria-label="Favoritar"
                    >
                      <Star className={`h-3.5 w-3.5 ${starred ? "fill-black text-black" : ""}`} />
                    </button>

                    {/* Botão de Adicionar (+) no canto superior esquerdo */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        void addStock(it);
                      }}
                      disabled={adding === it.id}
                      className="absolute left-1.5 top-1.5 z-30 flex h-6 w-6 items-center justify-center rounded-md border border-white/20 bg-black/70 text-[var(--gc-accent)] shadow transition hover:scale-110 hover:bg-[var(--gc-accent)] hover:text-black font-bold"
                      title="Adicionar à Linha do Tempo (+)"
                      aria-label="Adicionar à Linha do Tempo"
                    >
                      {adding === it.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" strokeWidth={3} />
                      )}
                    </button>

                    {/* Selo de Licença */}
                    <span
                      className={`absolute left-1.5 bottom-1.5 rounded border px-1 py-px text-[8px] font-semibold backdrop-blur-sm ${ls.cls}`}
                    >
                      {(it.license || "CC0").toUpperCase()}
                    </span>

                    {/* Duração */}
                    {Boolean(it.duration && it.duration > 0) && (
                      <span className="absolute right-1.5 bottom-1.5 rounded bg-black/80 px-1 py-0.5 font-mono text-[9px] tabular-nums text-zinc-200 backdrop-blur-sm">
                        {fmtDur(it.duration ?? 0)}
                      </span>
                    )}

                    {/* Badge de Destaque / Curado */}
                    {curated?.badge && (
                      <span className="absolute left-9 top-1.5 rounded bg-amber-400 text-black px-1.5 py-px text-[8px] font-bold shadow-xs">
                        {curated.badge}
                      </span>
                    )}

                    {/* Overlay de PLAY para Ver Prévia */}
                    {(isAudioTile || isVideoTile) && (
                      <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100 backdrop-blur-[1px]">
                        <div className="flex items-center gap-1.5 rounded-full border border-white/40 bg-black/85 px-3 py-1.5 text-xs font-bold text-white shadow-xl transition hover:scale-105 hover:bg-[var(--gc-accent)] hover:text-black">
                          <Play className="h-3.5 w-3.5 fill-current" />
                          <span>Prévia</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Informações da Mídia Abaixo da Miniatura */}
                  {!isSticker && (
                    <div className="p-2 flex flex-col justify-between gap-1">
                      <p className="truncate text-xs font-semibold text-zinc-200" title={it.title}>
                        {it.title}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-zinc-400">
                        <span className="truncate">{curated?.vibeLabel || it.provider}</span>
                        {it.creator && <span className="truncate text-zinc-500 max-w-[80px]">• {it.creator}</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Sem resultados */}
        {!loading && displayItems && displayItems.length === 0 && (
          <div className="rounded-xl border border-[#232d3d] bg-[#101520] p-6 text-center space-y-2 my-4">
            <p className="text-sm font-semibold text-zinc-300">
              {onlyFavorites ? "Nenhum favorito encontrado" : "Nenhum resultado encontrado"}
            </p>
            <p className="text-xs text-zinc-500 leading-relaxed">
              {onlyFavorites
                ? "Clique no ícone de estrela (⭐) em qualquer vídeo, música ou efeito para salvar aqui!"
                : "Tente buscar por outros termos em português ou inglês."}
            </p>
          </div>
        )}
      </div>

      {/* Modal de Prévia Grande de Vídeo e Áudio */}
      <StockPreviewModal
        item={previewItem}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        onAddStock={addStock}
      />
    </div>
  );
}

// ---------- prévia de VÍDEO no resultado da busca (passe o mouse e toca, mudo) ----------
function VideoPreviewLayer({ item, active }: { item: StockItem; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
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
      if (cancelled || !hostRef.current) return;
      const v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = "auto";
      v.className = "absolute inset-0 h-full w-full bg-black object-cover";
      v.src = item.url;
      void v.play().catch(() => undefined);
      hostRef.current.replaceChildren(v);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [active, item.url]);
  return <div ref={hostRef} className="absolute inset-0" aria-hidden />;
}
