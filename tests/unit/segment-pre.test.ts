import { describe, it, expect } from 'vitest';
import { preprocess } from '../../src/lib/segment-pre';

// Helper: build an RGBA buffer from [r,g,b] triples (alpha forced to 255).
function rgba(pixels: [number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  });
  return out;
}

describe('preprocess', () => {
  it('normalizes a single pixel into NCHW RGB', () => {
    // 1x1 image, size 1 → identity. value/255 then (v-mean)/std.
    const out = preprocess(rgba([[255, 128, 0]]), 1, 1, 1);
    expect(out.length).toBe(3);
    expect(out[0]).toBeCloseTo((1.0 - 0.485) / 0.229, 4);            // R
    expect(out[1]).toBeCloseTo((128 / 255 - 0.456) / 0.224, 4);     // G
    expect(out[2]).toBeCloseTo((0 - 0.406) / 0.225, 4);             // B
  });

  it('packs channels plane-by-plane (NCHW) with spatial order y*size+x', () => {
    // 2x2 identity. R plane occupies indices 0..3.
    const out = preprocess(
      rgba([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]]),
      2, 2, 2,
    );
    expect(out.length).toBe(12);
    const rHi = (1.0 - 0.485) / 0.229;
    const rLo = (0 - 0.485) / 0.229;
    expect(out[0]).toBeCloseTo(rHi, 4); // (0,0) R=255
    expect(out[1]).toBeCloseTo(rLo, 4); // (1,0) R=0
    expect(out[2]).toBeCloseTo(rLo, 4); // (0,1) R=0
    expect(out[3]).toBeCloseTo(rHi, 4); // (1,1) R=255
  });

  it('resizes down to the requested size (shape only)', () => {
    const px: [number, number, number][] = Array.from({ length: 16 }, () => [10, 20, 30]);
    const out = preprocess(rgba(px), 4, 4, 2);
    expect(out.length).toBe(2 * 2 * 3);
  });
});
