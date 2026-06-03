import { describe, it, expect } from 'vitest';
import { outputName } from '../../src/lib/filename';

describe('outputName', () => {
  it('replaces a HEIC extension with the target extension', () => {
    expect(outputName('IMG_1234.HEIC', 'jpg')).toBe('IMG_1234.jpg');
  });
  it('handles lowercase .heic', () => {
    expect(outputName('photo.heic', 'png')).toBe('photo.png');
  });
  it('appends when there is no extension', () => {
    expect(outputName('photo', 'pdf')).toBe('photo.pdf');
  });
  it('only replaces the final extension', () => {
    expect(outputName('my.photo.heic', 'jpg')).toBe('my.photo.jpg');
  });
});
