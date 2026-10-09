// GalaxyCut — player da biblioteca: UMA barra fixa embaixo do painel toca
// vídeo/música/efeito (da busca OU da aba Mídia). Tocar um para o outro.
"use client";

import { create } from "zustand";

export interface LibItem {
  id: string;
  title: string;
  url: string; // URL final (ou do Internet Archive p/ resolver depois)
  kind: "video" | "audio";
  thumb?: string;
  isIa?: boolean; // Internet Archive: resolve o arquivo de verdade antes de tocar
  provider?: string;
  creator?: string;
  license?: string;
  duration?: number;
  rawStockItem?: any;
}

interface LibPlayerState {
  item: LibItem | null;
  /** URL já resolvida (IA resolve na hora de abrir) */
  src: string | null;
  loading: boolean;
  open: (it: LibItem) => void;
  setSrc: (u: string) => void;
  close: () => void;
}

export const useLibPlayer = create<LibPlayerState>((set, get) => ({
  item: null,
  src: null,
  loading: false,
  open: (it) => {
    // 1. Se a URL já for um arquivo direto de mídia (MP3, WAV, OGG, blob, download direto, etc.)
    const isDirectAudioVideo =
      it.url &&
      (it.url.startsWith("blob:") ||
        it.url.startsWith("data:") ||
        it.url.includes("/download/") ||
        /\.(mp3|wav|ogg|m4a|aac|flac|opus|weba|mp4|webm|mov)(\?.*)?$/i.test(it.url));

    if (isDirectAudioVideo) {
      set({ item: it, src: it.url, loading: false });
      return;
    }

    // 2. Se for uma página de detalhes do Internet Archive que precisa de resolução
    const isIaDetails =
      it.isIa ||
      it.url?.startsWith("ia:") ||
      it.url?.includes("archive.org/details/") ||
      (it.id?.startsWith("ia-") && !it.url?.includes("/download/"));

    if (isIaDetails) {
      set({ item: it, src: null, loading: true });
      void (async () => {
        try {
          let iaId = "";
          if (it.url?.includes("archive.org/details/")) {
            const m = it.url.match(/archive\.org\/details\/([^/?#]+)/);
            if (m) iaId = m[1];
          } else if (it.url?.startsWith("ia:")) {
            iaId = it.url.replace(/^ia:/, "");
          } else if (it.id) {
            iaId = it.id.replace(/^fav-/, "").replace(/^ia-/, "").replace(/^ia:/, "");
          }

          if (!iaId) throw new Error("ID do Internet Archive ausente");

          const r = await fetch(`https://archive.org/metadata/${iaId}`);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = await r.json();
          const files: { name: string; size?: string }[] = data?.files ?? [];
          const audios = files
            .filter((f) => /\.(mp3|ogg|flac|m4a|wav)$/i.test(f.name))
            .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));
          const videos = files
            .filter((f) => /\.(mp4|m4v|webm|mkv)$/i.test(f.name) && !/sample/i.test(f.name))
            .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));
          const pick = it.kind === "video" ? (videos[0] ?? audios[0]) : (audios[0] ?? videos[0]);
          if (!pick) throw new Error("sem arquivo");
          const url = `https://archive.org/download/${iaId}/${encodeURIComponent(pick.name)}`;
          if (get().item?.id === it.id) {
            set({ src: url, loading: false });
          }
        } catch (err) {
          console.warn("Fallback para URL original do item:", err);
          if (get().item?.id === it.id) {
            set({ src: it.url || null, loading: false });
          }
        }
      })();
    } else {
      set({ item: it, src: it.url || null, loading: false });
    }
  },
  setSrc: (u) => set({ src: u, loading: false }),
  close: () => set({ item: null, src: null, loading: false }),
}));
