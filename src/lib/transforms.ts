import type { RawImage } from '../types';
import { PDFDocument } from 'pdf-lib';

function toCanvas(img: RawImage): OffscreenCanvas {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  // Create a new Uint8ClampedArray to ensure proper typing and compatibility
  const pixelData = new Uint8ClampedArray(new ArrayBuffer(img.data.length));
  pixelData.set(img.data);
  ctx.putImageData(new ImageData(pixelData, img.width, img.height), 0, 0);
  return canvas;
}

export async function toJpeg(img: RawImage, quality = 0.92): Promise<Blob> {
  return toCanvas(img).convertToBlob({ type: 'image/jpeg', quality });
}

export async function toPng(img: RawImage): Promise<Blob> {
  return toCanvas(img).convertToBlob({ type: 'image/png' });
}

export async function toPdf(img: RawImage): Promise<Blob> {
  // Embed a JPEG (smaller than PNG) of the image into a single-page PDF.
  const jpeg = await toJpeg(img);
  const jpegBytes = new Uint8Array(await jpeg.arrayBuffer());
  const pdf = await PDFDocument.create();
  const embedded = await pdf.embedJpg(jpegBytes);
  const page = pdf.addPage([img.width, img.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: img.width, height: img.height });
  const out = await pdf.save();
  return new Blob([out as BlobPart], { type: 'application/pdf' });
}

export const ENCODERS: Record<'jpg' | 'png' | 'pdf', (img: RawImage) => Promise<Blob>> = {
  jpg: toJpeg,
  png: toPng,
  pdf: toPdf,
};
