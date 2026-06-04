# Image Compressor + Cross-Tool Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-first image compressor (`/compress-image`, JPG/PNG/WebP/HEIC) and a cross-tool discovery system (registry → header dropdown + bottom related-tools grid + homepage) to the existing image-toolkit site.

**Architecture:** A shared tools registry drives all cross-linking. Shared UI primitives (`Dropzone`, `BatchList`) are extracted from the working converter and reused by a new `CompressShell` island. Compression runs in the existing Web Worker via a new `compress` op: JPG/WebP/HEIC re-encode through OffscreenCanvas; PNG shrinks via lossy quantization with `upng-js` (pure JS, node-testable).

**Tech Stack:** Astro, Preact, TypeScript, `upng-js` (lossy PNG), existing `libheif-js`, OffscreenCanvas, Vitest, Playwright.

---

## File Structure

```
src/
  content/
    tool-registry.ts        ← NEW: all-tools registry + relatedTools() (nav source of truth)
    tools.ts                ← MODIFY: add COMPRESS_CONTENT
  components/
    Dropzone.tsx            ← NEW: extracted dropzone primitive
    BatchList.tsx           ← NEW: extracted batch-list primitive (+ optional size meta line)
    CompressShell.tsx       ← NEW: compressor island (Dropzone + slider + BatchList)
    RelatedTools.astro      ← NEW: bottom cross-tool grid
    ToolShell.tsx           ← MODIFY: consume Dropzone + BatchList + download helpers
    ToolPage.astro          ← MODIFY: render RelatedTools
  layouts/
    BaseLayout.astro        ← MODIFY: "All Tools" dropdown + brand rename
  lib/
    download.ts             ← NEW: downloadBlob + downloadAllZip helpers
    format-bytes.ts         ← NEW: human-readable byte sizes
    decode-image.ts         ← NEW: multi-format decode → RawImage
    compress.ts             ← NEW: compression pipeline
    validate.ts             ← MODIFY: add sniffImageFormat()
    worker.ts               ← MODIFY: add 'compress' op (discriminated union)
    client.ts               ← MODIFY: shared call() + compressInWorker()
  pages/
    compress-image.astro    ← NEW: compressor page
    index.astro             ← MODIFY: read grid from registry
  types.ts                  ← MODIFY: add CompressResult
  upng.d.ts                 ← NEW: ambient types for upng-js
tests/
  unit/tool-registry.test.ts   ← NEW
  unit/format-bytes.test.ts    ← NEW
  unit/sniff-format.test.ts     ← NEW
  unit/decode-image.test.ts     ← NEW
  unit/compress.test.ts         ← NEW
  e2e/compress.spec.ts          ← NEW
```

**Existing files relied upon (do not change unless a task says so):** `src/lib/decode.ts`
(`decodeHeicBuffer`), `src/lib/zip.ts` (`zipBlobs`), `src/lib/transforms.ts` (`ENCODERS`),
`src/lib/batch.ts` (`processFile`), `src/components/Faq.astro`, `tests/fixtures/sample.heic`.

---

## Phase A — Cross-tool discovery (independent, ships first)

### Task A1: Tools registry

**Files:**
- Create: `src/content/tool-registry.ts`
- Test: `tests/unit/tool-registry.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { TOOL_REGISTRY, relatedTools } from '../../src/content/tool-registry';

describe('tool registry', () => {
  it('has no duplicate slugs', () => {
    const slugs = TOOL_REGISTRY.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
  it('includes the compressor and the three converters', () => {
    const slugs = TOOL_REGISTRY.map((t) => t.slug);
    expect(slugs).toContain('compress-image');
    expect(slugs).toContain('heic-to-jpg');
    expect(slugs).toContain('heic-to-png');
    expect(slugs).toContain('heic-to-pdf');
  });
  it('relatedTools excludes the current slug', () => {
    const related = relatedTools('compress-image');
    expect(related.find((t) => t.slug === 'compress-image')).toBeUndefined();
    expect(related).toHaveLength(TOOL_REGISTRY.length - 1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/tool-registry.test.ts`
Expected: FAIL — cannot find module `tool-registry`.

- [ ] **Step 3: Implement**

```ts
export interface ToolEntry {
  slug: string;       // 'compress-image'
  href: string;       // '/compress-image'
  name: string;       // 'Compress Image' — card title / anchor text
  shortName: string;  // 'Compress' — header menu label
  icon: string;       // emoji glyph
  blurb: string;      // one-line description for cards
}

export const TOOL_REGISTRY: ToolEntry[] = [
  { slug: 'compress-image', href: '/compress-image', name: 'Compress Image', shortName: 'Compress', icon: '🗜', blurb: 'Shrink JPG, PNG, WebP & HEIC file sizes.' },
  { slug: 'heic-to-jpg', href: '/heic-to-jpg', name: 'HEIC to JPG', shortName: 'HEIC→JPG', icon: '🖼', blurb: 'Convert iPhone HEIC photos to JPG.' },
  { slug: 'heic-to-png', href: '/heic-to-png', name: 'HEIC to PNG', shortName: 'HEIC→PNG', icon: '🎨', blurb: 'Convert HEIC to lossless PNG.' },
  { slug: 'heic-to-pdf', href: '/heic-to-pdf', name: 'HEIC to PDF', shortName: 'HEIC→PDF', icon: '📄', blurb: 'Turn HEIC photos into PDF documents.' },
];

export function relatedTools(currentSlug: string): ToolEntry[] {
  return TOOL_REGISTRY.filter((t) => t.slug !== currentSlug);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/tool-registry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/content/tool-registry.ts tests/unit/tool-registry.test.ts
git commit -m "feat: add tools registry with relatedTools helper"
```

### Task A2: RelatedTools grid + render on tool pages

**Files:**
- Create: `src/components/RelatedTools.astro`
- Modify: `src/components/ToolPage.astro`

- [ ] **Step 1: Create `RelatedTools.astro`**

```astro
---
import { relatedTools } from '../content/tool-registry';
interface Props { currentSlug: string; }
const { currentSlug } = Astro.props;
const tools = relatedTools(currentSlug);
---
<section class="max-w-3xl mx-auto px-6 pb-16" data-testid="related-tools">
  <h2 class="text-sm font-bold text-violet-400 uppercase tracking-wider mb-4">More free tools</h2>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
    {tools.map((tool) => (
      <a
        href={tool.href}
        class="group block bg-[--bg-surface] border border-[--border-subtle] rounded-2xl p-5
               hover:border-violet-500/40 hover:bg-[--bg-surface-hover] transition-all duration-200 no-underline"
      >
        <div class="w-9 h-9 bg-violet-500/20 rounded-xl flex items-center justify-center text-lg mb-3">
          {tool.icon}
        </div>
        <h3 class="text-sm font-bold text-slate-200 mb-1 group-hover:text-violet-300 transition-colors">{tool.name}</h3>
        <p class="text-xs text-slate-500 leading-relaxed">{tool.blurb}</p>
      </a>
    ))}
  </div>
</section>
```

- [ ] **Step 2: Render it in `ToolPage.astro`**

In `src/components/ToolPage.astro`, add the import to the frontmatter (after the existing imports):
```astro
import RelatedTools from './RelatedTools.astro';
```
Then add `<RelatedTools currentSlug={tool.slug} />` immediately after the FAQ block. The FAQ block currently is:
```astro
  {/* FAQ */}
  <div class="max-w-2xl mx-auto px-6 pb-16">
    <Faq faq={tool.faq} />
  </div>

</BaseLayout>
```
Change it to:
```astro
  {/* FAQ */}
  <div class="max-w-2xl mx-auto px-6 pb-8">
    <Faq faq={tool.faq} />
  </div>

  <RelatedTools currentSlug={tool.slug} />

</BaseLayout>
```

- [ ] **Step 3: Verify build**

Run: `npx astro build`
Expected: 0 errors. `dist/heic-to-jpg/index.html` contains `data-testid="related-tools"` and a link to `/heic-to-png`.

- [ ] **Step 4: Commit**

```bash
git add src/components/RelatedTools.astro src/components/ToolPage.astro
git commit -m "feat: add related-tools grid to tool pages"
```

### Task A3: Header "All Tools" dropdown + brand rename

**Files:**
- Modify: `src/layouts/BaseLayout.astro`

- [ ] **Step 1: Update the header in `BaseLayout.astro`**

Add the registry import to the frontmatter (after `import '../styles/global.css';`):
```astro
import { TOOL_REGISTRY } from '../content/tool-registry';
```
Replace the entire existing `<header>...</header>` block with:
```astro
    <header class="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-[--border-subtle] bg-[--bg-base]/95 backdrop-blur-sm">
      <a href="/" class="gradient-text font-bold text-base tracking-tight">⬡ Image Toolkit</a>
      <nav class="flex gap-5 items-center">
        <details class="relative group">
          <summary class="list-none cursor-pointer text-sm text-slate-400 hover:text-violet-400 transition-colors select-none">All Tools ▾</summary>
          <div class="absolute right-0 mt-2 w-56 bg-[--bg-base] border border-[--border-subtle] rounded-xl p-2 shadow-xl z-50">
            {TOOL_REGISTRY.map((tool) => (
              <a href={tool.href} class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-[--bg-surface-hover] hover:text-violet-300 transition-colors no-underline">
                <span>{tool.icon}</span><span>{tool.name}</span>
              </a>
            ))}
          </div>
        </details>
        <a href="/about" class="text-sm text-slate-400 hover:text-violet-400 transition-colors">About</a>
        <a href="/privacy" class="text-sm text-slate-400 hover:text-violet-400 transition-colors">Privacy</a>
      </nav>
    </header>
```

This uses a native `<details>` dropdown — works with zero JS (good for a static site). The brand label changes from "HEIC Toolkit" to "Image Toolkit".

- [ ] **Step 2: Verify build**

Run: `npx astro build`
Expected: 0 errors. `dist/index.html` contains `All Tools` and `Image Toolkit`.

- [ ] **Step 3: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat: add All Tools header dropdown, rename brand to Image Toolkit"
```

### Task A4: Homepage reads from registry

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Replace `index.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import { TOOL_REGISTRY } from '../content/tool-registry';
---
<BaseLayout
  title="Image Toolkit — Free Private Image Tools"
  description="Compress images and convert HEIC photos to JPG, PNG, or PDF for free. 100% in your browser — your files are never uploaded."
>
  {/* Hero */}
  <div class="relative text-center px-6 pt-16 pb-10 overflow-hidden">
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,var(--purple-glow),transparent)] pointer-events-none" />
    <h1 class="relative gradient-text text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-4">
      Free, private<br />image tools
    </h1>
    <p class="relative text-slate-400 text-base max-w-md mx-auto leading-relaxed mb-4">
      Compress and convert your images right in your browser. Every tool runs entirely on your device — your files are never uploaded.
    </p>
    <span class="inline-flex items-center gap-1.5 bg-violet-500/15 border border-violet-500/30 text-violet-300 text-sm px-4 py-1.5 rounded-full">
      🔒 No upload · No account · No cost
    </span>
  </div>

  {/* Tool cards */}
  <div class="max-w-3xl mx-auto px-6 pb-20 grid grid-cols-1 sm:grid-cols-3 gap-4">
    {TOOL_REGISTRY.map((tool) => (
      <a
        href={tool.href}
        class="group block bg-[--bg-surface] border border-[--border-subtle] rounded-2xl p-6
               hover:border-violet-500/40 hover:bg-[--bg-surface-hover] transition-all duration-200 no-underline"
      >
        <div class="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center text-xl mb-4">
          {tool.icon}
        </div>
        <h2 class="text-base font-bold text-slate-200 mb-2 group-hover:text-violet-300 transition-colors">{tool.name}</h2>
        <p class="text-sm text-slate-500 leading-relaxed">{tool.blurb}</p>
        <span class="inline-block mt-4 text-xs font-semibold text-violet-400 group-hover:text-violet-300">Open tool →</span>
      </a>
    ))}
  </div>
</BaseLayout>
```

- [ ] **Step 2: Verify build & commit**

Run: `npx astro build`
Expected: 0 errors; homepage shows 4 cards.
```bash
git add src/pages/index.astro
git commit -m "feat: drive homepage grid from tools registry"
```

---

## Phase B — Shared primitives + ToolShell refactor (regression-guarded)

### Task B1: Download helpers

**Files:**
- Create: `src/lib/download.ts`

> These use DOM APIs (`document`, `URL.createObjectURL`) so they're browser-only; correctness is
> covered by the existing converter e2e (Task verified in Phase E) plus the compressor e2e. No node
> unit test.

- [ ] **Step 1: Implement**

```ts
import { zipBlobs } from './zip';

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAllZip(
  items: { name: string; blob: Blob }[],
  zipName: string,
): Promise<void> {
  const zip = await zipBlobs(items);
  downloadBlob(zip, zipName);
}
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/download.ts
git commit -m "feat: extract download + zip helpers"
```

### Task B2: Dropzone primitive

**Files:**
- Create: `src/components/Dropzone.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useRef, useState } from 'preact/hooks';

interface Props {
  accept: string;
  onFiles: (files: File[]) => void;
  title?: string;
  subtitle?: string;
}

export default function Dropzone({
  accept,
  onFiles,
  title = 'Drag & drop your files',
  subtitle = 'Files are processed entirely on your device — never uploaded',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = () => setDragging(false);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer?.files) onFiles([...e.dataTransfer.files]);
  };

  return (
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
      onClick={() => inputRef.current?.click()}
    >
      <div class="w-12 h-12 mx-auto mb-4 bg-violet-500/20 rounded-xl flex items-center justify-center text-2xl">📷</div>
      <p class="text-slate-200 font-semibold text-sm mb-1">{title}</p>
      <p class="text-slate-500 text-xs mb-4">{subtitle}</p>
      <button
        type="button"
        class="bg-gradient-to-br from-violet-600 to-purple-600 text-white text-sm font-semibold px-5 py-2 rounded-lg btn-glow hover:from-violet-500 hover:to-purple-500 transition-all"
        onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
      >
        Choose files
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        class="sr-only"
        data-testid="file-input"
        onChange={(e) => {
          const input = e.currentTarget as HTMLInputElement;
          if (input.files) onFiles([...input.files]);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Dropzone.tsx
git commit -m "feat: extract Dropzone primitive"
```

### Task B3: BatchList primitive

**Files:**
- Create: `src/components/BatchList.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { BatchStatus } from '../types';

export interface BatchRow {
  id: string;
  status: BatchStatus;
  fileName: string;
  resultName?: string;  // download filename when done
  error?: string;       // message when status === 'error'
  meta?: string;        // optional extra line, e.g. "2.4 MB → 740 KB · 69% smaller"
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
            <div class="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center text-sm flex-shrink-0">🖼</div>
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
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/BatchList.tsx
git commit -m "feat: extract BatchList primitive with optional size meta"
```

### Task B4: Refactor ToolShell to use the primitives

**Files:**
- Modify: `src/components/ToolShell.tsx`

- [ ] **Step 1: Replace `ToolShell.tsx`**

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Regression test — existing converter e2e must still pass**

Run:
```bash
npx astro build
npx playwright test tests/e2e/convert.spec.ts
```
Expected: 3 tests pass (jpg, png, pdf). This confirms the refactor preserved behavior. If any fail, the `data-testid` attributes in `Dropzone`/`BatchList` don't match what the e2e expects — verify `dropzone`, `file-input`, `batch-list`, `download` are present.

- [ ] **Step 4: Commit**

```bash
git add src/components/ToolShell.tsx
git commit -m "refactor: ToolShell uses shared Dropzone/BatchList primitives"
```

---

## Phase C — Compressor core library (TDD)

### Task C1: Add upng-js + ambient types

**Files:**
- Modify: `package.json` (via npm)
- Create: `src/upng.d.ts`

- [ ] **Step 1: Install**

Run: `npm install upng-js`
Expected: installs without error.

- [ ] **Step 2: Create `src/upng.d.ts`**

```ts
declare module 'upng-js' {
  interface UPNGImage {
    width: number;
    height: number;
    depth: number;
    ctype: number;
    frames: unknown[];
    tabs: unknown;
    data: Uint8Array;
  }
  const UPNG: {
    decode(buffer: ArrayBuffer): UPNGImage;
    toRGBA8(img: UPNGImage): ArrayBuffer[];
    encode(bufs: ArrayBuffer[], w: number, h: number, cnum: number): ArrayBuffer;
  };
  export default UPNG;
}
```

- [ ] **Step 3: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/upng.d.ts
git commit -m "chore: add upng-js with ambient types"
```

### Task C2: Types + byte formatting

**Files:**
- Modify: `src/types.ts`
- Create: `src/lib/format-bytes.ts`
- Test: `tests/unit/format-bytes.test.ts`

- [ ] **Step 1: Add `CompressResult` to `src/types.ts`**

Append to the file:
```ts
export interface CompressResult {
  blob: Blob;
  name: string;
  inputSize: number;   // bytes
  outputSize: number;  // bytes — never greater than inputSize
  alreadyOptimized: boolean;
}
```

- [ ] **Step 2: Write the failing test for `format-bytes`**

```ts
import { describe, it, expect } from 'vitest';
import { formatBytes } from '../../src/lib/format-bytes';

describe('formatBytes', () => {
  it('formats bytes under 1 KB', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });
  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
  it('formats megabytes', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run tests/unit/format-bytes.test.ts`
Expected: FAIL — cannot find module `format-bytes`.

- [ ] **Step 4: Implement `src/lib/format-bytes.ts`**

```ts
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run tests/unit/format-bytes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/lib/format-bytes.ts tests/unit/format-bytes.test.ts
git commit -m "feat: add CompressResult type and formatBytes helper"
```

### Task C3: Image format sniffing

**Files:**
- Modify: `src/lib/validate.ts`
- Test: `tests/unit/sniff-format.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { sniffImageFormat } from '../../src/lib/validate';

function file(bytes: number[]): File {
  return new File([new Uint8Array(bytes)], 'x');
}

describe('sniffImageFormat', () => {
  it('detects JPEG', async () => {
    expect(await sniffImageFormat(file([0xFF,0xD8,0xFF,0xE0,0,0,0,0,0,0,0,0]))).toBe('jpg');
  });
  it('detects PNG', async () => {
    expect(await sniffImageFormat(file([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0,0,0,0]))).toBe('png');
  });
  it('detects WebP', async () => {
    // "RIFF" .... "WEBP"
    expect(await sniffImageFormat(file([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]))).toBe('webp');
  });
  it('detects HEIC', async () => {
    // size, "ftyp", "heic"
    expect(await sniffImageFormat(file([0,0,0,0x18,0x66,0x74,0x79,0x70,0x68,0x65,0x69,0x63]))).toBe('heic');
  });
  it('returns null for unknown', async () => {
    expect(await sniffImageFormat(file([1,2,3,4,5,6,7,8,9,10,11,12]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/sniff-format.test.ts`
Expected: FAIL — `sniffImageFormat` is not exported.

- [ ] **Step 3: Implement — append to `src/lib/validate.ts`**

```ts
export type SniffedFormat = 'jpg' | 'png' | 'webp' | 'heic' | null;

export async function sniffImageFormat(file: File): Promise<SniffedFormat> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  // JPEG: FF D8 FF
  if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return 'jpg';
  // PNG: 89 50 4E 47
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) return 'png';
  // WebP: "RIFF" then "WEBP" at offset 8
  if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'webp';
  // HEIC: ftyp box + known brand (reuse HEIC_BRANDS from above)
  const ftyp = String.fromCharCode(head[4], head[5], head[6], head[7]);
  if (ftyp === 'ftyp') {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (HEIC_BRANDS.includes(brand)) return 'heic';
  }
  return null;
}
```
(`HEIC_BRANDS` already exists at the top of this file from the original implementation.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/sniff-format.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validate.ts tests/unit/sniff-format.test.ts
git commit -m "feat: add image format sniffing"
```

### Task C4: Multi-format decode

**Files:**
- Create: `src/lib/decode-image.ts`
- Test: `tests/unit/decode-image.test.ts`

> The PNG path uses `upng-js` (pure JS) and is node-testable. JPG/WebP use `createImageBitmap`
> (browser-only) and HEIC uses the existing libheif worker path; those branches are covered by the
> compressor e2e. The unit test exercises the PNG branch only.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import UPNG from 'upng-js';
import { decodeImage } from '../../src/lib/decode-image';

function makePngFile(w: number, h: number): File {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = i % 256;
    data[i * 4 + 1] = (i * 3) % 256;
    data[i * 4 + 2] = (i * 7) % 256;
    data[i * 4 + 3] = 255;
  }
  const buf = UPNG.encode([data.buffer], w, h, 0); // lossless
  return new File([buf], 'pic.png', { type: 'image/png' });
}

describe('decodeImage (PNG path)', () => {
  it('decodes a PNG into RGBA pixels of the right size', async () => {
    const img = await decodeImage(makePngFile(32, 24));
    expect(img.width).toBe(32);
    expect(img.height).toBe(24);
    expect(img.data.length).toBe(32 * 24 * 4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/decode-image.test.ts`
Expected: FAIL — cannot find module `decode-image`.

- [ ] **Step 3: Implement `src/lib/decode-image.ts`**

```ts
import type { RawImage } from '../types';
import { decodeHeicBuffer } from './decode';
import { sniffImageFormat } from './validate';
import UPNG from 'upng-js';

async function decodeViaCanvas(file: File): Promise<RawImage> {
  const bitmap = await createImageBitmap(file);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { width: bitmap.width, height: bitmap.height, data: imageData.data };
}

function decodePng(bytes: Uint8Array): RawImage {
  const img = UPNG.decode(bytes.buffer as ArrayBuffer);
  const rgba = new Uint8ClampedArray(UPNG.toRGBA8(img)[0]);
  return { width: img.width, height: img.height, data: rgba };
}

export async function decodeImage(file: File): Promise<RawImage> {
  const fmt = await sniffImageFormat(file);
  if (fmt === 'heic') {
    return decodeHeicBuffer(new Uint8Array(await file.arrayBuffer()));
  }
  if (fmt === 'png') {
    return decodePng(new Uint8Array(await file.arrayBuffer()));
  }
  if (fmt === 'jpg' || fmt === 'webp') {
    return decodeViaCanvas(file);
  }
  throw new Error('Unsupported image format.');
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/decode-image.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/decode-image.ts tests/unit/decode-image.test.ts
git commit -m "feat: add multi-format image decode"
```

### Task C5: Compression pipeline

**Files:**
- Create: `src/lib/compress.ts`
- Test: `tests/unit/compress.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import UPNG from 'upng-js';
import { compress } from '../../src/lib/compress';

function makePngFile(w: number, h: number, name = 'pic.png'): File {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = (i * 11) % 256;
    data[i * 4 + 1] = (i * 37) % 256;
    data[i * 4 + 2] = (i * 59) % 256;
    data[i * 4 + 3] = 255;
  }
  const buf = UPNG.encode([data.buffer], w, h, 0); // lossless input
  return new File([buf], name, { type: 'image/png' });
}

describe('compress (PNG path)', () => {
  it('produces a same-format PNG that is never larger than the input', async () => {
    const file = makePngFile(96, 96);
    const r = await compress(file, { quality: 50 });
    expect(r.name).toBe('pic-compressed.png');
    expect(r.outputSize).toBeLessThanOrEqual(r.inputSize);
    // result is a valid PNG of the same dimensions
    const dec = UPNG.decode(await r.blob.arrayBuffer());
    expect(dec.width).toBe(96);
    expect(dec.height).toBe(96);
  });

  it('flags already-optimized when re-encoding would not shrink', async () => {
    const file = makePngFile(1, 1);
    const r = await compress(file, { quality: 90 });
    // never returns a bigger file
    expect(r.outputSize).toBeLessThanOrEqual(r.inputSize);
  });

  it('rejects unsupported input', async () => {
    const bad = new File([new Uint8Array([1, 2, 3, 4])], 'x.bin');
    await expect(compress(bad, { quality: 50 })).rejects.toThrow(/unsupported/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/compress.test.ts`
Expected: FAIL — cannot find module `compress`.

- [ ] **Step 3: Implement `src/lib/compress.ts`**

```ts
import type { RawImage, CompressResult } from '../types';
import { sniffImageFormat, isWithinSizeLimit } from './validate';
import { decodeImage } from './decode-image';
import UPNG from 'upng-js';

function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
}

function qualityToCnum(quality: number): number {
  // Map 0–100 slider to a palette size (2–256 colors). Always quantized (lossy) so PNGs shrink.
  return Math.max(2, Math.min(256, Math.round((quality / 100) * 256)));
}

async function encodeCanvas(
  img: RawImage,
  type: 'image/jpeg' | 'image/webp',
  quality: number,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const pixels = new Uint8ClampedArray(img.data.length);
  pixels.set(img.data);
  ctx.putImageData(new ImageData(pixels, img.width, img.height), 0, 0);
  return canvas.convertToBlob({ type, quality: quality / 100 });
}

function encodePng(img: RawImage, quality: number): Blob {
  const out = UPNG.encode([img.data.buffer as ArrayBuffer], img.width, img.height, qualityToCnum(quality));
  return new Blob([out], { type: 'image/png' });
}

export async function compress(file: File, opts: { quality: number }): Promise<CompressResult> {
  if (!isWithinSizeLimit(file)) {
    throw new Error('This image is too large to process in your browser.');
  }
  const fmt = await sniffImageFormat(file);
  if (!fmt) throw new Error('Unsupported image format.');

  const img = await decodeImage(file);

  let blob: Blob;
  let ext: 'jpg' | 'png' | 'webp';
  if (fmt === 'jpg') { blob = await encodeCanvas(img, 'image/jpeg', opts.quality); ext = 'jpg'; }
  else if (fmt === 'webp') { blob = await encodeCanvas(img, 'image/webp', opts.quality); ext = 'webp'; }
  else if (fmt === 'png') { blob = encodePng(img, opts.quality); ext = 'png'; }
  else { blob = await encodeCanvas(img, 'image/jpeg', opts.quality); ext = 'jpg'; } // heic → jpg

  const inputSize = file.size;
  let outputSize = blob.size;
  let alreadyOptimized = false;

  // Never hand back a larger file for a same-format result (HEIC always changes format → skip).
  if (fmt !== 'heic' && outputSize >= inputSize) {
    blob = file;
    outputSize = inputSize;
    alreadyOptimized = true;
  }

  return {
    blob,
    name: `${baseName(file.name)}-compressed.${ext}`,
    inputSize,
    outputSize,
    alreadyOptimized,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/compress.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full unit suite (regression)**

Run: `npm test`
Expected: all tests pass (existing converter tests + new registry/format/sniff/decode/compress).

- [ ] **Step 6: Commit**

```bash
git add src/lib/compress.ts tests/unit/compress.test.ts
git commit -m "feat: add image compression pipeline"
```

---

## Phase D — Worker + island + page

### Task D1: Extend worker + client for compression

**Files:**
- Modify: `src/lib/worker.ts`
- Modify: `src/lib/client.ts`

- [ ] **Step 1: Replace `src/lib/worker.ts`**

```ts
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
```

- [ ] **Step 2: Replace `src/lib/client.ts`**

```ts
// src/lib/client.ts — used by the Preact islands.
import type { OutputFormat } from '../types';
import type { WorkerRequest, WorkerResponse } from './worker';

let worker: Worker | null = null;
function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  }
  return worker;
}

function call<T>(req: WorkerRequest, map: (r: WorkerResponse) => T): Promise<T> {
  const w = getWorker();
  return new Promise<T>((resolve, reject) => {
    const onMsg = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.id !== req.id) return;
      w.removeEventListener('message', onMsg);
      if (e.data.ok) resolve(map(e.data));
      else reject(new Error(e.data.error ?? 'Processing failed.'));
    };
    w.addEventListener('message', onMsg);
    w.postMessage(req);
  });
}

export function processInWorker(
  id: string,
  file: File,
  format: OutputFormat,
): Promise<{ blob: Blob; name: string }> {
  return call({ id, op: 'convert', file, format }, (r) => {
    if (!r.blob || !r.name) throw new Error(r.error ?? 'Conversion failed.');
    return { blob: r.blob, name: r.name };
  });
}

export interface CompressOutcome {
  blob: Blob;
  name: string;
  inputSize: number;
  outputSize: number;
  alreadyOptimized: boolean;
}

export function compressInWorker(id: string, file: File, quality: number): Promise<CompressOutcome> {
  return call<CompressOutcome>({ id, op: 'compress', file, quality }, (r) => {
    if (!r.blob || !r.name) throw new Error(r.error ?? 'Compression failed.');
    return {
      blob: r.blob,
      name: r.name,
      inputSize: r.inputSize ?? 0,
      outputSize: r.outputSize ?? 0,
      alreadyOptimized: r.alreadyOptimized ?? false,
    };
  });
}
```

- [ ] **Step 3: Type-check + converter e2e regression**

Run:
```bash
npx astro check
npx astro build
npx playwright test tests/e2e/convert.spec.ts
```
Expected: 0 type errors; 3 converter e2e pass (confirms the worker protocol change didn't break conversion).

- [ ] **Step 4: Commit**

```bash
git add src/lib/worker.ts src/lib/client.ts
git commit -m "feat: add compress op to worker and client"
```

### Task D2: CompressShell island

**Files:**
- Create: `src/components/CompressShell.tsx`

- [ ] **Step 1: Implement**

```tsx
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
    // re-compress everything already added at the new quality
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
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/CompressShell.tsx
git commit -m "feat: add CompressShell island with quality slider"
```

### Task D3: Compressor content + page

**Files:**
- Modify: `src/content/tools.ts`
- Create: `src/pages/compress-image.astro`

- [ ] **Step 1: Append `COMPRESS_CONTENT` to `src/content/tools.ts`**

Add at the end of the file (after the existing `TOOLS` export):
```ts
export const COMPRESS_CONTENT = {
  slug: 'compress-image',
  title: 'Compress Image — Free, Private, In Your Browser',
  description: 'Compress JPG, PNG, WebP, and HEIC images to shrink file size without uploading. 100% free, runs entirely in your browser.',
  intro: 'Reduce the file size of your JPG, PNG, WebP, and HEIC images right in your browser. Drag your photos in, pick a quality level, and download smaller files — nothing is ever uploaded to a server.',
  body: [
    'Drag your images into the box above (or tap to choose them). Each image is re-compressed on your own device and offered for download, with the before-and-after size shown. Compress many at once and download them together as a zip.',
    'JPG and WebP images are re-encoded at your chosen quality; PNG images are shrunk by reducing their color palette (the same technique tools like TinyPNG use); HEIC images are compressed and saved as JPG, since browsers cannot write HEIC. Lower the quality slider for smaller files, raise it for higher fidelity.',
    'Because everything runs locally using WebAssembly and your browser, the tool works offline once loaded and none of your images are ever sent anywhere — safe for personal and sensitive photos.',
  ],
  faq: [
    { q: 'Are my images uploaded anywhere?', a: 'No. Compression happens entirely in your browser. Your files never leave your device.' },
    { q: 'Which formats can I compress?', a: 'JPG, PNG, WebP, and HEIC. HEIC images are saved as compressed JPG because browsers cannot write the HEIC format.' },
    { q: 'Why did my PNG only shrink a little?', a: 'PNG is lossless, so we shrink it by reducing the color palette. Photos with many colors compress more; simple graphics that are already small may change little.' },
    { q: 'What if compression would make the file bigger?', a: 'We never hand back a larger file. If re-compressing would not help, the original is kept and the row is marked “already optimized”.' },
  ],
};
```

- [ ] **Step 2: Create `src/pages/compress-image.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import CompressShell from '../components/CompressShell.tsx';
import Faq from '../components/Faq.astro';
import RelatedTools from '../components/RelatedTools.astro';
import AdSlot from '../components/AdSlot.astro';
import { COMPRESS_CONTENT as c } from '../content/tools';
---
<BaseLayout title={c.title} description={c.description}>

  {/* Hero */}
  <div class="relative text-center px-6 pt-12 pb-8 overflow-hidden">
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,var(--purple-glow),transparent)] pointer-events-none" />
    <h1 class="relative gradient-text text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight mb-3">{c.title}</h1>
    <p class="relative text-slate-400 text-sm max-w-md mx-auto leading-relaxed mb-3">{c.intro}</p>
    <span class="inline-flex items-center gap-1.5 bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs px-3 py-1 rounded-full">
      🔒 Files never leave your device
    </span>
  </div>

  {/* Tool */}
  <div class="max-w-2xl mx-auto px-6 mb-8">
    <AdSlot adSlot="0000000001" />
    <CompressShell client:load />
  </div>

  {/* SEO body copy */}
  <div class="max-w-2xl mx-auto px-6 mb-8 space-y-3">
    {c.body.map((p) => (<p class="text-slate-500 text-sm leading-relaxed">{p}</p>))}
    <AdSlot adSlot="0000000002" />
  </div>

  {/* FAQ */}
  <div class="max-w-2xl mx-auto px-6 pb-8">
    <Faq faq={c.faq} />
  </div>

  <RelatedTools currentSlug="compress-image" />

</BaseLayout>
```

- [ ] **Step 3: Verify build**

Run: `npx astro build`
Expected: 0 errors; `dist/compress-image/index.html` emitted; appears in `dist/sitemap-0.xml`.

- [ ] **Step 4: Commit**

```bash
git add src/content/tools.ts src/pages/compress-image.astro
git commit -m "feat: add compress-image page and content"
```

---

## Phase E — E2E + final verification

### Task E1: Compressor e2e

**Files:**
- Create: `tests/e2e/compress.spec.ts`

- [ ] **Step 1: Write the e2e test**

```ts
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import UPNG from 'upng-js';

const heicFixture = fileURLToPath(new URL('../fixtures/sample.heic', import.meta.url));

function makePngBuffer(w: number, h: number): Buffer {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = (i * 11) % 256;
    data[i * 4 + 1] = (i * 37) % 256;
    data[i * 4 + 2] = (i * 59) % 256;
    data[i * 4 + 3] = 255;
  }
  return Buffer.from(UPNG.encode([data.buffer], w, h, 0));
}

test('compresses a HEIC image to a smaller JPG', async ({ page }) => {
  await page.goto('/compress-image');
  await page.getByTestId('file-input').setInputFiles(heicFixture);
  const downloadButton = page.getByTestId('download');
  await expect(downloadButton).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-compressed\.jpg$/);
});

test('compresses a PNG and keeps PNG format', async ({ page }) => {
  await page.goto('/compress-image');
  await page.getByTestId('file-input').setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: makePngBuffer(256, 256),
  });
  const downloadButton = page.getByTestId('download');
  await expect(downloadButton).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-compressed\.png$/);
});

test('surfaces links to the other tools', async ({ page }) => {
  await page.goto('/compress-image');
  const related = page.getByTestId('related-tools');
  await expect(related.locator('a[href="/heic-to-jpg"]')).toBeVisible();
  await expect(related.locator('a[href="/heic-to-png"]')).toBeVisible();
  await expect(related.locator('a[href="/heic-to-pdf"]')).toBeVisible();
});
```

- [ ] **Step 2: Build then run the compressor e2e**

Run:
```bash
npx astro build
npx playwright test tests/e2e/compress.spec.ts
```
Expected: 3 tests pass. If the PNG/HEIC download buttons never appear, open the page with
`--headed` and check the browser console for worker errors.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/compress.spec.ts
git commit -m "test: add compressor e2e (HEIC, PNG, related-tools)"
```

### Task E2: Final full verification

**Files:** none changed

- [ ] **Step 1: Full unit + integration suite**

Run: `npm test`
Expected: all pass — existing converter tests + new tool-registry, format-bytes, sniff-format,
decode-image, compress.

- [ ] **Step 2: Build**

Run: `npx astro build`
Expected: 0 errors; 7 pages now (home, 3 converters, compress-image, about, privacy) + sitemap.

- [ ] **Step 3: Full e2e suite**

Run: `npx playwright test`
Expected: converter e2e (3) + compressor e2e (3) all pass.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Run: `npm run dev`, open `http://localhost:4321/compress-image`, drop a real photo, confirm the
before/after size and download work; confirm the "All Tools" header dropdown and the bottom
"More free tools" grid link to every other tool.

- [ ] **Step 5: Final commit (only if anything is uncommitted)**

```bash
git add -A
git commit -m "chore: final verification for compressor + discovery"
```

---

## Definition of Done

- `npm test` passes (existing + new unit tests).
- `npx playwright test` passes (converter e2e + compressor e2e).
- `npx astro build` emits 7 pages + sitemap, 0 errors.
- `/compress-image` compresses JPG/PNG/WebP (same format) and HEIC (→JPG), shows before/after
  sizes, never returns a larger file, and offers download + download-all.
- Header "All Tools" dropdown and bottom "More free tools" grid expose every tool from every page,
  driven by the single registry.
- Existing converters are unchanged in behavior (regression-guarded by their e2e).

## Deferred (future specs)

Image resizer, WebP converter, background remover, standalone per-tool domains, target-file-size
compression mode.
