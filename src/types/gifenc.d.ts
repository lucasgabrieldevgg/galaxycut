// Tipos mínimos do gifenc — o pacote não publica .d.ts. Cobrimos só a
// superfície que o GalaxyCut usa (exportação de GIF e transcodificação);
// se precisar de mais opções, consulte a doc do pacote e amplie aqui.
declare module "gifenc" {
  export interface GifEncoderOptions {
    auto?: boolean;
    initialCapacity?: number;
  }

  export interface GifFrameOptions {
    palette?: number[][];
    delay?: number;
    repeat?: number;
    transparent?: boolean;
    transparentIndex?: number;
    dispose?: number;
    first?: boolean;
  }

  export interface GifEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: GifFrameOptions): void;
    finish(): void;
    bytes(): Uint8Array<ArrayBuffer>;
    bytesView(): Uint8Array<ArrayBuffer>;
    reset(): void;
  }

  export function GIFEncoder(opts?: GifEncoderOptions): GifEncoder;

  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: {
      format?: "rgb565" | "rgb444" | "rgba4444";
      oneBitAlpha?: boolean;
      clearAlpha?: boolean;
    },
  ): number[][];

  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: "rgb565" | "rgb444" | "rgba4444",
  ): Uint8Array<ArrayBuffer>;
}
