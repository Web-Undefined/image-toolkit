import { useState, useCallback } from 'preact/hooks';
import type { BatchStatus } from '../types';
import { compressInWorker } from '../lib/client';
import type { CompressOutcome } from '../lib/client';
import { downloadBlob, downloadAllZip } from '../lib/download';
import { formatBytes } from '../lib/format-bytes';
import Dropzone from './Dropzone';
import BatchList from './BatchList';
import type { BatchRow } from './BatchList';

const ACCEPT = '.jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif';

interface Item {
  id: string;
  file: File;
  status: BatchStatus;
  result?: CompressOutcome;
  error?: string;
}

let counter = 0;
const newId = () => `c${++counter}`;

function metaFor(result: CompressOutcome): string {
  if (result.alreadyOptimized) return 'Already optimized — original kept';
  const saved = result.inputSize > 0
    ? Math.round((1 - result.outputSize / result.inputSize) * 100)
    : 0;
  return `${formatBytes(result.inputSize)} → ${formatBytes(result.outputSize)} · ${saved}% smaller`;
}

export default function CompressShell() {
  const [items, setItems] = useState<Item[]>([]);
  const [quality, setQuality] = useState(80);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const runCompression = useCallback(async (id: string, file: File, q: number) => {
    update(id, { status: 'processing', result: undefined, error: undefined });
    try {
      const result = await compressInWorker(id, file, q);
      update(id, { status: 'done', result });
    } catch (err) {
      update(id, { status: 'error', error: err instanceof Error ? err.message : 'Failed' });
    }
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    const fresh: Item[] = files.map((file) => ({ id: newId(), file, status: 'pending' }));
    setItems((prev) => [...prev, ...fresh]);
    for (const item of fresh) {
      await runCompression(item.id, item.file, quality);
    }
  }, [quality, runCompression]);

  const onQualityChange = (q: number) => {
    setQuality(q);
    for (const item of items) {
      void runCompression(item.id, item.file, q);
    }
  };

  const rows: BatchRow[] = items.map((item) => ({
    id: item.id,
    status: item.status,
    fileName: item.file.name,
    resultName: item.result?.name,
    error: item.error,
    meta: item.result ? metaFor(item.result) : undefined,
    onDownload: item.result
      ? () => downloadBlob(item.result!.blob, item.result!.name)
      : undefined,
  }));

  const onDownloadAll = () => {
    const done = items.filter((i) => i.status === 'done' && i.result);
    void downloadAllZip(
      done.map((i) => ({ name: i.result!.name, blob: i.result!.blob })),
      'compressed-images.zip',
    );
  };

  return (
    <section class="w-full">
      <Dropzone
        accept={ACCEPT}
        onFiles={addFiles}
        title="Drag & drop images to compress"
        subtitle="JPG, PNG, WebP & HEIC — compressed entirely on your device, never uploaded"
      />

      <div class="flex items-center gap-3 mb-4 px-1">
        <label for="quality" class="text-xs text-slate-400 font-medium whitespace-nowrap">Quality</label>
        <input
          id="quality"
          type="range"
          min="10"
          max="100"
          value={quality}
          data-testid="quality"
          class="flex-1 accent-violet-500"
          onChange={(e) => onQualityChange(Number((e.currentTarget as HTMLInputElement).value))}
        />
        <span class="text-xs text-violet-300 font-semibold w-10 text-right">{quality}</span>
      </div>

      <p class="text-xs text-slate-500 mb-4 px-1">HEIC images are compressed to JPG (browsers can't write HEIC).</p>

      <BatchList rows={rows} onDownloadAll={onDownloadAll} downloadAllLabel={undefined} />
    </section>
  );
}
