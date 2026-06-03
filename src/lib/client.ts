// src/lib/client.ts — used by the Preact island.
import type { OutputFormat } from '../types';
import type { WorkerResponse } from './worker';

let worker: Worker | null = null;
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

export function processInWorker(
  id: string,
  file: File,
  format: OutputFormat,
): Promise<{ blob: Blob; name: string }> {
  const w = getWorker();
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', onMsg);
      if (e.data.ok && e.data.blob && e.data.name) {
        resolve({ blob: e.data.blob, name: e.data.name });
      } else {
        reject(new Error(e.data.error ?? 'Conversion failed.'));
      }
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ id, file, format });
  });
}
