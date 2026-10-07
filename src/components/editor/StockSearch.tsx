// GalaxyCut — aba de busca online: fotos, vídeos, músicas, efeitos e STICKERS
// de bancos livres (Openverse, Freesound, Wikimedia, Internet Archive, Jamendo,
// Pexels, Pixabay). v8.2: Prévia completa de vídeo e áudio com player modal,
// sistema de favoritos com estrela persistente e sincronização com a aba Mídia.
"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ImageIcon,
  Music2,
  Film,
  Loader2,
  Search,
  Plus,
  AudioLines,
  Music4,
  Video,
  Clock,
  Copyright,
  Play,
  Sticker,
  Sparkles,
  Flame,
  Star,
} from "lucide-react";
import { useProject } from "@/lib/editor/store";
import { useSettings } from "@/lib/editor/settings";
import { registry } from "@/lib/editor/media";
import { licenseLevel, LICENSE_STYLE } from "@/lib/editor/types";
import { StockItem, downloadStockFile, resolveIaFile, searchStock, searchStickers } from "@/lib/editor/stockClient";
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

type StockType = "image" | "video" | "music" | "sfx" | "sticker";
type DurId = "any" | "short" | "mid" | "long" | "custom";

/** Emojis (sub-aba de Stickers — 100% offline). */
const STICKER_SETS: { key: string; emojis: string[] }[] = [
  { key: "faces", emojis: ["😀","😂","🤣","😍","😎","🥳","🤯","😭","😡","🤔","😴","🥺","😱","🤡","😈","🤠","😇","🤪"] },
  { key: "hands", emojis: ["👍","👎","👏","🙌","🙏","💪","✌️","🤝","👌","🤟","👉","🖐️"] },
  { key: "hearts", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💖","💘","💝","💔","❣️","💕"] },
  { key: "animals", emojis: ["🐶","🐱","🦊","🐻","🐼","🐨","🦁","🐯","🐸","🐷","🦄","🐔","🐢","🦖","🐙","🦅"] },
  { key: "food", emojis: ["🍕","🍔","🍟","🌮","🍿","🍩","🍪","🎂","🍎","🍌","🍉","🍓"] },
  { key: "impact", emojis: ["🔥","⭐","✨","💫","⚡","💯","🎉","🎊","🎮","🏆","👑","💰","💣","💀"] },
  { key: "signs", emojis: ["➡️","⬅️","✅","❌","❓","❗","⚠️","🚫","🔍","🔖","📌","💬","👁️","🧠"] },
];

const SFX_EXAMPLES = [
  { label: "⚡ Transição (Whoosh)", q: "whoosh transition" },
  { label: "💥 Impacto (Boom)", q: "boom impact" },
  { label: "🔔 Sino (Ding)", q: "ding bell chime" },
  { label: "😂 Risadas", q: "laughter laugh audience" },
  { label: "👏 Aplausos", q: "applause crowd clapping" },
  { label: "👾 Glitch / Ruído", q: "glitch static noise" },
  { label: "🎯 Pop / Bolha", q: "pop bubble click" },
  { label: "💬 Notificação", q: "notification message chime" },
  { label: "🔫 Laser / Sci-Fi", q: "laser blaster scifi" },
  { label: "⌨️ Digitação", q: "keyboard typing click" },
  { label: "🏃 Swoosh Rápido", q: "fast swoosh swipe" },
  { label: "💣 Explosão", q: "explosion blast" },
];

const GENRES: { id: string; label: string; key: string; isSpecial?: boolean }[] = [
  { id: "all", label: "Todas", key: "g.all" },
  { id: "shorts", label: "📱 Áudio Shorts (Sem Voz)", key: "g.shorts", isSpecial: true },
  { id: "lofi", label: "Lo-Fi", key: "g.lofi" },
  { id: "epic", label: "Épico / Cinema", key: "g.epic" },
  { id: "gaming", label: "Gamer / Chiptune", key: "g.gaming" },
  { id: "calm", label: "Calmo / Relax", key: "g.calm" },
  { id: "electronic", label: "Eletrônica / EDM", key: "g.electronic" },
  { id: "trap", label: "Trap / Beat", key: "g.trap" },
  { id: "rock", label: "Rock", key: "g.rock" },
  { id: "ambient", label: "Ambiente", key: "g.ambient" },
  { id: "happy", label: "Alegre / Feliz", key: "g.happy" },
  { id: "tense", label: "Tenso / Suspense", key: "g.tense" },
  { id: "sad", label: "Triste / Melancólico", key: "g.sad" },
  { id: "funk", label: "Funk", key: "g.funk" },
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
  const [type, setType] = useState<StockType>("image");
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
    { id: "image", label: t("ss.photo"), icon: ImageIcon, ph: t("ss.phPhoto") },
    { id: "video", label: t("ss.video"), icon: Video, ph: t("ss.phVideo") },
    { id: "music", label: t("ss.music"), icon: Music4, ph: "Ex: curiosidades, lofi, tech, viral..." },
    { id: "sfx", label: t("ss.sfx"), icon: AudioLines, ph: t("ss.phSfx") },
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

  useEffect(() => {
    if (!isSticker) {
      if (query.trim() || type === "music" || type === "sfx") {
        const defaultQ =
          type === "music"
            ? genre === "shorts" || genre.startsWith("shorts")
              ? "instrumental background music"
              : "music background"
            : "sound effect";
        void searchDirect(query || defaultQ, type, dur, genre);
      }
    }
  }, [type, dur, genre]);

  // Lista composta exibida (Curados + Busca Online + Filtro de Favoritos)
  const displayItems = useMemo(() => {
    let baseList: StockItem[] = [];

    if (onlyFavorites) {
      const favMatches = favoriteItems.map(
        (f): StockItem => ({
          id: f.id,
          title: f.title,
          thumb: f.thumb || "",
          url: f.url,
          provider: f.provider || "Favoritos",
          license: f.license || "free",
          duration: f.duration,
          audio: f.kind === "music" || f.kind === "sfx",
          creator: f.creator,
        })
      );
      baseList = favMatches;
    } else if (isShortsMode) {
      const vibe = genre === "shorts" ? shortsVibe : (genre.replace("shorts_", "") as ShortsVibe);
      const curated = CURATED_SHORTS_TRACKS.filter((t) => {
        if (vibe !== "all" && t.vibe !== vibe) return false;
        if (query.trim()) {
          const ql = query.toLowerCase();
          return (
            t.title.toLowerCase().includes(ql) ||
            t.vibeLabel.toLowerCase().includes(ql) ||
            (t.badge && t.badge.toLowerCase().includes(ql)) ||
            (t.creator && t.creator.toLowerCase().includes(ql))
          );
        }
        return true;
      });

      if (items === null) baseList = curated;
      else {
        const seen = new Set<string>(curated.map((c) => c.id));
        const combined: StockItem[] = [...curated];
        for (const it of items) {
          if (!seen.has(it.id)) {
            seen.add(it.id);
            combined.push(it);
          }
        }
        baseList = combined;
      }
    } else {
      baseList = items || [];
    }

    if (query.trim() && onlyFavorites) {
      const ql = query.toLowerCase();
      baseList = baseList.filter((x) => x.title.toLowerCase().includes(ql) || (x.creator && x.creator.toLowerCase().includes(ql)));
    }

    return baseList;
  }, [items, isShortsMode, genre, shortsVibe, query, onlyFavorites, favoriteItems]);

  async function addStock(item: StockItem) {
    setAdding(item.id);
    try {
      let url = item.url;
      if (item.provider.includes("Internet Archive")) {
        const d = await resolveIaFile(item.id.replace(/^ia-/, ""));
        url = d.url;
      }
      const blob = await downloadStockFile(url);
      const ext =
        /\.(mp3|wav|ogg|m4a|flac|opus|mp4|webm|mov|png|jpe?g|webp|gif)$/i.exec(url)?.[1] ??
        (item.audio ? "mp3" : type === "video" ? "mp4" : "png");
      const name = `${item.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 40)}.${ext}`;
      const meta = await registry.importFile(blob, name);

      const categoryNames: Record<StockType, string> = {
        music: isShortsMode ? "Áudios Shorts" : "Músicas",
        sfx: "Efeitos Sonoros",
        video: "Vídeos de Estoque",
        image: "Fotos & Imagens",
        sticker: "Figurinhas / Stickers",
      };
      const catFolder = useProject.getState().getOrCreateCategoryFolder(categoryNames[type] || "Músicas");

      addMedia({
        ...meta,
        source: "stock",
        stockUrl: url,
        license: item.license,
        licenseLabel: item.license,
        creator: item.creator,
        folderId: catFolder.id,
      });
      addClipFromMedia(meta.id);
      useProject.getState().setCurrentFolderId(catFolder.id);
      window.dispatchEvent(new CustomEvent("galaxiacut:navmedia", { detail: { folderId: catFolder.id } }));

      toast.success(t("ss.addedStock"), {
        description: `Adicionado à pasta "${catFolder.name}" · ${
          licenseLevel(item.license) === "free" ? t("ss.addedFree") : t("ss.addedCredit")
        }`,
      });
    } catch (err) {
      toast.error(t("ss.downloadFail"), {
        description: String((err as Error)?.message ?? err),
      });
    } finally {
      setAdding(null);
    }
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

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* tabs de tipo (Foto, Vídeo, Música, Efeito, Sticker) */}
      <div className="grid grid-cols-5 gap-1 shrink-0">
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
              className={`flex flex-col items-center justify-center gap-0.5 rounded-lg border py-1.5 transition ${
                active
                  ? "border-[var(--gc-accent)] bg[var(--gc-accent-10)] text-[var(--gc-accent)] shadow-sm"
                  : "border-[#232d3d] bg-[#121722] text-zinc-400 hover:border-[#3a4759] hover:text-zinc-200"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[10px] font-medium leading-none">{tb.label}</span>
            </button>
          );
        })}
      </div>

      {/* Botão / Filtro rápido de Favoritos */}
      <div className="flex items-center justify-between shrink-0 px-0.5">
        <button
          type="button"
          onClick={() => setOnlyFavorites((f) => !f)}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs transition ${
            onlyFavorites
              ? "border-amber-400 bg-amber-400/20 text-amber-300 font-bold shadow-[0_0_10px_rgba(251,191,36,0.3)]"
              : "border-[#2a3546] bg-[#0e1320] text-zinc-400 hover:border-amber-400/50 hover:text-amber-300"
          }`}
        >
          <Star className={`h-3.5 w-3.5 ${onlyFavorites ? "fill-amber-400 text-amber-400" : ""}`} />
          <span>⭐ Meus Favoritos ({favoriteItems.length})</span>
        </button>

        {onlyFavorites && (
          <span className="text-[10px] text-zinc-500">Mídias salvas com estrela</span>
        )}
      </div>

      {/* sub-aba do STICKERS */}
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
            🎨 Figurinhas (PNG Transparente)
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

      {/* busca por texto */}
      {(!isSticker || stickTab === "stickers") && (
        <form
          onSubmit={(e) => {
            searchedRef.current = true;
            void search(e);
          }}
          className="flex shrink-0 gap-1.5"
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              onlyFavorites
                ? "Filtrar seus favoritos..."
                : isShortsMode
                ? "Buscar fundo para Shorts (ex: curiosidades, lofi, tech, mistério)..."
                : activeTab.ph
            }
            className="h-8 border-[#2a3546] bg-[#121722] text-xs text-zinc-200 placeholder:text-zinc-600"
          />
          <Button
            type="submit"
            size="icon"
            className="h-8 w-8 shrink-0 bg-[var(--gc-accent)] text-black hover:bg-[var(--gc-accent-hover)]"
            aria-label={t("ss.search")}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>
      )}

      {/* ---- EFEITOS SONOROS: chips de exemplos rápidos ---- */}
      {type === "sfx" && !onlyFavorites && (
        <div className="shrink-0 space-y-1">
          <div className="flex items-center justify-between text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
            <span className="flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-emerald-400" /> Exemplos de Efeitos Sonoros
            </span>
            <span className="text-[8px] text-zinc-600 font-normal">1-clique para buscar</span>
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
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] transition ${
                  query === ex.q
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 font-medium shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                    : "border-[#2a3546] bg-[#121722] text-zinc-300 hover:border-emerald-500/60 hover:text-white"
                }`}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- MÚSICA: Banner & Categorias de Shorts ---- */}
      {isShortsMode && !onlyFavorites && (
        <div className="shrink-0 space-y-1.5 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-[#121722] to-amber-500/5 p-2 shadow-inner">
          <div className="flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1.5 font-bold text-amber-300">
              <Flame className="h-3.5 w-3.5 text-amber-400" /> Fundos para Shorts (100% Instrumental)
            </span>
            <span className="text-[9px] text-zinc-400 font-medium">Sem vozes · Ideal para narração</span>
          </div>
          <div className="flex gap-1 overflow-x-auto pb-0.5 timeline-scroll">
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
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] transition flex items-center gap-1 ${
                  shortsVibe === cat.id
                    ? "border-amber-400 bg-amber-400/20 text-amber-200 font-semibold shadow-[0_0_8px_rgba(251,191,36,0.35)]"
                    : "border-[#2a3546] bg-[#0e1320] text-zinc-300 hover:border-amber-400/60 hover:text-white"
                }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ---- emojis (offline, grid organizado por categoria) ---- */}
      {isSticker && stickTab === "emojis" && !onlyFavorites && (
        <div className="min-h-0 flex-1 space-y-3">
          <p className="rounded-lg border border-[#232d3d] bg-[#0e1320] p-2.5 text-[10px] leading-relaxed text-zinc-500">
            {t("ss.emojiNote")}
          </p>
          {STICKER_SETS.map((set) => (
            <div key={set.key}>
              <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{t(`ss.cat.${set.key}`)}</p>
              <div className="grid grid-cols-6 gap-1">
                {set.emojis.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => addSticker(e)}
                    className="flex aspect-square items-center justify-center rounded-lg border border-[#232d3d] bg-[#0e1320] text-xl transition hover:scale-110 hover:border[var(--gc-accent-50)] hover:bg[var(--gc-accent-10)]"
                    title={`${t("ss.addN", { name: e })}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* gêneros musicais (estilo CapCut) */}
      {showGenre && !onlyFavorites && (
        <div className="shrink-0">
          <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
            <Music4 className="h-3 w-3" /> {t("ss.genre")}
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1 timeline-scroll">
            {GENRES.map((g) => {
              const active = genre === g.id || (g.id === "shorts" && genre.startsWith("shorts"));
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setGenre(g.id);
                    if (g.id === "shorts") setShortsVibe("all");
                  }}
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] transition ${
                    g.isSpecial
                      ? active
                        ? "border-amber-400 bg-amber-400/25 text-amber-300 font-bold shadow-[0_0_10px_rgba(251,191,36,0.35)]"
                        : "border-amber-500/40 bg-amber-500/10 text-amber-300/90 font-medium hover:border-amber-400 hover:text-amber-200"
                      : active
                      ? "border-[var(--gc-accent)] bg[var(--gc-accent-15)] text-[var(--gc-accent)] font-semibold"
                      : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                  }`}
                >
                  {t(g.key)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* duração: pré-opções + personalizado */}
      {showDur && !onlyFavorites && (
        <div className="shrink-0">
          <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
            <Clock className="h-3 w-3" /> {t("ss.duration")}
          </div>
          <div className="flex flex-wrap gap-1">
            {([
              { id: "any", label: t("ss.any") },
              { id: "short", label: t("ss.short") },
              { id: "mid", label: t("ss.mid") },
              { id: "long", label: t("ss.long") },
              { id: "custom", label: t("ss.custom") },
            ] as const).map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDur(d.id)}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] transition ${
                  dur === d.id
                    ? "border-[var(--gc-accent)] bg[var(--gc-accent-15)] text-[var(--gc-accent)] font-semibold"
                    : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
          {dur === "custom" && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                value={cmin}
                onChange={(e) => setCmin(Number(e.target.value))}
                className="h-7 w-16 border-[#2a3546] bg-[#0e1320] text-[10px] text-zinc-200"
                aria-label={t("ss.duration")}
              />
              <span className="text-[10px] text-zinc-500">{t("ss.to")}</span>
              <Input
                type="number"
                min={1}
                value={cmax}
                onChange={(e) => setCmax(Number(e.target.value))}
                className="h-7 w-16 border-[#2a3546] bg-[#0e1320] text-[10px] text-zinc-200"
                aria-label={t("ss.duration")}
              />
              <span className="text-[10px] text-zinc-500">{t("ss.seconds")}</span>
              <Button
                type="button"
                size="sm"
                className="h-7 bg-[var(--gc-accent)] px-2 text-[10px] font-semibold text-black hover:bg-[var(--gc-accent-hover)]"
                onClick={() => {
                  searchedRef.current = true;
                  void search();
                }}
              >
                {t("ss.apply")}
              </Button>
            </div>
          )}
        </div>
      )}

      {translated && (
        <p className="shrink-0 px-1 text-[10px] text-zinc-500">{t("ss.translated", { q: translated })}</p>
      )}

      {/* resultados — rolagem nativa (roda do mouse sempre funciona) */}
      {(!isSticker || stickTab === "stickers") && (
        <div className="min-h-[260px] flex-1 shrink-0 overflow-y-auto overscroll-contain pr-0.5 timeline-scroll">
          {displayItems === null || displayItems.length === 0 ? (
            <div className="space-y-2 px-1 py-4">
              {onlyFavorites ? (
                <div className="text-center py-8 space-y-2 text-zinc-500">
                  <Star className="h-8 w-8 mx-auto text-amber-400/50" />
                  <p className="text-xs font-semibold text-zinc-300">Nenhum favorito salvo ainda</p>
                  <p className="text-[10px] text-zinc-500">
                    Clique na estrela (⭐) em qualquer vídeo, música ou efeito para salvá-lo aqui e nas suas próximas edições!
                  </p>
                </div>
              ) : isSticker ? (
                <p className="text-center text-[11px] leading-relaxed text-zinc-600">{t("ss.stickerNote")}</p>
              ) : (
                <>
                  <p className="text-center text-[11px] leading-relaxed text-zinc-600">{t("ss.intro")}</p>
                  <div className="rounded-lg border border-[#232d3d] bg-[#121722] p-2.5 text-[10px] leading-relaxed text-zinc-500">
                    <p className="mb-1 flex items-center gap-1 font-medium text-zinc-400">
                      <Copyright className="h-3 w-3" /> {t("ss.licenses")}
                    </p>
                    {(["free", "credit", "nc", "unknown"] as const).map((k) => (
                      <p key={k} className="flex items-center gap-1.5">
                        <span className={`w-14 rounded border px-1 text-center text-[8px] ${LICENSE_STYLE[k].cls}`}>
                          {t(`st.lic${k[0].toUpperCase()}${k.slice(1)}`)}
                        </span>
                        <span className="text-zinc-600">{t(`st.lic${k[0].toUpperCase()}${k.slice(1)}Title`)}</span>
                      </p>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className={`grid gap-1.5 pb-2 ${isSticker ? "grid-cols-3" : "grid-cols-2"}`}>
              {displayItems.map((it) => {
                const lv = licenseLevel(it.license);
                const ls = LICENSE_STYLE[lv];
                const isVideoTile = type === "video" && !it.audio;
                const curated = (it as any).badge ? (it as CuratedShortsTrack) : undefined;
                const starred = isFavorite(it.id);

                return (
                  <div
                    key={it.id}
                    className="group relative overflow-hidden rounded-lg border border-[#232d3d] bg-[#121722] hover:border-[#384961] transition shadow-sm"
                    onMouseEnter={() => isVideoTile && setHoverVideo(it.id)}
                    onMouseLeave={() => setHoverVideo((v) => (v === it.id ? null : v))}
                  >
                    <div
                      className={`relative ${isSticker ? "aspect-square" : "aspect-video"} ${
                        isSticker ? "bg-[#0e1320]" : "bg-[#0a0d14]"
                      }`}
                    >
                      {it.thumb ? (
                        <img
                          src={it.thumb}
                          alt={it.title}
                          loading="lazy"
                          className={`h-full w-full ${isSticker ? "object-contain p-1.5" : "object-cover"}`}
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-zinc-700">
                          {it.audio ? <Music2 className="h-5 w-5" /> : <Film className="h-5 w-5" />}
                        </div>
                      )}
                      {isVideoTile && <VideoPreviewLayer item={it} active={hoverVideo === it.id} />}

                      {/* Selo de Licença */}
                      <span
                        className={`absolute left-1 top-1 rounded border px-1 py-px text-[8px] backdrop-blur ${ls.cls}`}
                        title={t(`st.lic${lv[0].toUpperCase()}${lv.slice(1)}Title`)}
                      >
                        {t(`st.lic${lv[0].toUpperCase()}${lv.slice(1)}`)}
                      </span>

                      {/* Botão de Estrela / Favorito */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const resolvedKind = it.audio ? (type === "sfx" ? "sfx" : "music") : isSticker ? "sticker" : isVideoTile ? "video" : "image";
                          toggleFavorite(it, resolvedKind);
                        }}
                        className={`absolute right-1 top-1 z-30 flex h-6 w-6 items-center justify-center rounded-md border transition ${
                          starred
                            ? "border-amber-400 bg-amber-400/90 text-black shadow-md scale-105"
                            : "border-black/50 bg-black/60 text-zinc-400 hover:border-amber-400 hover:text-amber-300 opacity-80 group-hover:opacity-100"
                        }`}
                        title={starred ? "Remover dos Favoritos" : "Favoritar (salvar em ⭐ Favoritos)"}
                        aria-label="Favoritar"
                      >
                        <Star className={`h-3.5 w-3.5 ${starred ? "fill-black text-black" : ""}`} />
                      </button>

                      {/* Duração */}
                      {it.duration ? (
                        <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 text-[8px] tabular-nums text-zinc-300">
                          {fmtDur(it.duration)}
                        </span>
                      ) : null}

                      {/* Badge Curado */}
                      {curated?.badge && (
                        <span className="absolute left-1 bottom-1 rounded bg-amber-400 text-black px-1.5 py-px text-[8px] font-bold shadow-sm">
                          {curated.badge}
                        </span>
                      )}

                      {/* Botão de Inserção (+) */}
                      <button
                        onClick={() => void addStock(it)}
                        disabled={adding === it.id}
                        className="absolute inset-0 flex items-center justify-center bg-black/60 text-[var(--gc-accent)] opacity-0 transition group-hover:opacity-100"
                        aria-label={t("ss.addN", { name: it.title })}
                      >
                        {adding === it.id ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Plus className="h-6 w-6" strokeWidth={2.5} />
                        )}
                      </button>

                      {/* Botão de PLAY / PRÉVIA (Abre Modal Grande + Player Bar) */}
                      {(it.audio || isVideoTile || type === "video") && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setPreviewItem(it);
                            setPreviewOpen(true);
                            openPlayer({
                              id: it.id,
                              title: it.title,
                              url: it.url,
                              kind: it.audio ? "audio" : "video",
                              thumb: it.thumb,
                              isIa: it.provider.includes("Internet Archive"),
                            });
                          }}
                          className="absolute bottom-1.5 right-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-white/30 bg-black/80 text-white shadow-md transition hover:scale-110 hover:bg-[var(--gc-accent)] hover:text-black opacity-90 group-hover:opacity-100"
                          title="Assistir / Ouvir Prévia Completa"
                          aria-label="Assistir / Ouvir Prévia Completa"
                        >
                          <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                        </button>
                      )}
                    </div>

                    {!isSticker && (
                      <div className="p-1.5">
                        <p className="truncate text-[10px] text-zinc-300 font-medium" title={it.title}>
                          {it.title}
                        </p>
                        <div className="mt-0.5 flex items-center justify-between gap-1">
                          <span
                            className="truncate text-[8px] text-zinc-500"
                            title={it.creator ? `${it.creator}` : undefined}
                          >
                            {curated?.vibeLabel ? `${curated.vibeLabel} · ` : ""}
                            {it.provider}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Prompt amigável quando uma categoria de música estiver marcada */}
          {type === "music" && genre !== "all" && !onlyFavorites && displayItems !== null && (
            <div className="my-3 rounded-xl border border-[#2a3546] bg-[#121722]/80 p-3 text-center space-y-2">
              <p className="text-xs font-medium text-zinc-300 leading-snug">
                Procurando outros estilos de trilha sonora?
              </p>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Marque a categoria <strong>"Todas"</strong> para ver mais opções de músicas de todos os gêneros.
              </p>
              <Button
                size="sm"
                type="button"
                onClick={() => {
                  setGenre("all");
                  searchedRef.current = true;
                  void searchDirect(query || "music", "music", dur, "all");
                }}
                className="h-7 px-3 text-[11px] bg-[var(--gc-accent)] hover:bg-[var(--gc-accent-hover)] text-black font-semibold gap-1.5"
              >
                <Music4 className="h-3.5 w-3.5" /> Marcar em Todas
              </Button>
            </div>
          )}
        </div>
      )}

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
