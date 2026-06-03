import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeHeicBuffer } from '../../src/lib/decode';

describe('decodeHeicBuffer', () => {
  it('decodes the fixture into RGBA pixels', async () => {
    const bytes = new Uint8Array(readFileSync('tests/fixtures/sample.heic'));
    const img = await decodeHeicBuffer(bytes);
    expect(img.width).toBeGreaterThan(0);
    expect(img.height).toBeGreaterThan(0);
    expect(img.data.length).toBe(img.width * img.height * 4);
  }, 30_000);
});
