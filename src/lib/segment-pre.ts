import { INPUT_MEAN, INPUT_STD } from './segment-constants';

/**
 * Bilinear-resize an RGBA image to size×size, normalize per channel,
 * and pack as an NCHW Float32 tensor (RGB only, alpha dropped).
 */
export function preprocess(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  size: number,
): Float32Array {
  const out = new Float32Array(size * size * 3);
  const sx = width / size;
  const sy = height / size;
  for (let ty = 0; ty < size; ty++) {
    const fy = Math.min(height - 1, Math.max(0, (ty + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(height - 1, y0 + 1);
    const wy = fy - y0;
    for (let tx = 0; tx < size; tx++) {
      const fx = Math.min(width - 1, Math.max(0, (tx + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(width - 1, x0 + 1);
      const wx = fx - x0;
      for (let c = 0; c < 3; c++) {
        const p00 = rgba[(y0 * width + x0) * 4 + c];
        const p01 = rgba[(y0 * width + x1) * 4 + c];
        const p10 = rgba[(y1 * width + x0) * 4 + c];
        const p11 = rgba[(y1 * width + x1) * 4 + c];
        const top = p00 + (p01 - p00) * wx;
        const bot = p10 + (p11 - p10) * wx;
        const value = (top + (bot - top) * wy) / 255;
        out[c * size * size + ty * size + tx] = (value - INPUT_MEAN[c]) / INPUT_STD[c];
      }
    }
  }
  return out;
}
