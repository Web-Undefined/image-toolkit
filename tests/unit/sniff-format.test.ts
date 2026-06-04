import { describe, it, expect } from 'vitest';
import { sniffImageFormat } from '../../src/lib/validate';

function file(bytes: number[]): File {
  return new File([new Uint8Array(bytes)], 'x');
}

describe('sniffImageFormat', () => {
  it('detects JPEG', async () => {
    expect(await sniffImageFormat(file([0xFF,0xD8,0xFF,0xE0,0,0,0,0,0,0,0,0]))).toBe('jpg');
  });
  it('detects PNG', async () => {
    expect(await sniffImageFormat(file([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0,0,0,0]))).toBe('png');
  });
  it('detects WebP', async () => {
    expect(await sniffImageFormat(file([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]))).toBe('webp');
  });
  it('detects HEIC', async () => {
    expect(await sniffImageFormat(file([0,0,0,0x18,0x66,0x74,0x79,0x70,0x68,0x65,0x69,0x63]))).toBe('heic');
  });
  it('returns null for unknown', async () => {
    expect(await sniffImageFormat(file([1,2,3,4,5,6,7,8,9,10,11,12]))).toBeNull();
  });
});
