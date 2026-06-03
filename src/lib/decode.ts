import type { RawImage } from '../types';
// The wasm-bundle entry inlines the WASM and runs in both node and the browser.
import libheif from 'libheif-js/wasm-bundle';

export async function decodeHeicBuffer(bytes: Uint8Array): Promise<RawImage> {
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(bytes);
  if (!images || images.length === 0) {
    throw new Error('No image found in HEIC data');
  }
  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();
  const data = new Uint8ClampedArray(width * height * 4);
  await new Promise<void>((resolve, reject) => {
    image.display({ data, width, height }, (out: unknown) => {
      if (out) resolve();
      else reject(new Error('HEIC decode failed'));
    });
  });
  return { width, height, data };
}
