// GalaxyCut — aba de busca online: fotos, vídeos, músicas e efeitos de bancos
// livres (Openverse, Freesound, Wikimedia, Internet Archive, Jamendo, Pexels,
// Pixabay). Roda DIRETO no navegador (sem servidor) — dá pra publicar em
// qualquer host estático. Prévia de vídeo no hover + player fixo embaixo.
"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ImageIcon, Music2, Film, Loader2, Search, Plus, AudioLines, Music4, Video, Clock, Copyright, Play } from "lucide-react";
import { useProject } from "@/lib/editor/store";
import { useSettings } from "@/lib/editor/settings";
import { registry } from "@/lib/editor/media";
import { licenseLevel, LICENSE_STYLE } from "@/lib/editor/types";
import { StockItem, downloadStockFile, resolveIaFile, searchStock } from "@/lib/editor/stockClient";
import { useLibPlayer } from "@/lib/editor/libPlayer";

type StockType = "image" | "video" | "music" | "sfx";
type DurId = "any" | "short" | "mid" | "long" | "custom";

const TYPE_TABS: { id: StockType; label: string; icon: typeof ImageIcon; ph: string }[] = [
  { id: "image", label: "Foto", icon: ImageIcon, ph: "ex: montanha ao pôr do sol" },
  { id: "video", label: "Vídeo", icon: Video, ph: "ex: gameplay minecraft" },
  { id: "music", label: "Música", icon: Music4, ph: "ex: épico tensão" },
  { id: "sfx", label: "Efeito", icon: AudioLines, ph: "ex: explosão whoosh" },
];

/** Gêneros musicais estilo CapCut (os terms entram na busca). */
const GENRES: { id: string; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "epic", label: "Épico" },
  { id: "calm", label: "Calmo" },
  { id: "electronic", label: "Eletrônica" },
  { id: "gaming", label: "Gaming" },
  { id: "lofi", label: "Lo-Fi" },
  { id: "trap", label: "Trap/HipHop" },
  { id: "rock", label: "Rock" },
  { id: "classical", label: "Clássico" },
  { id: "ambient", label: "Ambiente" },
  { id: "happy", label: "Alegre" },
  { id: "tense", label: "Tensão" },
  { id: "sad", label: "Triste" },
  { id: "funk", label: "Funk/Soul" },
];

const DUR_OPTIONS: { id: DurId; label: string }[] = [
  { id: "any", label: "Qualquer" },
  { id: "short", label: "≤ 15s" },
  { id: "mid", label: "15s–1min" },
  { id: "long", label: "+ 1min" },
  { id: "custom", label: "Personalizado" },
];

function fmtDur(d: number) {
  if (!isFinite(d)) return "—";
  const m = Math.floor(d / 60);
  const s = Math.floor(d % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function StockSearch() {
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
  const addMedia = useProject((s) => s.addMedia);
  const addClipFromMedia = useProject((s) => s.addClipFromMedia);
  const openPlayer = useLibPlayer((s) => s.open);
  const searchedRef = useRef(false);
  /** id do vídeo com prévia rodando (hover) */
  const [hoverVideo, setHoverVideo] = useState<string | null>(null);

  const showDur = type !== "image";
  const showGenre = type === "music";

  async function search(e?: FormEvent) {
    e?.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setTranslated(null);
    try {
      const keys = useSettings.getState().keys;
      const { results, translated: tr } = await searchStock({
        q: query,
        type,
        dur,
        genre,
        ...(dur === "custom" ? { dmin: Math.max(0, Math.min(cmin, cmax)), dmax: Math.max(1, Math.max(cmin, cmax)) } : {}),
        pexelsKey: keys.pexels || undefined,
        pixabayKey: keys.pixabay || undefined,
      });
      setItems(results);
      if (tr && tr !== query) setTranslated(tr);
      if (!results.length) {
        toast.info("Nada encontrado", {
          description: "Tenta outra palavra, outra duração ou outro gênero (busco em português e inglês).",
        });
      }
    } catch {
      toast.error("Falha na busca online", { description: "Checa sua conexão e tenta de novo." });
    } finally {
      setLoading(false);
    }
  }

  // trocar filtro/gênero/aba re-busca automaticamente (se já buscou algo)
  useEffect(() => {
    if (searchedRef.current && query.trim()) void search();
     
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
      const ext = /\.(mp3|wav|ogg|m4a|flac|opus|mp4|webm|mov|png|jpe?g|webp|gif)$/i.exec(url)?.[1] ?? (item.audio ? "mp3" : type === "video" ? "mp4" : "jpg");
      const name = `${item.title.replace(/[\\/:*?"<>|]/g, "").slice(0, 40)}.${ext}`;
      const meta = await registry.importFile(blob, name);
      addMedia({
        ...meta,
        source: "stock",
        stockUrl: url,
        license: item.license,
        licenseLabel: item.license,
        creator: item.creator,
      });
      addClipFromMedia(meta.id);
      toast.success("Salvo na aba Mídia e adicionado à timeline!", {
        description: licenseLevel(item.license) === "free" ? "Fica salvo no navegador — recarregar a página não perde." : "Lembra de dar crédito ao autor na descrição.",
      });
    } catch (err) {
      toast.error("Não consegui baixar este arquivo", { description: String((err as Error).message ?? err) });
    } finally {
      setAdding(null);
    }
  }

  const activeTab = TYPE_TABS.find((t) => t.id === type)!;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto p-2.5 timeline-scroll">
      <div className="grid shrink-0 grid-cols-4 gap-1 rounded-lg bg-[#151b26] p-0.5">
        {TYPE_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setType(t.id)}
            className={`flex items-center justify-center gap-1 rounded-md px-1 py-1 text-[11px] transition ${
              type === t.id ? "bg-[#232d3d] text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            <t.icon className="h-3 w-3" /> {t.label}
          </button>
        ))}
      </div>
      <form onSubmit={(e) => { searchedRef.current = true; void search(e); }} className="flex shrink-0 gap-1.5">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={activeTab.ph}
          className="h-8 border-[#2a3546] bg-[#121722] text-xs text-zinc-200 placeholder:text-zinc-600"
        />
        <Button type="submit" size="icon" className="h-8 w-8 shrink-0 bg-[#22C55E] text-black hover:bg-[#1ed467]" aria-label="Buscar">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </Button>
      </form>

      {/* gêneros musicais (estilo CapCut) */}
      {showGenre && (
        <div className="shrink-0">
          <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
            <Music4 className="h-3 w-3" /> Gênero
          </div>
          <div className="flex gap-1 overflow-x-auto pb-1 timeline-scroll">
            {GENRES.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGenre(g.id)}
                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] transition ${
                  genre === g.id
                    ? "border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]"
                    : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* duração: pré-opções + personalizado */}
      {showDur && (
        <div className="shrink-0">
          <div className="mb-1 flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
            <Clock className="h-3 w-3" /> Duração
          </div>
          <div className="flex flex-wrap gap-1">
            {DUR_OPTIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDur(d.id)}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] transition ${
                  dur === d.id
                    ? "border-[#22C55E] bg-[#22C55E]/15 text-[#22C55E]"
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
                aria-label="Duração mínima em segundos"
              />
              <span className="text-[10px] text-zinc-500">até</span>
              <Input
                type="number"
                min={1}
                value={cmax}
                onChange={(e) => setCmax(Number(e.target.value))}
                className="h-7 w-16 border-[#2a3546] bg-[#0e1320] text-[10px] text-zinc-200"
                aria-label="Duração máxima em segundos"
              />
              <span className="text-[10px] text-zinc-500">segundos</span>
              <Button
                type="button"
                size="sm"
                className="h-7 bg-[#22C55E] px-2 text-[10px] font-semibold text-black hover:bg-[#1ed467]"
                onClick={() => {
                  searchedRef.current = true;
                  void search();
                }}
              >
                Aplicar
              </Button>
            </div>
          )}
        </div>
      )}

      {translated && (
        <p className="shrink-0 px-1 text-[10px] text-zinc-500">
          Busquei também por <b className="text-zinc-400">“{translated}”</b> (traduzi pra inglês pra achar mais)
        </p>
      )}

      {/* resultados — rolagem nativa (roda do mouse sempre funciona) */}
      <div className="min-h-[260px] flex-1 shrink-0 overflow-y-auto overscroll-contain pr-0.5 timeline-scroll">
        {items === null ? (
          <div className="space-y-2 px-1 py-4">
            <p className="text-center text-[11px] leading-relaxed text-zinc-600">
              Fotos, vídeos, <b className="text-zinc-400">músicas</b> e <b className="text-zinc-400">efeitos</b> de bancos
              livres (Openverse, Freesound, Wikimedia, Internet Archive, Jamendo…). Pode pesquisar em português — eu traduzo
              e ordeno pelos mais relevantes.
            </p>
            <div className="rounded-lg border border-[#232d3d] bg-[#121722] p-2.5 text-[10px] leading-relaxed text-zinc-500">
              <p className="mb-1 flex items-center gap-1 font-medium text-zinc-400"><Copyright className="h-3 w-3" /> Selos de licença</p>
              {(["free", "credit", "nc", "unknown"] as const).map((k) => (
                <p key={k} className="flex items-center gap-1.5">
                  <span className={`w-14 rounded border px-1 text-center text-[8px] ${LICENSE_STYLE[k].cls}`}>{LICENSE_STYLE[k].label}</span>
                  <span className="text-zinc-600">{LICENSE_STYLE[k].title}</span>
                </p>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5 pb-2">
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
                  <div className="relative aspect-video bg-[#0a0d14]">
                    {it.thumb ? (
                      <img src={it.thumb} alt={it.title} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-zinc-700">
                        {it.audio ? <Music2 className="h-5 w-5" /> : <Film className="h-5 w-5" />}
                      </div>
                    )}
                    {/* prévia de vídeo: passe o mouse e ele toca (mudo, em loop) */}
                    {isVideoTile && <VideoPreviewLayer item={it} active={hoverVideo === it.id} />}
                    <span className={`absolute left-1 top-1 rounded border px-1 py-px text-[8px] backdrop-blur ${ls.cls}`} title={ls.title}>
                      {ls.label}
                    </span>
                    {it.duration ? (
                      <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[8px] tabular-nums text-zinc-300">{fmtDur(it.duration)}</span>
                    ) : null}
                    {isVideoTile && !hoverVideo && (
                      <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[8px] text-zinc-300">passe o mouse p/ prévia</span>
                    )}
                    <button
                      onClick={() => void addStock(it)}
                      disabled={adding === it.id}
                      className="absolute inset-0 flex items-center justify-center bg-black/60 text-[#22C55E] opacity-0 transition group-hover:opacity-100"
                      aria-label={`Adicionar ${it.title}`}
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
                        title="Tocar no player (fica embaixo, dá pra pausar, avançar e arrastar)"
                        aria-label={`Tocar ${it.title}`}
                      >
                        <Play className="h-3 w-3 fill-current" />
                      </button>
                    )}
                  </div>
                  <div className="p-1.5">
                    <p className="truncate text-[10px] text-zinc-400" title={it.title}>{it.title}</p>
                    <div className="mt-0.5 flex items-center justify-between gap-1">
                      <span className="truncate text-[8px] text-zinc-600" title={it.creator ? `por ${it.creator}` : undefined}>
                        {it.provider}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
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
