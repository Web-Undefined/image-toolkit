import { useState, useCallback } from 'preact/hooks';
import type { OutputFormat, BatchItem } from '../types';
import { processInWorker } from '../lib/client';
import { downloadBlob, downloadAllZip } from '../lib/download';
import Dropzone from './Dropzone';
import BatchList from './BatchList';
import type { BatchRow } from './BatchList';

let counter = 0;
const newId = () => `f${++counter}`;

export default function ToolShell({ format }: { format: OutputFormat }) {
  const [items, setItems] = useState<BatchItem[]>([]);

  const update = (id: string, patch: Partial<BatchItem>) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  const addFiles = useCallback(async (files: File[]) => {
    const fresh: BatchItem[] = files.map((file) => ({ id: newId(), file, status: 'pending' }));
    setItems((prev) => [...prev, ...fresh]);
    for (const item of fresh) {
      update(item.id, { status: 'processing' });
      try {
        const { blob, name } = await processInWorker(item.id, item.file, format);
        update(item.id, { status: 'done', resultBlob: blob, resultName: name });
      } catch (err) {
        update(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Failed' });
      }
    }
  }, [format]);

  const rows: BatchRow[] = items.map((item) => ({
    id: item.id,
    status: item.status,
    fileName: item.file.name,
    resultName: item.resultName,
    error: item.error,
    onDownload: item.resultBlob && item.resultName
      ? () => downloadBlob(item.resultBlob!, item.resultName!)
      : undefined,
  }));

  const onDownloadAll = () => {
    const done = items.filter((i) => i.status === 'done' && i.resultBlob && i.resultName);
    void downloadAllZip(
      done.map((i) => ({ name: i.resultName!, blob: i.resultBlob! })),
      `converted-${format}.zip`,
    );
  };

  return (
    <section class="w-full">
      <Dropzone accept=".heic,.heif,image/heic,image/heif" onFiles={addFiles} title="Drag & drop your HEIC files" />
      <BatchList rows={rows} onDownloadAll={onDownloadAll} />
    </section>
  );
}
