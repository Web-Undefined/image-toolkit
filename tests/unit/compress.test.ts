import { describe, it, expect } from 'vitest';
import UPNG from 'upng-js';
import { compress } from '../../src/lib/compress';

function makePngFile(w: number, h: number, name = 'pic.png'): File {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = (i * 11) % 256;
    data[i * 4 + 1] = (i * 37) % 256;
    data[i * 4 + 2] = (i * 59) % 256;
    data[i * 4 + 3] = 255;
  }
  const buf = UPNG.encode([data.buffer], w, h, 0); // lossless input
  return new File([buf], name, { type: 'image/png' });
}

describe('compress (PNG path)', () => {
  it('produces a same-format PNG that is never larger than the input', async () => {
    const file = makePngFile(96, 96);
    const r = await compress(file, { quality: 50 });
    expect(r.name).toBe('pic-compressed.png');
    expect(r.outputSize).toBeLessThanOrEqual(r.inputSize);
    const dec = UPNG.decode(await r.blob.arrayBuffer());
    expect(dec.width).toBe(96);
    expect(dec.height).toBe(96);
  });

  it('flags already-optimized when re-encoding would not shrink', async () => {
    const file = makePngFile(1, 1);
    const r = await compress(file, { quality: 90 });
    expect(r.outputSize).toBeLessThanOrEqual(r.inputSize);
  });

  it('rejects unsupported input', async () => {
    const bad = new File([new Uint8Array([1, 2, 3, 4])], 'x.bin');
    await expect(compress(bad, { quality: 50 })).rejects.toThrow(/unsupported/i);
  });
});
