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
    // tocar um para o outro
    if (it.isIa) {
      set({ item: it, src: null, loading: true });
      void (async () => {
        try {
          const r = await fetch(`https://archive.org/metadata/${it.id.replace(/^ia-/, "")}`);
          const data = await r.json();
          const files: { name: string; size?: string }[] = data?.files ?? [];
          const audios = files
            .filter((f) => /\.(mp3|ogg|flac|m4a|wav)$/i.test(f.name))
            .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));
          const videos = files
            .filter((f) => /\.(mp4|m4v|webm|mkv)$/i.test(f.name) && !/sample/i.test(f.name))
            .sort((a, b) => Number(b.size ?? 0) - Number(a.size ?? 0));
          const pick = audios[0] ?? videos[0];
          if (!pick) throw new Error("sem arquivo");
          const url = `https://archive.org/download/${it.id.replace(/^ia-/, "")}/${encodeURIComponent(pick.name)}`;
          if (get().item?.id === it.id) set({ src: url, loading: false });
        } catch {
          if (get().item?.id === it.id) set({ loading: false });
        }
      })();
    } else {
      set({ item: it, src: it.url, loading: false });
    }
  },
  setSrc: (u) => set({ src: u, loading: false }),
  close: () => set({ item: null, src: null, loading: false }),
}));
