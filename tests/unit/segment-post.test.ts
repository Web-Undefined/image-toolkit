import { describe, it, expect } from 'vitest';
import { maskToAlpha } from '../../src/lib/segment-post';

function solidRgba(n: number, r: number, g: number, b: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  }
  return out;
}

describe('maskToAlpha', () => {
  it('min-max normalizes the mask into the alpha channel and preserves RGB', () => {
    const img = solidRgba(4, 10, 20, 30); // 2x2, all (10,20,30)
    const mask = new Float32Array([0, 0.5, 0.5, 1]); // 2x2
    const out = maskToAlpha(img, 2, 2, mask, 2, 2);
    expect(out.length).toBe(16);
    // RGB preserved
    expect([out[0], out[1], out[2]]).toEqual([10, 20, 30]);
    // alpha = round(normalized * 255)
    expect(out[3]).toBe(0);     // mask 0
    expect(out[7]).toBe(128);   // mask 0.5 → round(127.5)
    expect(out[11]).toBe(128);  // mask 0.5
    expect(out[15]).toBe(255);  // mask 1
  });

  it('treats a flat mask (max === min) as fully opaque', () => {
    const img = solidRgba(4, 1, 2, 3);
    const mask = new Float32Array([0.3, 0.3, 0.3, 0.3]);
    const out = maskToAlpha(img, 2, 2, mask, 2, 2);
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(255);
    expect(out[11]).toBe(255);
    expect(out[15]).toBe(255);
  });

  it('upscales a smaller mask to the image size (shape only)', () => {
    const img = solidRgba(16, 5, 5, 5); // 4x4
    const mask = new Float32Array([0, 1, 1, 0]); // 2x2
    const out = maskToAlpha(img, 4, 4, mask, 2, 2);
    expect(out.length).toBe(4 * 4 * 4);
  });
});
