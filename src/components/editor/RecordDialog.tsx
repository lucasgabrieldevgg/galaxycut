// GalaxyCut — gravação de voz no editor: microfone → WAV na aba Áudio + clipe na timeline.
"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Mic, Square, Circle, Loader2, MicOff } from "lucide-react";
import { useProject, usePlayback } from "@/lib/editor/store";
import { registry } from "@/lib/editor/media";
import { decodeAudioOf, encodeWav } from "@/lib/editor/wav";
import { DbMeter } from "./DbMeter";
import { useT } from "@/lib/editor/i18n";

type Phase = "asking" | "ready" | "recording" | "saving" | "denied";

function fmtRec(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function RecordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const [phase, setPhase] = useState<Phase>("asking");
  const [elapsed, setElapsed] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);
  const startedAt = useRef(0);

  // pede o microfone ao abrir
  useEffect(() => {
    if (!open) return;
    let dead = false;
    setPhase("asking");
    setElapsed(0);
    chunksRef.current = [];
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (dead) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const AC: typeof AudioContext = window.AudioContext;
        const ctx = new AC();
        ctxRef.current = ctx;
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 1024;
        src.connect(an);
        setAnalyser(an);
        setPhase("ready");
      } catch {
        if (!dead) setPhase("denied");
      }
    })();
    return () => {
      dead = true;
      cleanup();
    };
     
  }, [open]);

  function cleanup() {
    try {
      if (recRef.current?.state === "recording") recRef.current.stop();
    } catch {
      /* noop */
    }
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const ctx = ctxRef.current;
    if (ctx) void ctx.close().catch(() => undefined);
    ctxRef.current = null;
    setAnalyser(null);
  }

  // cronômetro
  useEffect(() => {
    if (phase !== "recording") return;
    const iv = setInterval(() => setElapsed(Date.now() - startedAt.current), 250);
    return () => clearInterval(iv);
  }, [phase]);

  function startRec() {
    if (!streamRef.current) return;
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(streamRef.current, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.start(250);
    recRef.current = rec;
    startedAt.current = Date.now();
    setElapsed(0);
    setPhase("recording");
  }

  async function stopAndSave() {
    const rec = recRef.current;
    if (!rec) return;
    setPhase("saving");
    const chunks = chunksRef.current;
    const done = new Promise<Blob>((resolve) => {
      const finish = () => resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      rec.onstop = finish;
      try {
        if (rec.state === "inactive") finish();
        else rec.stop();
      } catch {
        finish();
      }
    });
    try {
      const raw = await done;
      if (raw.size < 200) throw new Error(t("rec.empty"));
      // vira WAV (abre em qualquer lugar, mostra waveform, sobrevive ao F5)
      const buf = await decodeAudioOf(raw);
      const wav = encodeWav(buf);
      const hh = new Date();
      const name = `Gravação ${String(hh.getHours()).padStart(2, "0")}-${String(hh.getMinutes()).padStart(2, "0")}-${String(hh.getSeconds()).padStart(2, "0")}.wav`;
      const meta = await registry.importFile(wav, name);
      useProject.getState().addMedia(meta);
      const st = useProject.getState();
      const audioTrack = st.tracks.find((t) => t.kind === "audio");
      if (audioTrack) {
        const at = usePlayback.getState().playhead;
        const out = st.dropMediaAt(meta.id, audioTrack.id, at);
        const dur = buf.duration.toFixed(1);
        if (out?.redirected) {
          toast.success(t("rec.savedMoved", { d: dur, s: out.clip.start.toFixed(1) }), { description: t("rec.savedMovedDesc") });
        } else {
          toast.success(t("rec.saved", { d: dur }), { description: t("rec.savedDesc") });
        }
      }
      cleanup();
      onOpenChange(false);
    } catch (e) {
      toast.error(t("rec.fail"), { description: String((e as Error).message ?? e) });
      setPhase("ready");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onOpenChange(false)}>
      <DialogContent className="max-w-sm border-[#232d3d] bg-[#121722] text-zinc-200">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mic className="h-4 w-4 text-[var(--gc-accent)]" /> {t("rec.title")}
          </DialogTitle>
          <DialogDescription className="text-zinc-500">{t("rec.desc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* medidor ao vivo (estilo OBS) */}
          <DbMeter mode={analyser ? "live" : "playhead"} analyser={analyser} className="w-full" label={t("rec.micLevel")} />

          {phase === "asking" && (
            <p className="flex items-center justify-center gap-2 py-3 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("rec.asking")}
            </p>
          )}
          {phase === "denied" && (
            <p className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] leading-relaxed text-red-300">
              <MicOff className="mt-0.5 h-4 w-4 shrink-0" />
              {t("rec.denied")}
            </p>
          )}

          {(phase === "ready" || phase === "recording" || phase === "saving") && (
            <>
              <div className="flex items-center justify-center gap-3">
                <span className={`font-mono text-lg tabular-nums ${phase === "recording" ? "text-red-400" : "text-zinc-400"}`}>
                  {phase === "recording" ? fmtRec(elapsed) : "00:00"}
                </span>
                {phase === "ready" && (
                  <Button onClick={startRec} className="h-10 gap-2 rounded-full bg-red-600 px-6 font-semibold text-white hover:bg-red-500">
                    <Circle className="h-3.5 w-3.5 fill-current" /> {t("rec.record")}
                  </Button>
                )}
                {phase === "recording" && (
                  <Button onClick={() => void stopAndSave()} className="h-10 gap-2 rounded-full bg-[var(--gc-accent)] px-6 font-bold text-black hover:bg-[var(--gc-accent-hover)]">
                    <Square className="h-3.5 w-3.5 fill-current" /> {t("rec.stop")}
                  </Button>
                )}
                {phase === "saving" && (
                  <span className="flex items-center gap-2 text-xs text-zinc-400">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--gc-accent)]" /> {t("rec.saving")}
                  </span>
                )}
              </div>
              <p className="text-center text-[10px] leading-relaxed text-zinc-600">{t("rec.tip")}</p>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
