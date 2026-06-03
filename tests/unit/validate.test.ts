import { describe, it, expect } from 'vitest';
import { isLikelyHeic, isWithinSizeLimit, MAX_BYTES } from '../../src/lib/validate';

function fileFromBytes(bytes: number[], name = 'x.heic', size?: number): File {
  const u8 = new Uint8Array(bytes);
  const f = new File([u8], name);
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
}

// ftyp box: 4 bytes size, "ftyp", then brand "heic"
const heicHeader = [0,0,0,0x18, 0x66,0x74,0x79,0x70, 0x68,0x65,0x69,0x63];

describe('isLikelyHeic', () => {
  it('accepts a buffer with an ftyp heic brand', async () => {
    expect(await isLikelyHeic(fileFromBytes(heicHeader))).toBe(true);
  });
  it('rejects a JPEG header', async () => {
    expect(await isLikelyHeic(fileFromBytes([0xFF,0xD8,0xFF,0xE0,0,0,0,0,0,0,0,0]))).toBe(false);
  });
});

describe('isWithinSizeLimit', () => {
  it('accepts files at or under the limit', () => {
    expect(isWithinSizeLimit(fileFromBytes(heicHeader, 'x.heic', MAX_BYTES))).toBe(true);
  });
  it('rejects files over the limit', () => {
    expect(isWithinSizeLimit(fileFromBytes(heicHeader, 'x.heic', MAX_BYTES + 1))).toBe(false);
  });
});
