// GaláxiaCut — inspetor de propriedades do clipe selecionado
"use client";

import { ReactNode } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useProject, usePlayback } from "@/lib/editor/store";
import { useSettings } from "@/lib/editor/settings";
import { Clip, FONTS, TextProps, TRANSITIONS, TransitionType, clipEnd } from "@/lib/editor/types";
import { AlignLeft, AlignCenter, AlignRight, Bold, Italic, RotateCcw, Wand2, ArrowRightFromLine, Paintbrush, Pin } from "lucide-react";
import { engine } from "@/lib/editor/playback";
import { toast } from "sonner";

export function Inspector() {
  const clip = useProject((s) => s.clips.find((c) => c.id === s.selectedId) ?? null);
  const duration = usePlayback((s) => s.duration);
  const project = useProject((s) => s.project);
  const clipCount = useProject((s) => s.clips.length);

  return (
    <div className="flex h-full flex-col bg-[#0c1017]">
      <div className="flex h-9 shrink-0 items-center border-b border-[#1c2430] bg-[#10151d] px-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
          {clip ? "Propriedades" : "Projeto"}
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3 timeline-scroll">
        {!clip ? (
          <div className="space-y-3">
            <InfoRow label="Formato">{project.width}×{project.height}</InfoRow>
            <InfoRow label="FPS">{project.fps}</InfoRow>
            <InfoRow label="Duração">{clipCount > 0 ? `${(Math.round(duration * 10) / 10).toFixed(1)}s` : "—"}</InfoRow>
            <InfoRow label="Clipes">{clipCount}</InfoRow>
            <p className="rounded-lg border border-[#232d3d] bg-[#121722] p-3 text-[11px] leading-relaxed text-zinc-500">
              Selecione um clipe na timeline para editar posição, filtros, velocidade, volume, transição e
              animações. <b className="text-zinc-400">Espaço</b> toca/pausa, <b className="text-zinc-400">S</b> corta
              no ponto da setinha, <b className="text-zinc-400">botão direito</b> abre o menu do clipe.
            </p>
          </div>
        ) : (
          <ClipInspector key={clip.id} clip={clip} />
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#232d3d] bg-[#121722] px-3 py-2">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-xs font-medium text-zinc-200">{children}</span>
    </div>
  );
}

function Section({ title, children, onReset }: { title: string; children: ReactNode; onReset?: () => void }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{title}</h3>
        {onReset && (
          <button onClick={onReset} className="flex items-center gap-1 text-[10px] text-zinc-500 transition hover:text-[#22C55E]" title="Restaurar padrão">
            <RotateCcw className="h-3 w-3" /> resetar
          </button>
        )}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function SliderRow({
  label, value, min, max, step, onChange, fmt,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; fmt?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <Label className="text-[11px] text-zinc-400">{label}</Label>
        <span className="font-mono text-[10px] tabular-nums text-zinc-500">{fmt ? fmt(value) : Math.round(value * 100) / 100}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
        onPointerDown={() => useProject.getState().pushHistory()}
        className="py-1"
      />
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-[11px] text-zinc-400">{label}</Label>
      <Switch
        checked={checked}
        onCheckedChange={(v) => {
          useProject.getState().pushHistory();
          onChange(v);
        }}
        className="data-[state=checked]:bg-[#22C55E]"
      />
    </div>
  );
}

function ColorRow({ label, value, onChange, allowNone }: { label: string; value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <Label className="text-[11px] text-zinc-400">{label}</Label>
      <div className="flex items-center gap-1.5">
        {allowNone && value && (
          <button className="rounded border border-[#2a3546] px-1.5 py-0.5 text-[9px] text-zinc-500 hover:text-red-400" onClick={() => onChange("")}>
            remover
          </button>
        )}
        <input
          type="color"
          value={value ? value.slice(0, 7) : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => useProject.getState().pushHistory()}
          className="h-6 w-10 cursor-pointer rounded border border-[#2a3546] bg-transparent p-0.5"
          aria-label={label}
        />
      </div>
    </div>
  );
}

// ---------- posição das legendas (global compartilhada + trava individual) ----------
function CaptionPosRows({ clip, update }: { clip: Clip; update: (patch: Partial<Clip>, history?: boolean) => void }) {
  const captionPos = useSettings((s) => s.captionPos);
  const setSettings = useSettings((s) => s.set);
  const locked = !!clip.posLock;
  // posição efetiva atual (a que aparece na tela)
  const cur = locked ? { x: clip.x, y: clip.y } : captionPos;

  const setPos = (x: number, y: number) => {
    // mantém o clipe sincronizado (evita pulo se travar/destravar depois)
    update({ x, y }, false);
    if (!locked) setSettings({ captionPos: { x, y } });
  };

  return (
    <div className="rounded-lg border border-[#2a3546] bg-[#0e1320] p-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <Label className="text-[11px] text-zinc-400">Posição na tela</Label>
        <button
          type="button"
          onClick={() => {
            if (!locked) {
              // trava: esta legenda ganha posição própria (fica onde está agora)
              update({ posLock: true, x: cur.x, y: cur.y });
            } else {
              // destrava: volta a seguir a posição global de todas
              update({ posLock: false });
            }
          }}
          className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] transition ${
            locked ? "border-amber-500/50 bg-amber-500/10 text-amber-300" : "border-[#2a3546] text-zinc-400 hover:text-amber-300"
          }`}
          title={locked ? "Esta legenda tem posição própria (não segue as outras)" : "Todas as legendas seguem a mesma posição"}
        >
          <Pin className="h-3 w-3" /> {locked ? "Posição própria" : "Todas juntas"}
        </button>
      </div>
      <SliderRow label="Posição X" value={cur.x} min={-1} max={1} step={0.01} onChange={(v) => setPos(v, cur.y)} fmt={(v) => v.toFixed(2)} />
      <SliderRow label="Posição Y" value={cur.y} min={-1} max={1} step={0.01} onChange={(v) => setPos(cur.x, v)} fmt={(v) => v.toFixed(2)} />
      <p className="mt-1 text-[9px] leading-relaxed text-zinc-600">
        {locked
          ? "Travada: mexer aqui só afeta esta legenda."
          : "Sem trava: mexer aqui (ou arrastar no preview) move TODAS as legendas destravadas juntas."}
      </p>
      {locked && (
        <button
          type="button"
          onClick={() => setSettings({ captionPos: { x: clip.x, y: clip.y } })}
          className="mt-1.5 text-[9px] text-[#22C55E] hover:underline"
        >
          Usar esta posição como padrão de todas
        </button>
      )}
    </div>
  );
}

function ClipInspector({ clip }: { clip: Clip }) {
  const update = (patch: Partial<Clip>, history = true) => {
    useProject.getState().updateClip(clip.id, patch, { history });
    engine.markDirty();
  };

  const isAV = clip.kind === "video" || clip.kind === "audio";
  const clips = useProject((s) => s.clips);

  // velocidade muda a duração mantendo o trecho da fonte
  const setSpeed = (v: number) => {
    const len = Math.max(0.1, (clip.outPoint - clip.inPoint) / v);
    update({ speed: v, duration: len }, false);
  };

  const applyStyleToAllCaptions = () => {
    const st = useProject.getState();
    const others = st.clips.filter((c) => c.kind === "text" && c.id !== clip.id && c.text);
    if (!others.length) {
      toast.info("Não tem outras legendas pra atualizar");
      return;
    }
    st.pushHistory();
    const { words: _keep, content: _keep2, ...style } = clip.text!;
    void _keep; void _keep2;
    useProject.setState({
      clips: st.clips.map((c) => (others.includes(c) ? { ...c, text: { ...c.text!, ...style } } : c)),
    });
    toast.success(`Estilo aplicado em ${others.length} legenda(s)`);
  };

  const trans = clip.transitionIn;
  const maxTransDur = Math.min(
    2,
    clip.duration * 0.9,
    (() => {
      const prev = clips
        .filter((c) => c.trackId === clip.trackId && c.id !== clip.id && clipEnd(c) <= clip.start + 0.35)
        .sort((a, b) => clipEnd(b) - clipEnd(a))[0];
      return prev ? prev.duration * 0.9 : 2;
    })()
  );

  return (
    <div>
      {/* ---------- TEXTO ---------- */}
      {clip.kind === "text" && clip.text && (
        <Section title="Texto">
          <Textarea
            value={clip.text.content}
            onChange={(e) => update({ text: { ...clip.text!, content: e.target.value } }, false)}
            onFocus={() => useProject.getState().pushHistory()}
            className="min-h-[70px] border-[#2a3546] bg-[#121722] text-xs text-zinc-200"
            placeholder="Digite a fala ou título…"
          />
          {/* seletor de fonte COM preview de como ela é */}
          <Select
            value={clip.text.font}
            onValueChange={(v) => update({ text: { ...clip.text!, font: v } })}
          >
            <SelectTrigger className="h-9 border-[#2a3546] bg-[#121722] text-sm" style={{ fontFamily: clip.text.font }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72 border-[#232d3d] bg-[#121722] text-zinc-200">
              {FONTS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="py-2 text-sm" style={{ fontFamily: f.value }}>
                  <span className="flex items-center justify-between gap-3">
                    <span>AaBb 123</span>
                    <span className="text-[10px] text-zinc-500">{f.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5">
            <ToggleGroup type="multiple" className="gap-1" aria-label="Estilo e alinhamento">
              <ToggleGroupItem
                value="bold"
                data-state={clip.text.bold ? "on" : "off"}
                onClick={() => update({ text: { ...clip.text!, bold: !clip.text!.bold } })}
                className="h-7 w-7 border border-[#2a3546] p-0 text-zinc-400 data-[state=on]:border-[#22C55E] data-[state=on]:text-[#22C55E]"
                title="Negrito"
              >
                <Bold className="h-3 w-3" />
              </ToggleGroupItem>
              <ToggleGroupItem
                value="italic"
                data-state={clip.text.italic ? "on" : "off"}
                onClick={() => update({ text: { ...clip.text!, italic: !clip.text!.italic } })}
                className="h-7 w-7 border border-[#2a3546] p-0 text-zinc-400 data-[state=on]:border-[#22C55E] data-[state=on]:text-[#22C55E]"
                title="Itálico"
              >
                <Italic className="h-3 w-3" />
              </ToggleGroupItem>
            </ToggleGroup>
            <div className="ml-auto">
              <ToggleGroup type="single" value={clip.text.align} className="gap-1" aria-label="Alinhamento">
                {([["left", AlignLeft], ["center", AlignCenter], ["right", AlignRight]] as const).map(([v, Icon]) => (
                  <ToggleGroupItem
                    key={v}
                    value={v}
                    onClick={() => update({ text: { ...clip.text!, align: v as TextProps["align"] } })}
                    className="h-7 w-7 border border-[#2a3546] p-0 text-zinc-400 data-[state=on]:border-[#22C55E] data-[state=on]:text-[#22C55E]"
                  >
                    <Icon className="h-3 w-3" />
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
          <SliderRow label="Tamanho" value={clip.text.size} min={20} max={220} step={2} onChange={(v) => update({ text: { ...clip.text!, size: v } }, false)} fmt={(v) => `${v}px`} />
          {/* posição: legendas seguem a global (todas juntas) salvo trava própria */}
          {clip.isCaption ? (
            <CaptionPosRows clip={clip} update={update} />
          ) : (
            <>
              <SliderRow label="Posição X" value={clip.x} min={-1} max={1} step={0.01} onChange={(v) => update({ x: v }, false)} fmt={(v) => v.toFixed(2)} />
              <SliderRow label="Posição Y" value={clip.y} min={-1} max={1} step={0.01} onChange={(v) => update({ y: v }, false)} fmt={(v) => v.toFixed(2)} />
            </>
          )}
          <SliderRow label="Contorno" value={clip.text.strokeW} min={0} max={24} step={1} onChange={(v) => update({ text: { ...clip.text!, strokeW: v } }, false)} fmt={(v) => `${v}px`} />
          <ColorRow label="Cor do texto" value={clip.text.color} onChange={(v) => update({ text: { ...clip.text!, color: v } }, false)} />
          <ColorRow label="Cor do contorno" value={clip.text.strokeColor} onChange={(v) => update({ text: { ...clip.text!, strokeColor: v } }, false)} />
          <ColorRow label="Caixa de fundo" value={clip.text.bg} onChange={(v) => update({ text: { ...clip.text!, bg: v } }, false)} allowNone />
          <ToggleRow label="Sombra" checked={clip.text.shadow} onChange={(v) => update({ text: { ...clip.text!, shadow: v } })} />
          <Button
            variant="outline"
            size="sm"
            onClick={applyStyleToAllCaptions}
            className="w-full gap-1.5 border-[#2a3546] bg-transparent text-[11px] text-zinc-300 hover:border-[#22C55E]/50 hover:text-[#22C55E]"
            title="Copia o estilo deste texto para todas as outras legendas"
          >
            <Paintbrush className="h-3.5 w-3.5" /> Aplicar este estilo a todas as legendas
          </Button>
        </Section>
      )}

      {/* ---------- KARAOKÊ ---------- */}
      {clip.kind === "text" && clip.text && (
        <Section title="Karaokê (palavra falada)">
          <ToggleRow
            label="Destacar palavra atual"
            checked={clip.text.highlight}
            onChange={(v) => update({ text: { ...clip.text!, highlight: v } })}
          />
          {clip.text.highlight && (
            <>
              <ColorRow label="Cor de destaque" value={clip.text.highlightColor} onChange={(v) => update({ text: { ...clip.text!, highlightColor: v } }, false)} />
              <div>
                <Label className="text-[11px] text-zinc-400">Arco-íris (separado por vírgula)</Label>
                <Input
                  value={clip.text.highlightGradient}
                  placeholder="#F87171,#FACC15,#4ADE80"
                  onChange={(e) => update({ text: { ...clip.text!, highlightGradient: e.target.value } }, false)}
                  className="mt-1 h-7 border-[#2a3546] bg-[#121722] text-[11px] text-zinc-200"
                />
              </div>
              <SliderRow label="Pulo da palavra" value={clip.text.highlightScale} min={1} max={1.6} step={0.02} onChange={(v) => update({ text: { ...clip.text!, highlightScale: v } }, false)} fmt={(v) => `${Math.round(v * 100)}%`} />
              <div>
                <Label className="mb-1 block text-[11px] text-zinc-400">Animação</Label>
                <div className="grid grid-cols-4 gap-1">
                  {(["none", "pop", "bounce", "pulse"] as const).map((a) => (
                    <button
                      key={a}
                      onClick={() => update({ text: { ...clip.text!, highlightAnim: a } })}
                      className={`rounded-md border px-1 py-1.5 text-[10px] transition ${
                        clip.text!.highlightAnim === a
                          ? "border-[#22C55E] bg-[#22C55E]/10 text-[#22C55E]"
                          : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
                      }`}
                    >
                      {a === "none" ? "Nenhuma" : a === "pop" ? "Pop" : a === "bounce" ? "Pulo" : "Pulso"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-zinc-600">
                {clip.text.words?.length
                  ? `Tempo de cada palavra veio da IA (${clip.text.words.length} palavras).`
                  : "Sem tempos por palavra — eu estimo pela duração. Gere as legendas automáticas pra ficar perfeito."}
              </p>
            </>
          )}
        </Section>
      )}

      {/* ---------- TRANSIÇÃO (só visual: vídeo/imagem/texto — áudio usa FADE) ---------- */}
      {clip.kind !== "audio" && (
      <Section title="Transição na entrada">
        <div className="grid grid-cols-5 gap-1">
          {TRANSITIONS.map((t) => (
            <button
              key={t.type}
              onClick={() => update({ transitionIn: t.type === "none" ? undefined : { type: t.type as TransitionType, duration: trans?.duration ?? 0.5 } })}
              title={t.label}
              className={`flex flex-col items-center gap-0.5 rounded-md border px-0.5 py-1.5 text-[9px] transition ${
                (trans?.type ?? "none") === t.type
                  ? "border-fuchsia-400 bg-fuchsia-500/10 text-fuchsia-300"
                  : "border-[#2a3546] text-zinc-400 hover:border-[#3a4759]"
              }`}
            >
              <span className="text-[13px] leading-none">{t.icon}</span>
              <span className="w-full truncate text-center leading-tight">{t.label}</span>
            </button>
          ))}
        </div>
        {trans && trans.type !== "none" && (
          <>
            <SliderRow
              label="Duração"
              value={trans.duration}
              min={0.1}
              max={Math.max(0.2, maxTransDur)}
              step={0.05}
              onChange={(v) => update({ transitionIn: { ...trans, duration: v } }, false)}
              fmt={(v) => `${v.toFixed(2)}s`}
            />
            <p className="flex items-start gap-1.5 rounded-md border border-[#2a3546] bg-[#0e1320] p-2 text-[10px] leading-relaxed text-zinc-500">
              <ArrowRightFromLine className="mt-0.5 h-3 w-3 shrink-0 text-fuchsia-400" />
              A transição acontece na junção com o clipe de antes, na mesma faixa. Aparece também um botãozinho roxo na
              junção, na timeline.
            </p>
          </>
        )}
      </Section>
      )}

      {/* ---------- TRANSFORMAR ---------- */}
      {(clip.kind === "video" || clip.kind === "image") && (
        <Section
          title="Transformar"
          onReset={() => update({ x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 })}
        >
          <SliderRow label="Posição X" value={clip.x} min={-1} max={1} step={0.01} onChange={(v) => update({ x: v }, false)} />
          <SliderRow label="Posição Y" value={clip.y} min={-1} max={1} step={0.01} onChange={(v) => update({ y: v }, false)} />
          <SliderRow label="Escala" value={clip.scale} min={0.1} max={4} step={0.02} onChange={(v) => update({ scale: v }, false)} fmt={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="Rotação" value={clip.rotation} min={-180} max={180} step={1} onChange={(v) => update({ rotation: v }, false)} fmt={(v) => `${v}°`} />
          <SliderRow label="Opacidade" value={clip.opacity} min={0} max={1} step={0.01} onChange={(v) => update({ opacity: v }, false)} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Section>
      )}

      {/* ---------- FILTROS ---------- */}
      {(clip.kind === "video" || clip.kind === "image") && (
        <Section
          title="Filtros"
          onReset={() => update({ brightness: 1, contrast: 1, saturation: 1, blur: 0, hue: 0, sepia: 0, grayscale: 0 })}
        >
          <SliderRow label="Brilho" value={clip.brightness} min={0.2} max={2} step={0.02} onChange={(v) => update({ brightness: v }, false)} fmt={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="Contraste" value={clip.contrast} min={0.2} max={2} step={0.02} onChange={(v) => update({ contrast: v }, false)} fmt={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="Saturação" value={clip.saturation} min={0} max={2} step={0.02} onChange={(v) => update({ saturation: v }, false)} fmt={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="Borrão" value={clip.blur} min={0} max={24} step={0.5} onChange={(v) => update({ blur: v }, false)} fmt={(v) => `${v}px`} />
          <SliderRow label="Matiz" value={clip.hue} min={-180} max={180} step={1} onChange={(v) => update({ hue: v }, false)} fmt={(v) => `${v}°`} />
          <SliderRow label="Sépia" value={clip.sepia} min={0} max={1} step={0.02} onChange={(v) => update({ sepia: v }, false)} fmt={(v) => `${Math.round(v * 100)}%`} />
          <SliderRow label="Preto e branco" value={clip.grayscale} min={0} max={1} step={0.02} onChange={(v) => update({ grayscale: v }, false)} fmt={(v) => `${Math.round(v * 100)}%`} />
        </Section>
      )}

      {/* ---------- ÁUDIO ---------- */}
      {(isAV || (clip.kind === "video")) && (
        <Section title="Áudio">
          <SliderRow label="Volume" value={clip.volume} min={0} max={2} step={0.02} onChange={(v) => update({ volume: v }, false)} fmt={(v) => `${Math.round(v * 100)}%`} />
          <ToggleRow label="Mudo" checked={clip.muted} onChange={(v) => update({ muted: v })} />
          <div className="flex items-center justify-between rounded-lg border border-[#22C55E]/30 bg-[#22C55E]/5 px-2.5 py-2">
            <div className="flex items-center gap-1.5">
              <Wand2 className="h-3.5 w-3.5 text-[#22C55E]" />
              <div>
                <p className="text-[11px] font-medium text-zinc-200">Melhorar áudio</p>
                <p className="text-[9px] text-zinc-500">corta ruído grave + comprime + limita (voz firme, sem estourar)</p>
              </div>
            </div>
            <Switch
              checked={clip.enhance}
              onCheckedChange={(v) => update({ enhance: v })}
              className="data-[state=checked]:bg-[#22C55E]"
            />
          </div>
          <p className="text-[9px] leading-relaxed text-zinc-600">
            Funciona de verdade: é uma cadeia de estúdio (filtro grave 85Hz → compressor −24dB → limitador → +20% de
            ganho) aplicada no som deste clipe — aparece o ícone de varinha no clipe da timeline.
            {clip.kind === "audio" ? " Áudio não tem transição visual — use os fades de entrada/saída aqui embaixo em Tempo." : ""}
          </p>
        </Section>
      )}

      {/* ---------- TEMPO ---------- */}
      <Section title="Tempo">
        {isAV && (
          <SliderRow
            label="Velocidade"
            value={clip.speed}
            min={0.25}
            max={4}
            step={0.05}
            onChange={setSpeed}
            fmt={(v) => `${v.toFixed(2)}×`}
          />
        )}
        <SliderRow label="Fade de entrada" value={clip.fadeIn} min={0} max={3} step={0.05} onChange={(v) => update({ fadeIn: v }, false)} fmt={(v) => `${v.toFixed(2)}s`} />
        <SliderRow label="Fade de saída" value={clip.fadeOut} min={0} max={3} step={0.05} onChange={(v) => update({ fadeOut: v }, false)} fmt={(v) => `${v.toFixed(2)}s`} />
        <div className="flex items-center justify-between pt-1">
          <Label className="text-[11px] text-zinc-400">Duração</Label>
          <Input
            type="number"
            min={0.1}
            max={600}
            step={0.1}
            value={Math.round(clip.duration * 10) / 10}
            onFocus={() => useProject.getState().pushHistory()}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!isNaN(v) && v > 0.05) update({ duration: v }, false);
            }}
            className="h-7 w-20 border-[#2a3546] bg-[#121722] text-right text-[11px] text-zinc-200"
          />
        </div>
      </Section>
    </div>
  );
}
