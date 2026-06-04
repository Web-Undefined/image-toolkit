import type { RawImage } from '../types';
import { decodeHeicBuffer } from './decode';
import { sniffImageFormat } from './validate';
import UPNG from 'upng-js';

async function decodeViaCanvas(file: File): Promise<RawImage> {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, data: imageData.data };
}

function decodePng(bytes: Uint8Array): RawImage {
  const img = UPNG.decode(bytes.buffer as ArrayBuffer);
  const rgba = new Uint8ClampedArray(UPNG.toRGBA8(img)[0]);
  return { width: img.width, height: img.height, data: rgba };
}

export async function decodeImage(file: File): Promise<RawImage> {
  const fmt = await sniffImageFormat(file);
  if (fmt === 'heic') {
    return decodeHeicBuffer(new Uint8Array(await file.arrayBuffer()));
  }
  if (fmt === 'png') {
    return decodePng(new Uint8Array(await file.arrayBuffer()));
  }
  if (fmt === 'jpg' || fmt === 'webp') {
    return decodeViaCanvas(file);
  }
  throw new Error('Unsupported image format.');
}
