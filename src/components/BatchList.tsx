import type { BatchStatus } from '../types';

export interface BatchRow {
  id: string;
  status: BatchStatus;
  fileName: string;
  resultName?: string;
  error?: string;
  meta?: string;        // optional extra line e.g. "2.4 MB → 740 KB · 69% smaller"
  previewUrl?: string;  // optional result thumbnail (object URL), shown on a checkerboard
  onDownload?: () => void;
}

interface Props {
  rows: BatchRow[];
  onDownloadAll?: () => void;
  downloadAllLabel?: string;
}

export default function BatchList({ rows, onDownloadAll, downloadAllLabel }: Props) {
  if (rows.length === 0) return null;
  const doneCount = rows.filter((r) => r.status === 'done').length;
  return (
    <>
      <ul class="flex flex-col gap-2 mb-3 list-none p-0" data-testid="batch-list">
        {rows.map((row) => (
          <li
            key={row.id}
            data-status={row.status}
            class={`flex items-center gap-3 rounded-xl px-4 py-3 border transition-colors
              ${row.status === 'done' ? 'bg-[--bg-surface] border-green-500/30' :
                row.status === 'error' ? 'bg-[--bg-surface] border-red-500/30' :
                'bg-[--bg-surface] border-[--border-subtle]'}`}
          >
            {row.previewUrl ? (
              <div
                class="w-12 h-12 rounded-lg flex-shrink-0 overflow-hidden border border-[--border-subtle]"
                style="background-image:linear-gradient(45deg,#334155 25%,transparent 25%,transparent 75%,#334155 75%),linear-gradient(45deg,#334155 25%,transparent 25%,transparent 75%,#334155 75%);background-size:10px 10px;background-position:0 0,5px 5px;background-color:#1e293b"
              >
                <img src={row.previewUrl} alt="" data-testid="preview" class="w-full h-full object-contain" />
              </div>
            ) : (
              <div class="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center text-sm flex-shrink-0">🖼</div>
            )}
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-slate-200 truncate">{row.fileName}</p>
              {row.status === 'processing' && (
                <div class="mt-1.5 h-1 bg-violet-500/20 rounded-full overflow-hidden">
                  <div class="h-full w-2/3 bg-gradient-to-r from-violet-600 to-purple-500 rounded-full progress-pulse" />
                </div>
              )}
              {row.status === 'done' && row.meta && (
                <p class="text-xs text-violet-300 mt-0.5">{row.meta}</p>
              )}
              {row.status === 'error' && (
                <p class="text-xs text-red-400 mt-0.5">{row.error}</p>
              )}
            </div>
            {row.status === 'processing' && (
              <span class="text-xs text-violet-400 flex-shrink-0">Processing…</span>
            )}
            {row.status === 'done' && row.onDownload && (
              <button
                type="button"
                data-testid="download"
                onClick={row.onDownload}
                class="flex-shrink-0 text-xs font-semibold text-violet-300 border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 rounded-lg hover:bg-violet-500/20 transition-colors"
              >
                ↓ Download
              </button>
            )}
          </li>
        ))}
      </ul>
      {doneCount > 1 && onDownloadAll && (
        <button
          type="button"
          data-testid="download-all"
          onClick={onDownloadAll}
          class="w-full text-sm font-semibold text-violet-300 border border-violet-500/35 bg-violet-500/10 py-2.5 rounded-xl hover:bg-violet-500/20 transition-colors"
        >
          {downloadAllLabel ?? `⬇ Download all (${doneCount}) as ZIP`}
        </button>
      )}
    </>
  );
}
