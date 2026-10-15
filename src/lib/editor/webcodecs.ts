/**
 * WebCodecs surface used by the transcoder and export engines.
 * The project's TS DOM lib doesn't declare these constructors on `Window`,
 * so the window object is coerced once, at this boundary, into this typed host.
 * Runtime feature-checks (`if (WC.AudioEncoder)`) stay — browsers vary.
 */
export type WebCodecsHost = {
  VideoEncoder: typeof VideoEncoder;
  VideoFrame: typeof VideoFrame;
  AudioEncoder: typeof AudioEncoder;
  AudioData: typeof AudioData;
};
