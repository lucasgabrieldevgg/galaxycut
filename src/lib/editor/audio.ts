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

  /** Atualiza ganho/filtros por frame sem ruído de clique. */
  update(key: string, opts: { gain: number; enhance: boolean }) {
    const c = this.chains.get(key);
    if (!c || !this.ctx) return;
    const t = this.ctx.currentTime;
    const targetGain = Math.max(0, opts.gain);
    c.gain.gain.setTargetAtTime(targetGain, t, 0.015);
    if (opts.enhance) {
      c.hp.frequency.setTargetAtTime(85, t, 0.05); // corta ruído grave (vento/ar/zumbido)
      c.comp.threshold.setTargetAtTime(-24, t, 0.05);
      c.comp.knee.setTargetAtTime(14, t, 0.05);
      c.comp.ratio.setTargetAtTime(3.5, t, 0.05);
      c.makeup.gain.setTargetAtTime(1.2, t, 0.05); // compensa a compressão
    } else {
      c.hp.frequency.setTargetAtTime(20, t, 0.05);
      c.comp.threshold.setTargetAtTime(0, t, 0.05);
      c.comp.knee.setTargetAtTime(0, t, 0.05);
      c.comp.ratio.setTargetAtTime(1, t, 0.05);
      c.makeup.gain.setTargetAtTime(1, t, 0.05);
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

