import type { OutputFormat, RawImage } from '../types';
import { outputName } from './filename';

export interface ProcessDeps {
  validateHeic: (file: File) => Promise<boolean>;
  validateSize: (file: File) => boolean;
  decode: (bytes: Uint8Array) => Promise<RawImage>;
  encoders: Record<OutputFormat, (img: RawImage) => Promise<Blob>>;
}

export async function processFile(
  file: File,
  format: OutputFormat,
  deps: ProcessDeps,
): Promise<{ blob: Blob; name: string }> {
  if (!deps.validateSize(file)) {
    throw new Error('This image is too large to process in your browser.');
  }
  if (!(await deps.validateHeic(file))) {
    throw new Error('This file is not a valid HEIC image.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const img = await deps.decode(bytes);
  const blob = await deps.encoders[format](img);
  return { blob, name: outputName(file.name, format) };
}
