import { useState, useCallback } from 'preact/hooks';
import type { OutputFormat, BatchItem } from '../types';
import { processInWorker } from '../lib/client';
import { zipBlobs } from '../lib/zip';

let counter = 0;
const newId = () => `f${++counter}`;

export default function ToolShell({ format }: { format: OutputFormat }) {
  const [items, setItems] = useState<BatchItem[]>([]);
  const [dragging, setDragging] = useState(false);

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

  const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
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
    <section class="w-full">
      {/* Dropzone */}
      <div
        class={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200 mb-4
          ${dragging
            ? 'border-violet-400 bg-violet-500/10'
            : 'border-[--border-accent] bg-gradient-to-br from-violet-900/10 to-purple-900/5 hover:border-violet-400 hover:bg-violet-500/5'
          }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-testid="dropzone"
        onClick={() => (document.querySelector('[data-testid="file-input"]') as HTMLInputElement)?.click()}
      >
        <div class="w-12 h-12 mx-auto mb-4 bg-violet-500/20 rounded-xl flex items-center justify-center text-2xl">
          📷
        </div>
        <p class="text-slate-200 font-semibold text-sm mb-1">Drag &amp; drop your HEIC files</p>
        <p class="text-slate-500 text-xs mb-4">Files are converted entirely on your device — never uploaded</p>
        <button
          class="bg-gradient-to-br from-violet-600 to-purple-600 text-white text-sm font-semibold px-5 py-2 rounded-lg btn-glow hover:from-violet-500 hover:to-purple-500 transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          Choose files
        </button>
        <input
          type="file"
          accept=".heic,.heif,image/heic,image/heif"
          multiple
          class="hidden"
          data-testid="file-input"
          onChange={(e) => {
            const input = e.currentTarget as HTMLInputElement;
            if (input.files) addFiles([...input.files]);
          }}
        />
      </div>

      {/* Batch list */}
      {items.length > 0 && (
        <ul class="flex flex-col gap-2 mb-3 list-none p-0" data-testid="batch-list">
          {items.map((item) => (
            <li
              key={item.id}
              data-status={item.status}
              class={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors
                ${item.status === 'done' ? 'bg-[--bg-surface] border-green-500/30' :
                  item.status === 'error' ? 'bg-[--bg-surface] border-red-500/30' :
                  'bg-[--bg-surface] border-[--border-subtle]'}`}
            >
              <div class="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center text-sm flex-shrink-0">
                🖼
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-slate-200 truncate">{item.file.name}</p>
                {item.status === 'processing' && (
                  <div class="mt-1.5 h-1 bg-violet-500/20 rounded-full overflow-hidden">
                    <div class="h-full w-2/3 bg-gradient-to-r from-violet-600 to-purple-500 rounded-full progress-pulse" />
                  </div>
                )}
                {item.status === 'error' && (
                  <p class="text-xs text-red-400 mt-0.5">{item.error}</p>
                )}
              </div>
              {item.status === 'processing' && (
                <span class="text-xs text-violet-400 flex-shrink-0">Converting…</span>
              )}
              {item.status === 'done' && (
                <button
                  data-testid="download"
                  onClick={() => download(item)}
                  class="flex-shrink-0 text-xs font-semibold text-violet-300 border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 rounded-lg hover:bg-violet-500/20 transition-colors"
                >
                  ↓ Download
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Download all */}
      {doneCount > 1 && (
        <button
          data-testid="download-all"
          onClick={downloadAll}
          class="w-full text-sm font-semibold text-violet-300 border border-violet-500/35 bg-violet-500/10 py-2.5 rounded-xl hover:bg-violet-500/20 transition-colors"
        >
          ⬇ Download all ({doneCount}) as ZIP
        </button>
      )}
    </section>
  );
}
