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
      const chain: Chain = { source, hp, comp, limiter, makeup, gain };
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

  /** Atualiza ganho/filtros estilo OBS por frame sem ruído de clique. */
  update(key: string, opts: { gain: number; enhance: boolean; filters?: AudioFilterConfig }) {
    const c = this.chains.get(key);
    if (!c || !this.ctx) return;
    const t = this.ctx.currentTime;
    
    // Multiplicador de ganho de volume (dB para escala linear)
    let effGain = Math.max(0, opts.gain);
    if (opts.filters?.gainDb) {
      effGain *= Math.pow(10, opts.filters.gainDb / 20);
    }
    c.gain.gain.setTargetAtTime(effGain, t, 0.015);

    const f = opts.filters;
    if (f && f.enabled) {
      // 1. Passa-Alta (High-Pass / Corte de Ruído Grave)
      if (f.highpassEnabled) {
        c.hp.frequency.setTargetAtTime(Math.max(20, Math.min(1000, f.highpassFrequency || 85)), t, 0.05);
      } else {
        c.hp.frequency.setTargetAtTime(20, t, 0.05);
      }

      // 2. Compressor de Dinâmica (Estilo OBS Studio)
      if (f.compressorEnabled) {
        c.comp.threshold.setTargetAtTime(f.compressorThreshold ?? -24, t, 0.05);
        c.comp.ratio.setTargetAtTime(f.compressorRatio ?? 3.5, t, 0.05);
        c.comp.attack.setTargetAtTime(Math.max(0.001, (f.compressorAttack ?? 6) / 1000), t, 0.05);
        c.comp.release.setTargetAtTime(Math.max(0.01, (f.compressorRelease ?? 250) / 1000), t, 0.05);
        const makeup = Math.pow(10, (f.compressorMakeupGain ?? 2) / 20);
        c.makeup.gain.setTargetAtTime(makeup, t, 0.05);
      } else {
        c.comp.threshold.setTargetAtTime(0, t, 0.05);
        c.comp.ratio.setTargetAtTime(1, t, 0.05);
        c.makeup.gain.setTargetAtTime(1, t, 0.05);
      }

      // 3. Limitador de Picos (Evita Distorção / Limiter)
      if (f.limiterEnabled) {
        c.limiter.threshold.setTargetAtTime(f.limiterThreshold ?? -1.5, t, 0.05);
        c.limiter.release.setTargetAtTime(Math.max(0.01, (f.limiterRelease ?? 100) / 1000), t, 0.05);
      } else {
        c.limiter.threshold.setTargetAtTime(0, t, 0.05);
      }
    } else if (opts.enhance) {
      // Padrão OBS Voz Clara
      c.hp.frequency.setTargetAtTime(85, t, 0.05); // corta ruído grave
      c.comp.threshold.setTargetAtTime(-24, t, 0.05);
      c.comp.knee.setTargetAtTime(14, t, 0.05);
      c.comp.ratio.setTargetAtTime(3.5, t, 0.05);
      c.comp.attack.setTargetAtTime(0.006, t, 0.05);
      c.comp.release.setTargetAtTime(0.25, t, 0.05);
      c.makeup.gain.setTargetAtTime(1.2, t, 0.05);
      c.limiter.threshold.setTargetAtTime(-1.5, t, 0.05);
      c.limiter.release.setTargetAtTime(0.1, t, 0.05);
    } else {
      // Bypass neutro
      c.hp.frequency.setTargetAtTime(20, t, 0.05);
      c.comp.threshold.setTargetAtTime(0, t, 0.05);
      c.comp.knee.setTargetAtTime(0, t, 0.05);
      c.comp.ratio.setTargetAtTime(1, t, 0.05);
      c.makeup.gain.setTargetAtTime(1, t, 0.05);
      c.limiter.threshold.setTargetAtTime(0, t, 0.05);
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

