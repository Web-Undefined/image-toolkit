// src/lib/worker.ts — runs off the UI thread.
import type { OutputFormat } from '../types';
import { isLikelyHeic, isWithinSizeLimit } from './validate';
import { decodeHeicBuffer } from './decode';
import { ENCODERS } from './transforms';
import { processFile } from './batch';
import { compress } from './compress';

export type WorkerRequest =
  | { id: string; op: 'convert'; file: File; format: OutputFormat }
  | { id: string; op: 'compress'; file: File; quality: number };

export interface WorkerResponse {
  id: string;
  ok: boolean;
  blob?: Blob;
  name?: string;
  inputSize?: number;
  outputSize?: number;
  alreadyOptimized?: boolean;
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
    } else {
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
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Processing failed.';
    (self as unknown as Worker).postMessage({ id: req.id, ok: false, error } as WorkerResponse);
  }
};
