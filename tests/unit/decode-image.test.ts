import { describe, it, expect } from 'vitest';
import UPNG from 'upng-js';
import { decodeImage } from '../../src/lib/decode-image';

function makePngFile(w: number, h: number): File {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = i % 256;
    data[i * 4 + 1] = (i * 3) % 256;
    data[i * 4 + 2] = (i * 7) % 256;
    data[i * 4 + 3] = 255;
  }
  const buf = UPNG.encode([data.buffer], w, h, 0); // lossless
  return new File([buf], 'pic.png', { type: 'image/png' });
}

describe('decodeImage (PNG path)', () => {
  it('decodes a PNG into RGBA pixels of the right size', async () => {
    const img = await decodeImage(makePngFile(32, 24));
    expect(img.width).toBe(32);
    expect(img.height).toBe(24);
    expect(img.data.length).toBe(32 * 24 * 4);
  });
});
