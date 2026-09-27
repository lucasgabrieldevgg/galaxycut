// GalaxyCut — medidor de áudio horizontal estilo OBS (deitado, com decibéis).
// modos: "playhead" mostra o som NO PONTO DA SETA (dá scrub no tempo);
//        "live" mostra o volume saindo AGORA (AnalyserNode do microfone/preview).
"use client";

import { useEffect, useRef } from "react";
import { usePlayback } from "@/lib/editor/store";
import { engine } from "@/lib/editor/playback";

const MIN_DB = -60;

/** dB → % da barra */
function dbToPct(db: number): number {
  return Math.max(0, Math.min(100, ((db - MIN_DB) / -MIN_DB) * 100));
}

function fmtDb(db: number): string {
  if (db <= MIN_DB) return "−∞";
  return db.toFixed(1).replace("-", "−");
}

/** Marcas da escala (dB → posição), estilo OBS. */
const SCALE: { db: number; label: string }[] = [
  { db: -60, label: "-60" },
  { db: -50, label: "-50" },
  { db: -40, label: "-40" },
  { db: -30, label: "-30" },
  { db: -20, label: "-20" },
  { db: -10, label: "-10" },
  { db: -6, label: "-6" },
  { db: -3, label: "-3" },
  { db: 0, label: "0" },
];

export function DbMeter({
  mode = "playhead",
  analyser,
  className = "",
  label,
}: {
  mode?: "playhead" | "live";
  analyser?: AnalyserNode | null;
  className?: string;
  label?: string;
}) {
  const fillRef = useRef<HTMLDivElement>(null);
  const peakRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let peakPct = 0;
    let peakHold = 0;
    let lastT = -1;
    let cachedLevel = 0;
    let buf: Uint8Array<ArrayBuffer> | null = null;

    const loop = () => {
      let level = 0;
      if (mode === "playhead") {
        const t = usePlayback.getState().playhead;
        if (t !== lastT) {
          lastT = t;
          cachedLevel = engine.levelAt(t);
        }
        level = cachedLevel;
      } else if (analyser) {
        if (!buf || buf.length !== analyser.fftSize) buf = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        let mx = 0;
        for (let i = 0; i < buf.length; i += 2) {
          const v = Math.abs(buf[i] - 128) / 128;
          sum += v * v;
          if (v > mx) mx = v;
        }
        const rms = Math.sqrt(sum / (buf.length / 2));
        level = Math.max(rms, mx * 0.7);
      }
      const db = level > 0.00001 ? 20 * Math.log10(level) : MIN_DB;
      const pct = dbToPct(db);
      // pico com retenção (~0.9s) e decaimento suave, igual OBS
      if (pct >= peakPct) {
        peakPct = pct;
        peakHold = performance.now();
      } else if (performance.now() - peakHold > 900) {
        peakPct = Math.max(pct, peakPct - 0.7);
      }
      if (fillRef.current) fillRef.current.style.width = `${pct}%`;
      if (peakRef.current) peakRef.current.style.left = `${peakPct}%`;
      if (numRef.current) numRef.current.textContent = `${fmtDb(db)} dB`;
      if (hostRef.current) {
        hostRef.current.title = db > MIN_DB ? `Som neste ponto: ${fmtDb(db)} dB` : "Silêncio nesta parte";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, analyser]);

  return (
    <div ref={hostRef} className={`select-none ${className}`} aria-label={label ?? "Medidor de áudio"}>
      <div className="flex items-center gap-1.5">
        {/* barra */}
        <div className="relative h-3.5 min-w-0 flex-1 overflow-hidden rounded-[3px] border border-[#232d3d] bg-[#0a0d14]">
          {/* fundo segmentado (verde → amarelo → vermelho, estilo OBS) */}
          <div
            className="absolute inset-0 opacity-40"
            style={{
              background: `linear-gradient(to right,
                #14532d 0%, #166534 ${dbToPct(-18)}%,
                #713f12 ${dbToPct(-18)}%, #713f12 ${dbToPct(-6)}%,
                #7f1d1d ${dbToPct(-6)}%, #7f1d1d 100%)`,
            }}
          />
          {/* preenchimento atual */}
          <div
            ref={fillRef}
            className="absolute inset-y-0 left-0"
            style={{
              width: "0%",
              background: `linear-gradient(to right,
                var(--gc-accent) 0%, var(--gc-accent) ${dbToPct(-18)}%,
                #EAB308 ${dbToPct(-18)}%, #EAB308 ${dbToPct(-6)}%,
                #EF4444 ${dbToPct(-6)}%, #EF4444 100%)`,
            }}
          />
          {/* marcador de pico */}
          <div ref={peakRef} className="absolute inset-y-0 w-[2px] bg-white/90 shadow-[0_0_4px_rgba(255,255,255,0.8)]" style={{ left: "0%" }} />
        </div>
        {/* leitura numérica */}
        <span ref={numRef} className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--gc-accent)]">
          −∞ dB
        </span>
      </div>
      {/* escala em dB */}
      <div className="relative mt-[3px] h-[9px]">
        {SCALE.map((s) => (
          <span
            key={s.db}
            className="absolute -translate-x-1/2 font-mono text-[7px] leading-none text-zinc-600"
            style={{ left: `${dbToPct(s.db)}%` }}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
