"use client";

import dynamic from "next/dynamic";

const GalaxyCutApp = dynamic(() => import("@/components/editor/GalaxyCutApp").then((m) => m.GalaxyCutApp), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-full items-center justify-center bg-[#080b11]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#22C55E] border-t-transparent" />
        <p className="text-sm text-zinc-500">Carregando o GalaxyCut…</p>
      </div>
    </div>
  ),
});

export default function Page() {
  return <GalaxyCutApp />;
}
