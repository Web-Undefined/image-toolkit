import { describe, it, expect, vi } from 'vitest';
import { processFile } from '../../src/lib/batch';
import type { RawImage } from '../../src/types';

const fakeImg: RawImage = { width: 2, height: 2, data: new Uint8ClampedArray(16) };

function deps(over: Partial<Parameters<typeof processFile>[2]> = {}) {
  return {
    validateHeic: vi.fn().mockResolvedValue(true),
    validateSize: vi.fn().mockReturnValue(true),
    decode: vi.fn().mockResolvedValue(fakeImg),
    encoders: { jpg: vi.fn().mockResolvedValue(new Blob(['j'])) , png: vi.fn(), pdf: vi.fn() },
    ...over,
  } as Parameters<typeof processFile>[2];
}

const file = new File([new Uint8Array([1])], 'IMG_1.HEIC');

describe('processFile', () => {
  it('returns a blob and mapped name on success', async () => {
    const res = await processFile(file, 'jpg', deps());
    expect(res.name).toBe('IMG_1.jpg');
    expect(res.blob).toBeInstanceOf(Blob);
  });
  it('throws a friendly error when the file is not HEIC', async () => {
    const d = deps({ validateHeic: vi.fn().mockResolvedValue(false) });
    await expect(processFile(file, 'jpg', d)).rejects.toThrow(/not a valid HEIC/i);
  });
  it('throws a friendly error when the file is too large', async () => {
    const d = deps({ validateSize: vi.fn().mockReturnValue(false) });
    await expect(processFile(file, 'jpg', d)).rejects.toThrow(/too (big|large)/i);
  });
});
