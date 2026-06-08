// src/lib/worker.ts — runs off the UI thread.
import type { OutputFormat } from '../types';
import { isLikelyHeic, isWithinSizeLimit } from './validate';
import { decodeHeicBuffer } from './decode';
import { ENCODERS } from './transforms';
import { processFile } from './batch';
import { compress } from './compress';
import { resize } from './resize';
import type { ResizeOpts } from './resize-dimensions';

export type WorkerRequest =
  | { id: string; op: 'convert'; file: File; format: OutputFormat }
  | { id: string; op: 'compress'; file: File; quality: number }
  | { id: string; op: 'resize'; file: File; opts: ResizeOpts }
  | { id: string; op: 'remove-bg'; file: File };

export interface WorkerResponse {
  id: string;
  ok: boolean;
  blob?: Blob;
  name?: string;
  inputSize?: number;
  outputSize?: number;
  alreadyOptimized?: boolean;
  inputW?: number;
  inputH?: number;
  outputW?: number;
  outputH?: number;
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data;
  try {
    if (req.op === 'convert') {
      const { blob, name } = await processFile(req.file, req.format, {
        validateHeic: isLikelyHeic,
        validateSize: isWithinSizeLimit,
        decode: decodeHeicBuffer,
        encoders: ENCODERS,
      });
      (self as unknown as Worker).postMessage({ id: req.id, ok: true, blob, name } as WorkerResponse);
    } else if (req.op === 'compress') {
      const r = await compress(req.file, { quality: req.quality });
      (self as unknown as Worker).postMessage({
        id: req.id,
        ok: true,
        blob: r.blob,
        name: r.name,
        inputSize: r.inputSize,
        outputSize: r.outputSize,
        alreadyOptimized: r.alreadyOptimized,
      } as WorkerResponse);
    } else if (req.op === 'resize') {
      const r = await resize(req.file, req.opts);
      (self as unknown as Worker).postMessage({
        id: req.id,
        ok: true,
        blob: r.blob,
        name: r.name,
        inputW: r.inputW,
        inputH: r.inputH,
        outputW: r.outputW,
        outputH: r.outputH,
      } as WorkerResponse);
    } else {
      // Dynamically import so onnxruntime-web is only loaded on the remove-bg route,
      // never bundled into the shared worker that the other tools use.
      const { removeBackground } = await import('./remove-background');
      const r = await removeBackground(req.file);
      (self as unknown as Worker).postMessage({
        id: req.id, ok: true, blob: r.blob, name: r.name,
      } as WorkerResponse);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Processing failed.';
    (self as unknown as Worker).postMessage({ id: req.id, ok: false, error } as WorkerResponse);
  }
};
