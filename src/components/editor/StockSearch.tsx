// GalaxyCut — aba de busca online: fotos, vídeos, músicas, efeitos e STICKERS
// de bancos livres (Openverse, Freesound, Wikimedia, Internet Archive, Jamendo,
// Pexels, Pixabay). v7.1: sticker virou BUSCA DE STICKERS DE VERDADE (PNGs com
// transparência) com uma sub-aba de emojis organizadinha dentro dele.
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ImageIcon, Music2, Film, Loader2, Search, Plus, AudioLines, Music4, Video, Clock, Copyright, Play, Smile, Sticker, Sparkles, FolderPlus } from "lucide-react";
import { useProject, usePlayback } from "@/lib/editor/store";
import { useSettings } from "@/lib/editor/settings";
import { registry } from "@/lib/editor/media";
import { licenseLevel, LICENSE_STYLE } from "@/lib/editor/types";
import { StockItem, downloadStockFile, resolveIaFile, searchStock, searchStickers } from "@/lib/editor/stockClient";
import { useLibPlayer } from "@/lib/editor/libPlayer";
import { useT } from "@/lib/editor/i18n";

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

const GENRES = [
  { id: "all", label: "Todas", key: "g.all" },
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
  const [cmin, setCmin] = useState(10);
  const [cmax, setCmax] = useState(60);
  // sub-aba do Stickers: busca de figurinhas ou emojis
  const [stickTab, setStickTab] = useState<"stickers" | "emojis">("stickers");
  const addMedia = useProject((s) => s.addMedia);
  const addClipFromMedia = useProject((s) => s.addClipFromMedia);
  const openPlayer = useLibPlayer((s) => s.open);
  const searchedRef = useRef(false);
  /** id do vídeo com prévia rodando (hover) */
  const [hoverVideo, setHoverVideo] = useState<string | null>(null);

  const TYPE_TABS: { id: StockType; label: string; icon: typeof ImageIcon; ph: string }[] = [
    { id: "image", label: t("ss.photo"), icon: ImageIcon, ph: t("ss.phPhoto") },
    { id: "video", label: t("ss.video"), icon: Video, ph: t("ss.phVideo") },
    { id: "music", label: t("ss.music"), icon: Music4, ph: t("ss.phMusic") },
    { id: "sfx", label: t("ss.sfx"), icon: AudioLines, ph: t("ss.phSfx") },
    { id: "sticker", label: t("ss.sticker"), icon: Sticker, ph: t("ss.phSticker") },
  ];

  const showDur = type !== "image" && type !== "sticker";
  const showGenre = type === "music";
  const isSticker = type === "sticker";

  async function search(e?: FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    if (isSticker) {
      // stickers: busca PNGs com transparência
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
      if (!results.length) {
        toast.info(t("ss.nothing"), { description: t("ss.nothingDesc") });
      }
    } catch {
      toast.error(t("ss.fail"), { description: t("ss.failDesc") });
    } finally {
      setLoading(false);
    }
  }

  async function searchDirect(qText: string, searchType = type, searchDur = dur, searchGenre = genre) {
    const qClean = qText.trim() || (searchType === "music" ? "music" : searchType === "sfx" ? "sound effect" : "");
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
      if (!results.length) {
        toast.info(t("ss.nothing"), { description: t("ss.nothingDesc") });
      }
    } catch {
      toast.error(t("ss.fail"), { description: t("ss.failDesc") });
    } finally {
      setLoading(false);
    }
  }

  // trocar filtro/gênero/aba re-busca automaticamente
  useEffect(() => {
    if (!isSticker) {
      if (query.trim() || type === "music" || type === "sfx") {
        void searchDirect(query || (type === "music" ? "music background" : "sound effect"), type, dur, genre);
      }
    }
  }, [type, dur, genre]);

  async function addStock(item: StockItem) {
    setAdding(item.id);
    try {
      // Internet Archive resolve o arquivo na hora
      let url = item.url;
      if (item.provider.includes("Internet Archive")) {
        const d = await resolveIaFile(item.id.replace(/^ia-/, ""));
        url = d.url;
      }
      const blob = await downloadStockFile(url);
      const ext = /\.(mp3|wav|ogg|m4a|flac|opus|mp4|webm|mov|png|jpe?g|webp|gif)$/i.exec(url)?.[1] ?? (item.audio ? "mp3" : type === "video" ? "mp4" : "png");
      const name = `${item.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 40)}.${ext}`;
      const meta = await registry.importFile(blob, name);

      // Pasta própria automática por categoria
      const categoryNames: Record<StockType, string> = {
        music: "Músicas",
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
        description: `Adicionado à pasta "${catFolder.name}" · ${licenseLevel(item.license) === "free" ? t("ss.addedFree") : t("ss.addedCredit")}`,
      });
    } catch (err) {
      toast.error(t("ss.downloadFail"), { description: String((err as Error).message ?? err) });
    } finally {
      setAdding(null);
    }
  }

  const activeTab = TYPE_TABS.find((tb) => tb.id === type)!;

  /** sticker de emoji: entra na faixa de texto como figurinha grande */
  function addSticker(emoji: string) {
    const at = usePlayback.getState().playhead;
    useProject.getState().addTextClip(at, {
      content: emoji,
      size: 200,
      bold: false,
      strokeW: 0,
      shadow: false,
      bg: "",
      highlight: false,
    });
    toast.success(t("ss.emojiAdded", { emoji }), { description: t("ss.emojiAddedDesc") });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2.5 timeline-scroll">
      <div className="grid shrink-0 grid-cols-5 gap-1 rounded-lg bg-[#151b26] p-0.5">
        {TYPE_TABS.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => {
              setType(tb.id);
              setItems(null); // trocou de aba: limpa os resultados
              searchedRef.current = false;
            }}
            className={`flex items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] transition ${
              type === tb.id ? "bg-[#232d3d] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <tb.icon className="h-3 w-3" /> {tb.label}
          </button>
        ))}
      </div>

      {/* ---- aba STICKER: busca de figurinhas + sub-aba de emojis ---- */}
      {isSticker && (
        <div className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-[#151b26] p-0.5">
          <button
            type="button"
            onClick={() => setStickTab("stickers")}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1 text-[11px] transition ${
              stickTab === "stickers" ? "bg-[#232d3d] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Sticker className="h-3 w-3" /> {t("ss.stickersTab")}
          </button>
          <button
            type="button"
            onClick={() => setStickTab("emojis")}
            className={`flex items-center justify-center gap-1.5 rounded-md py-1 text-[11px] transition ${
              stickTab === "emojis" ? "bg-[#232d3d] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <Smile className="h-3 w-3" /> {t("ss.emojisTab")}
          </button>
        </div>
      )}

      {/* ---- busca por texto ---- */}
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
            placeholder={activeTab.ph}
            className="h-8 border-[#2a3546] bg-[#121722] text-xs text-zinc-200 placeholder:text-zinc-600"
          />
          <Button type="submit" size="icon" className="h-8 w-8 shrink-0 bg-[var(--gc-accent)] text-black hover:bg-[var(--gc-accent-hover)]" aria-label={t("ss.search")}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </form>
      )}

      {/* ---- EFEITOS SONOROS: chips de exemplos rápidos ---- */}
      {type === "sfx" && (
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

      {/* ---- emojis (offline, grid organizado por categoria) ---- */}
      {isSticker && stickTab === "emojis" && (
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
      {showGenre && (
        <div className="shrink-0">
          <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
            <Music4 className="h-3 w-3" /> {t("ss.genre")}
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1 timeline-scroll">
            {GENRES.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGenre(g.id)}
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] transition ${
                  genre === g.id
                    ? "border-[var(--gc-accent)] bg[var(--gc-accent-15)] text-[var(--gc-accent)]"
                    : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                }`}
              >
                {t(g.key)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* duração: pré-opções + personalizado */}
      {showDur && (
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
                    ? "border-[var(--gc-accent)] bg[var(--gc-accent-15)] text-[var(--gc-accent)]"
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
          {items === null ? (
            <div className="space-y-2 px-1 py-4">
              {isSticker ? (
                <p className="text-center text-[11px] leading-relaxed text-zinc-600">{t("ss.stickerNote")}</p>
              ) : (
                <>
                  <p className="text-center text-[11px] leading-relaxed text-zinc-600">{t("ss.intro")}</p>
                  <div className="rounded-lg border border-[#232d3d] bg-[#121722] p-2.5 text-[10px] leading-relaxed text-zinc-500">
                    <p className="mb-1 flex items-center gap-1 font-medium text-zinc-400"><Copyright className="h-3 w-3" /> {t("ss.licenses")}</p>
                    {(["free", "credit", "nc", "unknown"] as const).map((k) => (
                      <p key={k} className="flex items-center gap-1.5">
                        <span className={`w-14 rounded border px-1 text-center text-[8px] ${LICENSE_STYLE[k].cls}`}>{t(`st.lic${k[0].toUpperCase()}${k.slice(1)}`)}</span>
                        <span className="text-zinc-600">{t(`st.lic${k[0].toUpperCase()}${k.slice(1)}Title`)}</span>
                      </p>
                    ))}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className={`grid gap-1.5 pb-2 ${isSticker ? "grid-cols-3" : "grid-cols-2"}`}>
              {items.map((it) => {
                const lv = licenseLevel(it.license);
                const ls = LICENSE_STYLE[lv];
                const isVideoTile = type === "video" && !it.audio;
                return (
                  <div
                    key={it.id}
                    className="group overflow-hidden rounded-lg border border-[#232d3d] bg-[#121722]"
                    onMouseEnter={() => isVideoTile && setHoverVideo(it.id)}
                    onMouseLeave={() => setHoverVideo((v) => (v === it.id ? null : v))}
                  >
                    <div className={`relative ${isSticker ? "aspect-square" : "aspect-video"} ${isSticker ? "bg-[#0e1320]" : "bg-[#0a0d14]"}`}>
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
                      {/* prévia de vídeo: passe o mouse e ele toca (mudo, em loop) */}
                      {isVideoTile && <VideoPreviewLayer item={it} active={hoverVideo === it.id} />}
                      <span className={`absolute left-1 top-1 rounded border px-1 py-px text-[8px] backdrop-blur ${ls.cls}`} title={t(`st.lic${lv[0].toUpperCase()}${lv.slice(1)}Title`)}>
                        {t(`st.lic${lv[0].toUpperCase()}${lv.slice(1)}`)}
                      </span>
                      {it.duration ? (
                        <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[8px] tabular-nums text-zinc-300">{fmtDur(it.duration)}</span>
                      ) : null}
                      {isVideoTile && !hoverVideo && (
                        <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[8px] text-zinc-300">{t("ss.hoverPreview")}</span>
                      )}
                      <button
                        onClick={() => void addStock(it)}
                        disabled={adding === it.id}
                        className="absolute inset-0 flex items-center justify-center bg-black/60 text-[var(--gc-accent)] opacity-0 transition group-hover:opacity-100"
                        aria-label={t("ss.addN", { name: it.title })}
                      >
                        {adding === it.id ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-6 w-6" strokeWidth={2.5} />}
                      </button>
                      {/* tocar no player de baixo (vídeo, música e efeito) */}
                      {(it.audio || isVideoTile) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openPlayer({
                              id: it.id,
                              title: it.title,
                              url: it.url,
                              kind: it.audio ? "audio" : "video",
                              thumb: it.thumb,
                              isIa: it.provider.includes("Internet Archive"),
                            });
                          }}
                          className={`absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/70 text-white transition hover:bg-black/90 ${
                            hoverVideo === it.id ? "opacity-0" : "opacity-0 group-hover:opacity-100"
                          }`}
                          title={t("ss.playHint")}
                          aria-label={t("ss.playHint")}
                        >
                          <Play className="h-3 w-3 fill-current" />
                        </button>
                      )}
                    </div>
                    {!isSticker && (
                      <div className="p-1.5">
                        <p className="truncate text-[10px] text-zinc-400" title={it.title}>{it.title}</p>
                        <div className="mt-0.5 flex items-center justify-between gap-1">
                          <span className="truncate text-[8px] text-zinc-600" title={it.creator ? `${it.creator}` : undefined}>
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
          {type === "music" && genre !== "all" && items !== null && (
            <div className="my-3 rounded-xl border border-[#2a3546] bg-[#121722]/80 p-3 text-center space-y-2">
              <p className="text-xs font-medium text-zinc-300 leading-snug">
                Não conseguiu encontrar o que procurava nesta categoria?
              </p>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Marque a categoria <strong>"Todas"</strong> para ver muito mais opções de músicas de todos os estilos.
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
    // pequena espera pra não disparar vídeo só por passar o mouse voando
    const t = setTimeout(() => {
      if (cancelled || !hostRef.current) return;
      const v = document.createElement("video");
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = "auto";
      v.className = "absolute inset-0 h-full w-full bg-black object-cover";
      v.src = item.url; // direto (sem proxy — se o host bloquear, fica a miniatura)
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
