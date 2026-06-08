/**
 * Build a new RGBA buffer: copy the original RGB and replace alpha with a
 * min-max-normalized, nearest-neighbor-upscaled mask. A flat mask (max === min)
 * is treated as fully opaque.
 */
export function maskToAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Float32Array,
  maskW: number,
  maskH: number,
): Uint8ClampedArray {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] < min) min = mask[i];
    if (mask[i] > max) max = mask[i];
  }
  const range = max - min;
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = maskW / width;
  const sy = maskH / height;
  for (let y = 0; y < height; y++) {
    const my = Math.min(maskH - 1, Math.floor((y + 0.5) * sy));
    for (let x = 0; x < width; x++) {
      const mx = Math.min(maskW - 1, Math.floor((x + 0.5) * sx));
      const raw = mask[my * maskW + mx];
      const norm = range > 0 ? (raw - min) / range : 1;
      const i = (y * width + x) * 4;
      out[i] = rgba[i];
      out[i + 1] = rgba[i + 1];
      out[i + 2] = rgba[i + 2];
      out[i + 3] = Math.round(norm * 255);
    }
  }
  return out;
}
