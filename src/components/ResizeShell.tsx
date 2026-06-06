import { useState, useCallback } from 'preact/hooks';
import type { BatchStatus } from '../types';
import { resizeInWorker } from '../lib/client';
import type { ResizeOutcome } from '../lib/client';
import type { ResizeOpts } from '../lib/resize-dimensions';
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
  result?: ResizeOutcome;
  error?: string;
}

let counter = 0;
const newId = () => `r${++counter}`;

function metaFor(result: ResizeOutcome): string {
  return `${result.inputW}×${result.inputH} → ${result.outputW}×${result.outputH} · ${formatBytes(result.blob.size)}`;
}

function toNum(v: string): number | null {
  return v.trim() === '' ? null : Number(v);
}

export default function ResizeShell() {
  const [items, setItems] = useState<Item[]>([]);
  const [width, setWidth] = useState('800');
  const [height, setHeight] = useState('');
  const [lockAspect, setLockAspect] = useState(true);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const runResize = useCallback(async (id: string, file: File, opts: ResizeOpts) => {
    update(id, { status: 'processing', result: undefined, error: undefined });
    try {
      const result = await resizeInWorker(id, file, opts);
      update(id, { status: 'done', result });
    } catch (err) {
      update(id, { status: 'error', error: err instanceof Error ? err.message : 'Failed' });
    }
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    const fresh: Item[] = files.map((file) => ({ id: newId(), file, status: 'pending' }));
    setItems((prev) => [...prev, ...fresh]);
    const opts: ResizeOpts = { width: toNum(width), height: toNum(height), lockAspect };
    for (const item of fresh) {
      await runResize(item.id, item.file, opts);
    }
  }, [width, height, lockAspect, runResize]);

  const reprocessAll = (opts: ResizeOpts) => {
    for (const item of items) {
      void runResize(item.id, item.file, opts);
    }
  };

  const onWidth = (v: string) => {
    setWidth(v);
    reprocessAll({ width: toNum(v), height: toNum(height), lockAspect });
  };
  const onHeight = (v: string) => {
    setHeight(v);
    reprocessAll({ width: toNum(width), height: toNum(v), lockAspect });
  };
  const onLock = (v: boolean) => {
    setLockAspect(v);
    reprocessAll({ width: toNum(width), height: toNum(height), lockAspect: v });
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
      'resized-images.zip',
    );
  };

  return (
    <section class="w-full">
      <Dropzone
        accept={ACCEPT}
        onFiles={addFiles}
        title="Drag & drop images to resize"
        subtitle="JPG, PNG, WebP & HEIC — resized entirely on your device, never uploaded"
      />

      <div class="flex flex-wrap items-end gap-3 mb-4 px-1">
        <div class="flex flex-col">
          <label for="rw" class="text-xs text-slate-400 font-medium mb-1">Width (px)</label>
          <input
            id="rw" type="number" min="1" value={width} data-testid="width"
            class="w-28 bg-[--bg-surface] border border-[--border-subtle] rounded-lg px-3 py-1.5 text-sm text-slate-200"
            onInput={(e) => onWidth((e.currentTarget as HTMLInputElement).value)}
          />
        </div>
        <div class="flex flex-col">
          <label for="rh" class="text-xs text-slate-400 font-medium mb-1">Height (px)</label>
          <input
            id="rh" type="number" min="1" value={height} data-testid="height"
            placeholder={lockAspect ? 'Auto' : ''}
            class="w-28 bg-[--bg-surface] border border-[--border-subtle] rounded-lg px-3 py-1.5 text-sm text-slate-200"
            onInput={(e) => onHeight((e.currentTarget as HTMLInputElement).value)}
          />
        </div>
        <label class="flex items-center gap-2 text-xs text-slate-400 font-medium pb-1.5 cursor-pointer select-none">
          <input
            type="checkbox" checked={lockAspect} data-testid="lock" class="accent-violet-500"
            onChange={(e) => onLock((e.currentTarget as HTMLInputElement).checked)}
          />
          🔒 Lock aspect ratio
        </label>
      </div>

      <p class="text-xs text-slate-500 mb-4 px-1">With aspect ratio locked, set one dimension and each image keeps its proportions. HEIC images are saved as JPG.</p>

      <BatchList rows={rows} onDownloadAll={onDownloadAll} downloadAllLabel={undefined} />
    </section>
  );
}
