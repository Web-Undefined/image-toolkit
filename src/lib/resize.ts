import type { RawImage } from '../types';
import { sniffImageFormat, isWithinSizeLimit } from './validate';
import { decodeImage } from './decode-image';
import { computeTargetDimensions } from './resize-dimensions';
import type { ResizeOpts } from './resize-dimensions';

export interface ResizeResult {
  blob: Blob;
  name: string;
  inputW: number;
  inputH: number;
  outputW: number;
  outputH: number;
}

function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
}

function drawScaled(img: RawImage, tw: number, th: number): OffscreenCanvas {
  const source = new OffscreenCanvas(img.width, img.height);
  const sctx = source.getContext('2d');
  if (!sctx) throw new Error('Canvas 2D context unavailable');
  const pixels = new Uint8ClampedArray(img.data.length);
  pixels.set(img.data);
  sctx.putImageData(new ImageData(pixels, img.width, img.height), 0, 0);

  const target = new OffscreenCanvas(tw, th);
  const tctx = target.getContext('2d');
  if (!tctx) throw new Error('Canvas 2D context unavailable');
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(source, 0, 0, tw, th);
  return target;
}

export async function resize(file: File, opts: ResizeOpts): Promise<ResizeResult> {
  if (!isWithinSizeLimit(file)) {
    throw new Error('This image is too large to process in your browser.');
  }
  const fmt = await sniffImageFormat(file);
  if (!fmt) throw new Error('Unsupported image format.');

  const img = await decodeImage(file);
  const { width: tw, height: th } = computeTargetDimensions(img.width, img.height, opts);
  const canvas = drawScaled(img, tw, th);

  let type: 'image/jpeg' | 'image/png' | 'image/webp';
  let ext: 'jpg' | 'png' | 'webp';
  if (fmt === 'png') { type = 'image/png'; ext = 'png'; }
  else if (fmt === 'webp') { type = 'image/webp'; ext = 'webp'; }
  else { type = 'image/jpeg'; ext = 'jpg'; } // jpg and heic both output jpg

  const blob = type === 'image/png'
    ? await canvas.convertToBlob({ type })
    : await canvas.convertToBlob({ type, quality: 0.92 });

  return {
    blob,
    name: `${baseName(file.name)}-${tw}x${th}.${ext}`,
    inputW: img.width,
    inputH: img.height,
    outputW: tw,
    outputH: th,
  };
}
