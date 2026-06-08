import { isWithinSizeLimit, sniffImageFormat } from './validate';
import { decodeImage } from './decode-image';
import { preprocess } from './segment-pre';
import { maskToAlpha } from './segment-post';
import { runSegmentation } from './onnx-session';
import { INPUT_SIZE } from './segment-constants';

export interface RemoveBgResult {
  blob: Blob;
  name: string;
}

function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
}

export async function removeBackground(file: File): Promise<RemoveBgResult> {
  if (!isWithinSizeLimit(file)) {
    throw new Error('This image is too large to process in your browser.');
  }
  const fmt = await sniffImageFormat(file);
  if (!fmt) throw new Error('Unsupported image format.');

  const img = await decodeImage(file);
  const input = preprocess(img.data, img.width, img.height, INPUT_SIZE);
  const mask = await runSegmentation(input);
  const rgba = maskToAlpha(img.data, img.width, img.height, mask, INPUT_SIZE, INPUT_SIZE);

  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const buf = new ArrayBuffer(rgba.byteLength);
  new Uint8ClampedArray(buf).set(rgba);
  ctx.putImageData(new ImageData(new Uint8ClampedArray(buf), img.width, img.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });

  return { blob, name: `${baseName(file.name)}-no-bg.png` };
}
