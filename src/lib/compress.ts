import type { RawImage, CompressResult } from '../types';
import { sniffImageFormat, isWithinSizeLimit } from './validate';
import { decodeImage } from './decode-image';
import UPNG from 'upng-js';

function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
}

function qualityToCnum(quality: number): number {
  // Map 0–100 slider to a palette size (2–256 colors).
  return Math.max(2, Math.min(256, Math.round((quality / 100) * 256)));
}

async function encodeCanvas(
  img: RawImage,
  type: 'image/jpeg' | 'image/webp',
  quality: number,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const pixels = new Uint8ClampedArray(img.data.length);
  pixels.set(img.data);
  ctx.putImageData(new ImageData(pixels, img.width, img.height), 0, 0);
  return canvas.convertToBlob({ type, quality: quality / 100 });
}

function encodePng(img: RawImage, quality: number): Blob {
  const out = UPNG.encode([img.data.buffer as ArrayBuffer], img.width, img.height, qualityToCnum(quality));
  return new Blob([out], { type: 'image/png' });
}

export async function compress(file: File, opts: { quality: number }): Promise<CompressResult> {
  if (!isWithinSizeLimit(file)) {
    throw new Error('This image is too large to process in your browser.');
  }
  const fmt = await sniffImageFormat(file);
  if (!fmt) throw new Error('Unsupported image format.');

  const img = await decodeImage(file);

  let blob: Blob;
  let ext: 'jpg' | 'png' | 'webp';
  if (fmt === 'jpg') { blob = await encodeCanvas(img, 'image/jpeg', opts.quality); ext = 'jpg'; }
  else if (fmt === 'webp') { blob = await encodeCanvas(img, 'image/webp', opts.quality); ext = 'webp'; }
  else if (fmt === 'png') { blob = encodePng(img, opts.quality); ext = 'png'; }
  else { blob = await encodeCanvas(img, 'image/jpeg', opts.quality); ext = 'jpg'; } // heic → jpg

  const inputSize = file.size;
  let outputSize = blob.size;
  let alreadyOptimized = false;

  // Never hand back a larger file for same-format results (HEIC always changes format → skip).
  if (fmt !== 'heic' && outputSize >= inputSize) {
    blob = file;
    outputSize = inputSize;
    alreadyOptimized = true;
  }

  return {
    blob,
    name: `${baseName(file.name)}-compressed.${ext}`,
    inputSize,
    outputSize,
    alreadyOptimized,
  };
}
