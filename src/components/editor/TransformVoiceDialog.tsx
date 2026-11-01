// GalaxyCut — Transformação de Voz (IA local): converte a identidade vocal de
// um clipe (m→f, f→m, jovem, idosa) gerando uma NOVA faixa de áudio na
// timeline. O clipe original é preservado — o resultado pode ser comparado,
// mutado, editado ou apagado como qualquer clipe. Processamento offline com
// pitch granular + formantes: ritmo e interpretação originais mantidos.
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { VenetianMask, Loader2, Play, Check } from "lucide-react";
import { useProject } from "@/lib/editor/store";
import { registry } from "@/lib/editor/media";
import { decodeAudioOf, decodeCtx, encodeWav } from "@/lib/editor/wav";
import { VOICE_TRANSFORM_MODELS, transformVoiceBuffer, type VoiceTransformId } from "@/lib/editor/voiceTransform";
import { engine } from "@/lib/editor/playback";
import { useT } from "@/lib/editor/i18n";
import { toast } from "sonner";

interface OpenEvent extends Event {
  detail?: { clipId?: string; model?: string };
}

export function TransformVoiceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const clips = useProject((s) => s.clips);
  const media = useProject((s) => s.media);
  const selectedId = useProject((s) => s.selectedId);

  const [sourceId, setSourceId] = useState<string | null>(null);
  const [modelId, setModelId] = useState<VoiceTransformId>("vt-m2f");
  const [intensity, setIntensity] = useState(1);
  const [muteOriginal, setMuteOriginal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string>("");
  const resultIdRef = useRef<string | null>(null);

  // clipes elegíveis: vídeo/áudio com mídia e duração
  const eligible = useMemo(
    () => clips.filter((c) => (c.kind === "video" || c.kind === "audio") && c.mediaId && c.duration > 0.2),
    [clips],
  );

  // evento global: galaxycut:opentransformvoice {clipId?, model?}
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as OpenEvent).detail;
      if (detail?.model && VOICE_TRANSFORM_MODELS.some((m) => m.id === detail.model)) {
        setModelId(detail.model as VoiceTransformId);
      }
      const clipId = detail?.clipId;
      if (clipId) {
        setSourceId(clipId);
        const c = useProject.getState().clips.find((x) => x.id === clipId);
        if (c?.kind === "video") setMuteOriginal(true); // vídeo: por padrão troca a voz
        else setMuteOriginal(false);
      } else {
        const sel = useProject.getState().clips.find((x) => x.id === useProject.getState().selectedId);
        if (sel && (sel.kind === "video" || sel.kind === "audio") && sel.mediaId) {
          setSourceId(sel.id);
          setMuteOriginal(sel.kind === "video");
        }
      }
      onOpenChange(true);
    };
    window.addEventListener("galaxycut:opentransformvoice", onOpen);
    return () => window.removeEventListener("galaxycut:opentransformvoice", onOpen);
  }, [onOpenChange]);

  // sincroniza com a seleção da timeline quando abre sem clipId
  useEffect(() => {
    if (open && !sourceId && selectedId) {
      const sel = clips.find((x) => x.id === selectedId);
      if (sel && (sel.kind === "video" || sel.kind === "audio") && sel.mediaId) setSourceId(sel.id);
    }
  }, [open, sourceId, selectedId, clips]);

  const source = clips.find((c) => c.id === sourceId) ?? null;
  const sourceMedia = source?.mediaId ? media.find((m) => m.id === source.mediaId) : undefined;
  const model = VOICE_TRANSFORM_MODELS.find((m) => m.id === modelId)!;

  const run = async () => {
    if (!source || !source.mediaId) {
      toast.error(t("vt.noSource"));
      return;
    }
    setBusy(true);
    setProgress(0.02);
    setStage(t("vt.stageDecode"));
    try {
      const blob = registry.getBlob(source.mediaId);
      if (!blob) throw new Error("missing blob");
      // decodifica e recorta SÓ o trecho do clipe (inPoint..outPoint, tempo da fonte)
      const full = await decodeAudioOf(blob, Math.max(1, source.duration));
      const inS = Math.max(0, Math.min(full.duration - 0.05, source.inPoint || 0));
      const outS = Math.max(inS + 0.05, Math.min(full.duration, source.outPoint > 0 ? source.outPoint : full.duration));
      const need = outS - inS;
      // v9.4.1: usa o contexto COMPARTILHADO de decodificação (cada `new
      // AudioContext()` contava contra o limite de ~6 do Chrome)
      const probe = decodeCtx();
      const seg = probe.createBuffer(2, Math.ceil(need * full.sampleRate), full.sampleRate);
      for (let ch = 0; ch < Math.min(2, full.numberOfChannels); ch++) {
        const from = full.getChannelData(Math.min(ch, full.numberOfChannels - 1));
        const to = seg.getChannelData(ch);
        const start = Math.floor(inS * full.sampleRate);
        for (let i = 0; i < to.length && start + i < from.length; i++) to[i] = from[start + i];
      }
      setProgress(0.2);
      setStage(t("vt.stageRender"));
      const converted = await transformVoiceBuffer(seg, model, intensity, (st, p) => {
        if (st === "render") setProgress(0.2 + p * 0.5);
        if (st === "done") setProgress(0.75);
      });
      setStage(t("vt.stageEncode"));
      setProgress(0.8);
      const wav = encodeWav(converted);
      const baseName = sourceMedia?.name?.replace(/\.[^.]+$/, "") ?? t("vt.clip");
      const name = `${baseName} — ${model.name}.wav`;
      const meta = await registry.importFile(wav, name);
      const st = useProject.getState();
      st.addMedia(meta);
      // coloca na faixa de áudio, no MESMO início do clipe de origem
      const st2 = useProject.getState();
      const audioTrack = st2.tracks.find((tr) => tr.kind === "audio");
      if (!audioTrack) throw new Error("no audio track");
      const out = st2.dropMediaAt(meta.id, audioTrack.id, source.start);
      if (out?.clip) {
        resultIdRef.current = out.clip.id;
        // mesma velocidade do clipe original → mesma duração na timeline
        // (a conversão preserva o tempo da fonte: in/out são segundos da fonte)
        useProject.getState().updateClip(out.clip.id, { speed: source.speed || 1, duration: source.duration });
        if (muteOriginal && source.id) {
          useProject.getState().updateClip(source.id, { muted: true });
        }
      }
      setProgress(1);
      setStage("");
      toast.success(t("vt.done"), { description: t("vt.doneDesc") });
      // prévia: toca a partir do início da nova faixa
      engine.seek(Math.max(0, source.start));
      engine.play();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error(t("vt.fail"), { description: t("vt.failDesc") });
    } finally {
      setBusy(false);
      setProgress(0);
      setStage("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-w-lg border-[#232d3d] bg-[#10141d] text-zinc-200">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <VenetianMask className="h-5 w-5 text-fuchsia-400" />
            <DialogTitle className="text-base font-semibold">{t("vt.title")}</DialogTitle>
          </div>
          <DialogDescription className="text-xs text-zinc-400">{t("vt.desc")}</DialogDescription>
        </DialogHeader>

        {/* origem */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t("vt.source")}</p>
          <select
            value={sourceId ?? ""}
            onChange={(e) => setSourceId(e.target.value || null)}
            className="w-full rounded-md border border-[#2a3546] bg-[#121824] px-2 py-1.5 text-xs text-zinc-200"
          >
            <option value="">{t("vt.pickSource")}</option>
            {eligible.map((c) => {
              const m = media.find((x) => x.id === c.mediaId);
              return (
                <option key={c.id} value={c.id}>
                  {m?.name ?? c.kind} · {c.start.toFixed(1)}s ({c.duration.toFixed(1)}s)
                </option>
              );
            })}
          </select>
          {eligible.length === 0 && <p className="mt-1 text-[10px] text-amber-400">{t("vt.noClips")}</p>}
        </div>

        {/* modelos */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{t("vt.models")}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {VOICE_TRANSFORM_MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setModelId(m.id)}
                className={`rounded-lg border p-2 text-left transition ${
                  modelId === m.id
                    ? "border-fuchsia-500/70 bg-fuchsia-500/10"
                    : "border-[#232d3d] bg-[#121824] hover:border-[#2a3546]"
                }`}
              >
                <span className="flex items-center gap-1 text-[11px] font-semibold text-zinc-100">
                  {modelId === m.id && <Check className="h-3 w-3 text-fuchsia-400" />} {m.name}
                </span>
                <span className="mt-0.5 block text-[9px] leading-tight text-zinc-500">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* intensidade */}
        <div>
          <div className="flex justify-between text-[10px] text-zinc-400">
            <span>{t("vfx.intensity")}</span>
            <span className="font-mono text-fuchsia-400">{Math.round(intensity * 100)}%</span>
          </div>
          <Slider value={[intensity]} min={0.2} max={1} step={0.05} onValueChange={(v) => setIntensity(v[0])} className="mt-1" />
        </div>

        {/* opções */}
        <label className="flex items-center justify-between rounded-lg border border-[#232d3d] bg-[#0e1320] px-3 py-2">
          <span className="text-[11px] text-zinc-300">{t("vt.muteOriginal")}</span>
          <Switch checked={muteOriginal} onCheckedChange={setMuteOriginal} />
        </label>

        {/* progresso */}
        {busy && (
          <div className="space-y-1.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#1c2430]">
              <div className="h-full rounded-full bg-fuchsia-500 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="flex items-center gap-1.5 text-[10px] text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" /> {stage || t("vt.stageRender")}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy} className="border-[#2c364c] text-xs">
            {t("vt.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={run}
            disabled={busy || !source}
            className="bg-fuchsia-600 text-xs font-semibold text-white hover:bg-fuchsia-500"
          >
            {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
            {t("vt.run")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
