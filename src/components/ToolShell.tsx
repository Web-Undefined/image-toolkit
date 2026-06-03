import { useState, useCallback } from 'preact/hooks';
import type { OutputFormat, BatchItem } from '../types';
import { processInWorker } from '../lib/client';
import { zipBlobs } from '../lib/zip';

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

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer?.files) addFiles([...e.dataTransfer.files]);
  };

  const download = (item: BatchItem) => {
    if (!item.resultBlob || !item.resultName) return;
    const url = URL.createObjectURL(item.resultBlob);
    const a = document.createElement('a');
    a.href = url; a.download = item.resultName; a.click();
    URL.revokeObjectURL(url);
  };

  const downloadAll = async () => {
    const done = items.filter((i) => i.status === 'done' && i.resultBlob && i.resultName);
    const zip = await zipBlobs(done.map((i) => ({ name: i.resultName!, blob: i.resultBlob! })));
    const url = URL.createObjectURL(zip);
    const a = document.createElement('a');
    a.href = url; a.download = `converted-${format}.zip`; a.click();
    URL.revokeObjectURL(url);
  };

  const doneCount = items.filter((i) => i.status === 'done').length;

  return (
    <section>
      <div
        class="dropzone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        data-testid="dropzone"
      >
        <p>Drag &amp; drop HEIC files here — they never leave your device.</p>
        <input
          type="file"
          accept=".heic,.heif,image/heic,image/heif"
          multiple
          data-testid="file-input"
          onChange={(e) => {
            const input = e.currentTarget as HTMLInputElement;
            if (input.files) addFiles([...input.files]);
          }}
        />
      </div>

      <ul data-testid="batch-list">
        {items.map((item) => (
          <li key={item.id} data-status={item.status}>
            <span>{item.file.name}</span>
            {item.status === 'processing' && <span> — converting…</span>}
            {item.status === 'error' && <span class="error"> — {item.error}</span>}
            {item.status === 'done' && (
              <button data-testid="download" onClick={() => download(item)}>
                Download {item.resultName}
              </button>
            )}
          </li>
        ))}
      </ul>

      {doneCount > 1 && (
        <button data-testid="download-all" onClick={downloadAll}>
          Download all ({doneCount}) as zip
        </button>
      )}
    </section>
  );
}
