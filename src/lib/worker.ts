// src/lib/worker.ts — runs off the UI thread.
import type { OutputFormat } from '../types';
import { isLikelyHeic, isWithinSizeLimit } from './validate';
import { decodeHeicBuffer } from './decode';
import { ENCODERS } from './transforms';
import { processFile } from './batch';

export interface WorkerRequest { id: string; file: File; format: OutputFormat; }
export interface WorkerResponse {
  id: string;
  ok: boolean;
  blob?: Blob;
  name?: string;
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, file, format } = e.data;
  try {
    const { blob, name } = await processFile(file, format, {
      validateHeic: isLikelyHeic,
      validateSize: isWithinSizeLimit,
      decode: decodeHeicBuffer,
      encoders: ENCODERS,
    });
    (self as unknown as Worker).postMessage({ id, ok: true, blob, name } as WorkerResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Conversion failed.';
    (self as unknown as Worker).postMessage({ id, ok: false, error } as WorkerResponse);
  }
};
