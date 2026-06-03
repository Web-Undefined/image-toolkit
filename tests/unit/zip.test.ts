import { describe, it, expect } from 'vitest';
import { unzipSync, strToU8 } from 'fflate';
import { zipBlobs } from '../../src/lib/zip';

describe('zipBlobs', () => {
  it('produces a zip containing each named entry', async () => {
    const a = new Blob([strToU8('hello')], { type: 'text/plain' });
    const b = new Blob([strToU8('world')], { type: 'text/plain' });
    const zip = await zipBlobs([{ name: 'a.txt', blob: a }, { name: 'b.txt', blob: b }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual(['a.txt', 'b.txt']);
  });
});
