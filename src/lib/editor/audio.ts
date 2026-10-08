// GalaxyCut — motor de áudio WebAudio (preview + exportação)
// "Melhorar áudio" = cadeia real de estúdio: highpass 85Hz (corta ruído grave)
// → compressor (-24dB, suave) → limitador (não deixa estourar) → +20% de ganho.
"use client";

interface Chain {
  source: MediaElementAudioSourceNode;
  hp: BiquadFilterNode;
  comp: DynamicsCompressorNode;
  limiter: DynamicsCompressorNode;
  makeup: GainNode;
  gain: GainNode;
  lastGain?: number;
  lastEnhance?: boolean;
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
    this.chains.delete(key);
  }

  /** Atualiza ganho/filtros com prevenção de sobrecarga na fila de automação do WebAudio */
  update(key: string, opts: { gain: number; enhance: boolean }) {
    const c = this.chains.get(key);
    if (!c || !this.ctx) return;
    const t = this.ctx.currentTime;

    if (c.lastGain === undefined || Math.abs(c.lastGain - opts.gain) > 0.0005) {
      c.lastGain = opts.gain;
      try {
        c.gain.gain.cancelScheduledValues(t);
        c.gain.gain.setValueAtTime(opts.gain, t);
      } catch {
        c.gain.gain.value = opts.gain;
      }
    }

    if (c.lastEnhance !== opts.enhance) {
      c.lastEnhance = opts.enhance;
      try {
        if (opts.enhance) {
          c.hp.frequency.cancelScheduledValues(t);
          c.hp.frequency.setValueAtTime(85, t); // corta ruído grave (vento/ar/zumbido)
          c.comp.threshold.cancelScheduledValues(t);
          c.comp.threshold.setValueAtTime(-24, t);
          c.comp.knee.cancelScheduledValues(t);
          c.comp.knee.setValueAtTime(14, t);
          c.comp.ratio.cancelScheduledValues(t);
          c.comp.ratio.setValueAtTime(3.5, t);
          c.makeup.gain.cancelScheduledValues(t);
          c.makeup.gain.setValueAtTime(1.2, t); // compensa a compressão
          c.limiter.threshold.cancelScheduledValues(t);
          c.limiter.threshold.setValueAtTime(-1.5, t);
          c.limiter.release.cancelScheduledValues(t);
          c.limiter.release.setValueAtTime(0.1, t);
        } else {
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
    if (!this.ctx || !this.master) return;
    try {
      this.master.gain.setValueAtTime(1, this.ctx.currentTime);
    } catch {
      /* noop */
    }
  }
}

export const audioEngine = new AudioEngine();
