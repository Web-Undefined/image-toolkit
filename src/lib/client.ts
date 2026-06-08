// src/lib/client.ts — used by the Preact islands.
import type { OutputFormat } from '../types';
import type { WorkerRequest, WorkerResponse } from './worker';
import type { ResizeOpts } from './resize-dimensions';

let worker: Worker | null = null;
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

function call<T>(req: WorkerRequest, map: (r: WorkerResponse) => T): Promise<T> {
  const w = getWorker();
  return new Promise<T>((resolve, reject) => {
    const onMsg = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== req.id) return;
      w.removeEventListener('message', onMsg);
      if (e.data.ok) resolve(map(e.data));
      else reject(new Error(e.data.error ?? 'Processing failed.'));
    };
    w.addEventListener('message', onMsg);
    w.postMessage(req);
  });
}

export function processInWorker(
  id: string,
  file: File,
  format: OutputFormat,
): Promise<{ blob: Blob; name: string }> {
  return call({ id, op: 'convert', file, format }, (r) => {
    if (!r.blob || !r.name) throw new Error(r.error ?? 'Conversion failed.');
    return { blob: r.blob, name: r.name };
  });
}

export interface CompressOutcome {
  blob: Blob;
  name: string;
  inputSize: number;
  outputSize: number;
  alreadyOptimized: boolean;
}

export function compressInWorker(id: string, file: File, quality: number): Promise<CompressOutcome> {
  return call<CompressOutcome>({ id, op: 'compress', file, quality }, (r) => {
    if (!r.blob || !r.name) throw new Error(r.error ?? 'Compression failed.');
    return {
      blob: r.blob,
      name: r.name,
      inputSize: r.inputSize ?? 0,
      outputSize: r.outputSize ?? 0,
      alreadyOptimized: r.alreadyOptimized ?? false,
    };
  });
}

export interface ResizeOutcome {
  blob: Blob;
  name: string;
  inputW: number;
  inputH: number;
  outputW: number;
  outputH: number;
}

export function resizeInWorker(id: string, file: File, opts: ResizeOpts): Promise<ResizeOutcome> {
  return call<ResizeOutcome>({ id, op: 'resize', file, opts }, (r) => {
    if (!r.blob || !r.name) throw new Error(r.error ?? 'Resize failed.');
    return {
      blob: r.blob,
      name: r.name,
      inputW: r.inputW ?? 0,
      inputH: r.inputH ?? 0,
      outputW: r.outputW ?? 0,
      outputH: r.outputH ?? 0,
    };
  });
}

export interface RemoveBgOutcome {
  blob: Blob;
  name: string;
}

export function removeBackgroundInWorker(id: string, file: File): Promise<RemoveBgOutcome> {
  return call<RemoveBgOutcome>({ id, op: 'remove-bg', file }, (r) => {
    if (!r.blob || !r.name) throw new Error(r.error ?? 'Background removal failed.');
    return { blob: r.blob, name: r.name };
  });
}
