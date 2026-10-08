// GalaxyCut — motor de áudio WebAudio (preview + exportação)
// "Melhorar áudio" = cadeia real de estúdio: highpass 85Hz (corta ruído grave)
// → compressor (-24dB, suave) → limitador (não deixa estourar) → +20% de ganho.
"use client";

import type { AudioFilterConfig } from "./types";

interface Chain {
  source: MediaElementAudioSourceNode;
  hp: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  limiter: DynamicsCompressorNode;
  makeup: GainNode;
  gain: GainNode;
  lastGain?: number;
  lastEnhance?: boolean;
  lastFiltersSig?: string;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private chains = new Map<string, Chain>();
  private linked = new WeakMap<HTMLMediaElement, Chain>();

  ensureContext(): AudioContext {
    if (!this.ctx) {
      const AC: typeof AudioContext =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Cria (ou recupera) o grafo de um elemento. Seguro chamar repetidamente. */
  attach(key: string, el: HTMLMediaElement): Chain | null {
    const existing = this.linked.get(el);
    if (existing) {
      this.chains.set(key, existing);
      return existing;
    }
    try {
      const ctx = this.ensureContext();
      const source = ctx.createMediaElementSource(el);
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 20; // ~bypass
      const comp = ctx.createDynamicsCompressor();
      // ~bypass por padrão
      comp.threshold.value = 0;
      comp.knee.value = 0;
      comp.ratio.value = 1;
      comp.attack.value = 0.006;
      comp.release.value = 0.25;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -1.5;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.1;
      const makeup = ctx.createGain();
      makeup.gain.value = 1;
      const gain = ctx.createGain();
      gain.gain.value = 1;
      source.connect(hp).connect(comp).connect(limiter).connect(makeup).connect(gain).connect(this.master!);
      const chain: Chain = { source, hp, comp, limiter, makeup, gain, lastGain: 1, lastEnhance: false };
      this.linked.set(el, chain);
      this.chains.set(key, chain);
      return chain;
    } catch {
      // elemento já conectado a outro contexto ou contexto indisponível
      return this.chains.get(key) ?? null;
    }
  }

  getChain(key: string): Chain | null {
    return this.chains.get(key) ?? null;
  }

  dropClip(key: string) {
    // Apenas desassocia a chave da cadeia sem desconectar o nó físico do elemento
    this.chains.delete(key);
  }

  /** Atualiza ganho/filtros estilo OBS por frame sem sobrecarregar a fila DSP do WebAudio */
  update(key: string, opts: { gain: number; enhance: boolean; filters?: AudioFilterConfig }) {
    const c = this.chains.get(key);
    if (!c || !this.ctx) return;
    const t = this.ctx.currentTime;
    
    // Multiplicador de ganho de volume (dB para escala linear)
    let effGain = Math.max(0, opts.gain);
    if (opts.filters?.gainDb) {
      effGain *= Math.pow(10, opts.filters.gainDb / 20);
    }
    
    if (c.lastGain === undefined || Math.abs(c.lastGain - effGain) > 0.0005) {
      c.lastGain = effGain;
      try {
        c.gain.gain.cancelScheduledValues(t);
        c.gain.gain.setValueAtTime(effGain, t);
      } catch {
        c.gain.gain.value = effGain;
      }
    }

    const filtersSig = JSON.stringify(opts.filters ?? null) + ":" + opts.enhance;
    if (c.lastFiltersSig === filtersSig) return;
    c.lastFiltersSig = filtersSig;

    const f = opts.filters;
    try {
      if (f && f.enabled) {
        // 1. Passa-Alta (High-Pass / Corte de Ruído Grave)
        c.hp.frequency.cancelScheduledValues(t);
        if (f.highpassEnabled) {
          c.hp.frequency.setValueAtTime(Math.max(20, Math.min(1000, f.highpassFrequency || 85)), t);
        } else {
          c.hp.frequency.setValueAtTime(20, t);
        }

        // 2. Compressor de Dinâmica (Estilo OBS Studio)
        c.comp.threshold.cancelScheduledValues(t);
        c.comp.ratio.cancelScheduledValues(t);
        c.comp.attack.cancelScheduledValues(t);
        c.comp.release.cancelScheduledValues(t);
        c.makeup.gain.cancelScheduledValues(t);
        if (f.compressorEnabled) {
          c.comp.threshold.setValueAtTime(f.compressorThreshold ?? -24, t);
          c.comp.ratio.setValueAtTime(f.compressorRatio ?? 3.5, t);
          c.comp.attack.setValueAtTime(Math.max(0.001, (f.compressorAttack ?? 6) / 1000), t);
          c.comp.release.setValueAtTime(Math.max(0.01, (f.compressorRelease ?? 250) / 1000), t);
          const makeup = Math.pow(10, (f.compressorMakeupGain ?? 2) / 20);
          c.makeup.gain.setValueAtTime(makeup, t);
        } else {
          c.comp.threshold.setValueAtTime(0, t);
          c.comp.ratio.setValueAtTime(1, t);
          c.makeup.gain.setValueAtTime(1, t);
        }

        // 3. Limitador de Picos (Evita Distorção / Limiter)
        c.limiter.threshold.cancelScheduledValues(t);
        c.limiter.release.cancelScheduledValues(t);
        if (f.limiterEnabled) {
          c.limiter.threshold.setValueAtTime(f.limiterThreshold ?? -1.5, t);
          c.limiter.release.setValueAtTime(Math.max(0.01, (f.limiterRelease ?? 100) / 1000), t);
        } else {
          c.limiter.threshold.setValueAtTime(0, t);
        }
      } else if (opts.enhance) {
        // Padrão OBS Voz Clara
        c.hp.frequency.cancelScheduledValues(t);
        c.hp.frequency.setValueAtTime(85, t);
        c.comp.threshold.cancelScheduledValues(t);
        c.comp.threshold.setValueAtTime(-24, t);
        c.comp.knee.cancelScheduledValues(t);
        c.comp.knee.setValueAtTime(14, t);
        c.comp.ratio.cancelScheduledValues(t);
        c.comp.ratio.setValueAtTime(3.5, t);
        c.comp.attack.cancelScheduledValues(t);
        c.comp.attack.setValueAtTime(0.006, t);
        c.comp.release.cancelScheduledValues(t);
        c.comp.release.setValueAtTime(0.25, t);
        c.makeup.gain.cancelScheduledValues(t);
        c.makeup.gain.setValueAtTime(1.2, t);
        c.limiter.threshold.cancelScheduledValues(t);
        c.limiter.threshold.setValueAtTime(-1.5, t);
        c.limiter.release.cancelScheduledValues(t);
        c.limiter.release.setValueAtTime(0.1, t);
      } else {
        // Bypass neutro
        c.hp.frequency.cancelScheduledValues(t);
        c.hp.frequency.setValueAtTime(20, t);
        c.comp.threshold.cancelScheduledValues(t);
        c.comp.threshold.setValueAtTime(0, t);
        c.comp.knee.cancelScheduledValues(t);
        c.comp.knee.setValueAtTime(0, t);
        c.comp.ratio.cancelScheduledValues(t);
        c.comp.ratio.setValueAtTime(1, t);
        c.makeup.gain.cancelScheduledValues(t);
        c.makeup.gain.setValueAtTime(1, t);
        c.limiter.threshold.cancelScheduledValues(t);
        c.limiter.threshold.setValueAtTime(0, t);
      }
    } catch {
      /* noop */
    }
  }

  /** Fluxo de áudio para gravar na exportação. */
  getRecordingStream(): MediaStream {
    const ctx = this.ensureContext();
    if (!this.recDest) {
      this.recDest = ctx.createMediaStreamDestination();
      this.master!.connect(this.recDest);
    }
    return this.recDest.stream;
  }

  pauseAll() {
    // ganho zero imediato evita vazamento de áudio ao pausar
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(1, this.ctx.currentTime, 0.001);
  }
}

export const audioEngine = new AudioEngine();

