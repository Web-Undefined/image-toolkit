import { useState, useCallback, useEffect } from 'preact/hooks';
import type { BatchStatus } from '../types';
import { removeBackgroundInWorker } from '../lib/client';
import type { RemoveBgOutcome } from '../lib/client';
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
  result?: RemoveBgOutcome;
  previewUrl?: string;
  error?: string;
}

let counter = 0;
const newId = () => `b${++counter}`;

export default function RemoveBgShell() {
  const [items, setItems] = useState<Item[]>([]);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  // Revoke all object URLs when the component unmounts to prevent memory leaks.
  useEffect(() => {
    return () => {
      setItems((prev) => {
        prev.forEach((it) => { if (it.previewUrl) URL.revokeObjectURL(it.previewUrl); });
        return prev;
      });
    };
  }, []);

  const runRemoval = useCallback(async (id: string, file: File) => {
    // Revoke any existing previewUrl for this item before re-processing.
    setItems((prev) => {
      const existing = prev.find((it) => it.id === id);
      if (existing?.previewUrl) URL.revokeObjectURL(existing.previewUrl);
      return prev;
    });
    update(id, { status: 'processing', result: undefined, previewUrl: undefined, error: undefined });
    try {
      const result = await removeBackgroundInWorker(id, file);
      update(id, { status: 'done', result, previewUrl: URL.createObjectURL(result.blob) });
    } catch (err) {
      update(id, { status: 'error', error: err instanceof Error ? err.message : 'Failed' });
    }
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    const fresh: Item[] = files.map((file) => ({ id: newId(), file, status: 'pending' }));
    setItems((prev) => [...prev, ...fresh]);
    // Sequential: the model is the bottleneck and memory-heavy.
    for (const item of fresh) {
      await runRemoval(item.id, item.file);
    }
  }, [runRemoval]);

  const rows: BatchRow[] = items.map((item) => ({
    id: item.id,
    status: item.status,
    fileName: item.file.name,
    resultName: item.result?.name,
    error: item.error,
    meta: item.result ? formatBytes(item.result.blob.size) : undefined,
    previewUrl: item.previewUrl,
    onDownload: item.result
      ? () => downloadBlob(item.result!.blob, item.result!.name)
      : undefined,
  }));

  const onDownloadAll = () => {
    const done = items.filter((i) => i.status === 'done' && i.result);
    void downloadAllZip(
      done.map((i) => ({ name: i.result!.name, blob: i.result!.blob })),
      'backgrounds-removed.zip',
    );
  };

  const loadingModel =
    items.some((i) => i.status === 'processing') && !items.some((i) => i.status === 'done');

  return (
    <section class="w-full">
      <Dropzone
        accept={ACCEPT}
        onFiles={addFiles}
        title="Drag & drop images to remove the background"
        subtitle="JPG, PNG, WebP & HEIC — processed entirely on your device, never uploaded"
      />

      {loadingModel && (
        <p data-testid="model-loading" class="text-xs text-violet-300 mb-4 px-1">
          Loading the background remover for the first time… this can take a few seconds.
        </p>
      )}

      <p class="text-xs text-slate-500 mb-4 px-1">Outputs a transparent PNG. The first image loads a small one-time model (~5 MB), then the rest are fast.</p>

      <BatchList rows={rows} onDownloadAll={onDownloadAll} downloadAllLabel={undefined} />
    </section>
  );
}
