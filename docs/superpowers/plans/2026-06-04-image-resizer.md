# Image Resizer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-first image resizer (`/resize-image`, JPG/PNG/WebP/HEIC) that changes image dimensions in the browser, reusing the existing tool architecture.

**Architecture:** A pure `computeTargetDimensions()` function (node-tested) holds the aspect-lock math; `resize()` wires it to the existing `decodeImage()` and an OffscreenCanvas re-draw. A new `resize` op on the existing worker runs it off the UI thread; a `ResizeShell` island mirrors `CompressShell` but with width/height/lock controls. A registry entry auto-wires nav, homepage, and sitemap.

**Tech Stack:** Astro, Preact, TypeScript, OffscreenCanvas, existing `decodeImage`, Vitest, Playwright. No new dependency.

---

## File Structure

```
src/
  lib/
    resize-dimensions.ts   ← NEW: pure computeTargetDimensions() (aspect-lock math)
    resize.ts              ← NEW: resize pipeline (decodeImage → canvas → encode)
    worker.ts              ← MODIFY: add 'resize' op
    client.ts              ← MODIFY: add resizeInWorker + ResizeOutcome
  components/
    ResizeShell.tsx        ← NEW: resizer island (Dropzone + W/H inputs + lock + BatchList)
  pages/
    resize-image.astro     ← NEW: resizer page
  content/
    tools.ts               ← MODIFY: add RESIZE_CONTENT
    tool-registry.ts       ← MODIFY: add resize-image entry
tests/
  unit/resize-dimensions.test.ts  ← NEW
  e2e/resize.spec.ts              ← NEW
```

**Reused unchanged:** `decodeImage`, `Dropzone`, `BatchList` (`BatchRow`), `download.ts`,
`format-bytes.ts`, `validate.ts` (`sniffImageFormat`, `isWithinSizeLimit`), `RelatedTools.astro`,
`Faq.astro`, `AdSlot.astro`, the worker `call()` helper.

---

## Task 1: Pure dimension math (TDD)

**Files:**
- Create: `src/lib/resize-dimensions.ts`
- Test: `tests/unit/resize-dimensions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { computeTargetDimensions } from '../../src/lib/resize-dimensions';

describe('computeTargetDimensions', () => {
  it('lock on, width given → height scales proportionally', () => {
    expect(computeTargetDimensions(1600, 1200, { width: 800, height: null, lockAspect: true }))
      .toEqual({ width: 800, height: 600 });
  });
  it('lock on, height given → width scales proportionally', () => {
    expect(computeTargetDimensions(1600, 1200, { width: null, height: 600, lockAspect: true }))
      .toEqual({ width: 800, height: 600 });
  });
  it('lock on, both given → width wins, height recomputed', () => {
    expect(computeTargetDimensions(1600, 1200, { width: 800, height: 999, lockAspect: true }))
      .toEqual({ width: 800, height: 600 });
  });
  it('lock off, both given → exact dimensions (may distort)', () => {
    expect(computeTargetDimensions(1600, 1200, { width: 800, height: 400, lockAspect: false }))
      .toEqual({ width: 800, height: 400 });
  });
  it('rounds proportional dimension to nearest integer', () => {
    expect(computeTargetDimensions(1000, 333, { width: 100, height: null, lockAspect: true }))
      .toEqual({ width: 100, height: 33 });
  });
  it('throws when locked and no dimension given', () => {
    expect(() => computeTargetDimensions(800, 600, { width: null, height: null, lockAspect: true }))
      .toThrow(/enter a width or height/i);
  });
  it('throws when unlocked and a dimension is missing', () => {
    expect(() => computeTargetDimensions(800, 600, { width: 800, height: null, lockAspect: false }))
      .toThrow(/both/i);
  });
  it('throws when target is out of range', () => {
    expect(() => computeTargetDimensions(800, 600, { width: 30000, height: null, lockAspect: true }))
      .toThrow(/out of range/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/resize-dimensions.test.ts`
Expected: FAIL — cannot find module `resize-dimensions`.

- [ ] **Step 3: Implement `src/lib/resize-dimensions.ts`**

```ts
export interface ResizeOpts {
  width: number | null;   // requested width in px, or null when blank
  height: number | null;  // requested height in px, or null when blank
  lockAspect: boolean;
}

export function computeTargetDimensions(
  origW: number,
  origH: number,
  opts: ResizeOpts,
): { width: number; height: number } {
  const w = opts.width && opts.width > 0 ? opts.width : 0;
  const h = opts.height && opts.height > 0 ? opts.height : 0;

  let tw: number;
  let th: number;
  if (opts.lockAspect) {
    if (w > 0) {
      tw = w;
      th = Math.round(origH * (w / origW));
    } else if (h > 0) {
      th = h;
      tw = Math.round(origW * (h / origH));
    } else {
      throw new Error('Enter a width or height.');
    }
  } else {
    if (w > 0 && h > 0) {
      tw = w;
      th = h;
    } else {
      throw new Error('Enter both a width and height.');
    }
  }

  if (tw < 1 || th < 1 || tw > 20000 || th > 20000) {
    throw new Error('Target size is out of range.');
  }
  return { width: tw, height: th };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/resize-dimensions.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/resize-dimensions.ts tests/unit/resize-dimensions.test.ts
git commit -m "feat: add pure resize dimension math"
```

---

## Task 2: Resize pipeline

**Files:**
- Create: `src/lib/resize.ts`

> Uses OffscreenCanvas (browser-only) so there is no node unit test; the canvas path is covered by
> the Playwright e2e in Task 6. The dimension math it depends on is already unit-tested (Task 1).

- [ ] **Step 1: Implement `src/lib/resize.ts`**

```ts
import type { RawImage } from '../types';
import { sniffImageFormat, isWithinSizeLimit } from './validate';
import { decodeImage } from './decode-image';
import { computeTargetDimensions } from './resize-dimensions';
import type { ResizeOpts } from './resize-dimensions';

export interface ResizeResult {
  blob: Blob;
  name: string;
  inputW: number;
  inputH: number;
  outputW: number;
  outputH: number;
}

function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
}

function drawScaled(img: RawImage, tw: number, th: number): OffscreenCanvas {
  const source = new OffscreenCanvas(img.width, img.height);
  const sctx = source.getContext('2d');
  if (!sctx) throw new Error('Canvas 2D context unavailable');
  const pixels = new Uint8ClampedArray(img.data.length);
  pixels.set(img.data);
  sctx.putImageData(new ImageData(pixels, img.width, img.height), 0, 0);

  const target = new OffscreenCanvas(tw, th);
  const tctx = target.getContext('2d');
  if (!tctx) throw new Error('Canvas 2D context unavailable');
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(source, 0, 0, tw, th);
  return target;
}

export async function resize(file: File, opts: ResizeOpts): Promise<ResizeResult> {
  if (!isWithinSizeLimit(file)) {
    throw new Error('This image is too large to process in your browser.');
  }
  const fmt = await sniffImageFormat(file);
  if (!fmt) throw new Error('Unsupported image format.');

  const img = await decodeImage(file);
  const { width: tw, height: th } = computeTargetDimensions(img.width, img.height, opts);
  const canvas = drawScaled(img, tw, th);

  let type: 'image/jpeg' | 'image/png' | 'image/webp';
  let ext: 'jpg' | 'png' | 'webp';
  if (fmt === 'png') { type = 'image/png'; ext = 'png'; }
  else if (fmt === 'webp') { type = 'image/webp'; ext = 'webp'; }
  else { type = 'image/jpeg'; ext = 'jpg'; } // jpg and heic both output jpg

  const blob = type === 'image/png'
    ? await canvas.convertToBlob({ type })
    : await canvas.convertToBlob({ type, quality: 0.92 });

  return {
    blob,
    name: `${baseName(file.name)}-${tw}x${th}.${ext}`,
    inputW: img.width,
    inputH: img.height,
    outputW: tw,
    outputH: th,
  };
}
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/resize.ts
git commit -m "feat: add image resize pipeline"
```

---

## Task 3: Worker + client resize op

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
import { resize } from './resize';
import type { ResizeOpts } from './resize-dimensions';

export type WorkerRequest =
  | { id: string; op: 'convert'; file: File; format: OutputFormat }
  | { id: string; op: 'compress'; file: File; quality: number }
  | { id: string; op: 'resize'; file: File; opts: ResizeOpts };

export interface WorkerResponse {
  id: string;
  ok: boolean;
  blob?: Blob;
  name?: string;
  inputSize?: number;
  outputSize?: number;
  alreadyOptimized?: boolean;
  inputW?: number;
  inputH?: number;
  outputW?: number;
  outputH?: number;
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
    } else if (req.op === 'compress') {
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
    } else {
      const r = await resize(req.file, req.opts);
      (self as unknown as Worker).postMessage({
        id: req.id,
        ok: true,
        blob: r.blob,
        name: r.name,
        inputW: r.inputW,
        inputH: r.inputH,
        outputW: r.outputW,
        outputH: r.outputH,
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
import type { ResizeOpts } from './resize-dimensions';

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

export interface ResizeOutcome {
  blob: Blob;
  name: string;
  inputW: number;
  inputH: number;
  outputW: number;
  outputH: number;
}

export function resizeInWorker(id: string, file: File, opts: ResizeOpts): Promise<ResizeOutcome> {
  return call<ResizeOutcome>({ id, op: 'resize', file, opts }, (r) => {
    if (!r.blob || !r.name) throw new Error(r.error ?? 'Resize failed.');
    return {
      blob: r.blob,
      name: r.name,
      inputW: r.inputW ?? 0,
      inputH: r.inputH ?? 0,
      outputW: r.outputW ?? 0,
      outputH: r.outputH ?? 0,
    };
  });
}
```

- [ ] **Step 3: Type-check, build, regression e2e**

Run:
```bash
npx astro check
npx astro build
npx kill-port 4321
npx playwright test tests/e2e/convert.spec.ts tests/e2e/compress.spec.ts
```
Expected: 0 type errors; build passes; existing converter (3) + compressor (3) e2e all pass —
confirming the new `resize` op did not break the existing worker arms.

- [ ] **Step 4: Commit**

```bash
git add src/lib/worker.ts src/lib/client.ts
git commit -m "feat: add resize op to worker and client"
```

---

## Task 4: ResizeShell island

**Files:**
- Create: `src/components/ResizeShell.tsx`

- [ ] **Step 1: Implement `src/components/ResizeShell.tsx`**

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ResizeShell.tsx
git commit -m "feat: add ResizeShell island with width/height/lock controls"
```

---

## Task 5: Content, registry entry, and page

**Files:**
- Modify: `src/content/tools.ts`
- Modify: `src/content/tool-registry.ts`
- Create: `src/pages/resize-image.astro`

- [ ] **Step 1: Append `RESIZE_CONTENT` to `src/content/tools.ts`**

Add at the end of the file (after the existing `COMPRESS_CONTENT` export):
```ts
export const RESIZE_CONTENT = {
  slug: 'resize-image',
  title: 'Resize Image — Free, Private, In Your Browser',
  description: 'Resize JPG, PNG, WebP, and HEIC images to exact pixel dimensions without uploading. 100% free, runs entirely in your browser.',
  intro: 'Change the width and height of your JPG, PNG, WebP, and HEIC images right in your browser. Set a target size, keep the aspect ratio locked or free, and download — nothing is ever uploaded to a server.',
  body: [
    'Drag your images into the box above (or tap to choose them). Enter a width or height in pixels; with aspect ratio locked, each image keeps its proportions, so a whole batch can be resized to the same width at once. Turn the lock off to set an exact width and height.',
    'Each resized image shows its old and new dimensions and is offered for download. Resize many at once and download them together as a zip. HEIC images are saved as JPG, since browsers cannot write the HEIC format.',
    'Because everything runs locally in your browser, the tool works offline once loaded and none of your images are ever sent anywhere — safe for personal and sensitive photos.',
  ],
  faq: [
    { q: 'Are my images uploaded anywhere?', a: 'No. Resizing happens entirely in your browser. Your files never leave your device.' },
    { q: 'Which formats can I resize?', a: 'JPG, PNG, WebP, and HEIC. HEIC images are saved as JPG because browsers cannot write the HEIC format.' },
    { q: 'How do I keep the aspect ratio?', a: 'Leave “Lock aspect ratio” on and set just one dimension — the other is calculated automatically so the image is not stretched.' },
    { q: 'Can I make an image larger?', a: 'Yes. You can enlarge as well as shrink, though enlarging cannot add detail that was not in the original.' },
  ],
};
```

- [ ] **Step 2: Add the registry entry in `src/content/tool-registry.ts`**

The current array ends with the `compress-image` entry. Insert the resize entry **before**
`compress-image` so the order is the three converters, then Resize, then Compress:
```ts
  { slug: 'resize-image', href: '/resize-image', name: 'Resize Image', shortName: 'Resize', icon: '📐', blurb: 'Change image dimensions — JPG, PNG, WebP & HEIC.' },
```
The full array becomes:
```ts
export const TOOL_REGISTRY: ToolEntry[] = [
  { slug: 'heic-to-jpg', href: '/heic-to-jpg', name: 'HEIC to JPG', shortName: 'HEIC→JPG', icon: '🖼', blurb: 'Convert iPhone HEIC photos to JPG.' },
  { slug: 'heic-to-png', href: '/heic-to-png', name: 'HEIC to PNG', shortName: 'HEIC→PNG', icon: '🎨', blurb: 'Convert HEIC to lossless PNG.' },
  { slug: 'heic-to-pdf', href: '/heic-to-pdf', name: 'HEIC to PDF', shortName: 'HEIC→PDF', icon: '📄', blurb: 'Turn HEIC photos into PDF documents.' },
  { slug: 'resize-image', href: '/resize-image', name: 'Resize Image', shortName: 'Resize', icon: '📐', blurb: 'Change image dimensions — JPG, PNG, WebP & HEIC.' },
  { slug: 'compress-image', href: '/compress-image', name: 'Compress Image', shortName: 'Compress', icon: '🗜', blurb: 'Shrink JPG, PNG, WebP & HEIC file sizes.' },
];
```

- [ ] **Step 3: Create `src/pages/resize-image.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ResizeShell from '../components/ResizeShell.tsx';
import Faq from '../components/Faq.astro';
import RelatedTools from '../components/RelatedTools.astro';
import AdSlot from '../components/AdSlot.astro';
import { RESIZE_CONTENT as c } from '../content/tools';
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
    <ResizeShell client:load />
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

  <RelatedTools currentSlug="resize-image" />

</BaseLayout>
```

- [ ] **Step 4: Verify build + sitemap + registry test**

Run:
```bash
npx vitest run tests/unit/tool-registry.test.ts
npx astro build
node -e "const fs=require('fs');const s=fs.readFileSync('dist/sitemap-0.xml','utf8');console.log('resize-image in sitemap:', s.includes('resize-image'));"
```
Expected: registry test passes; build emits **9 pages** (home, 3 converters, compress-image,
resize-image, about, privacy, contact); `resize-image in sitemap: true`.

- [ ] **Step 5: Commit**

```bash
git add src/content/tools.ts src/content/tool-registry.ts src/pages/resize-image.astro
git commit -m "feat: add resize-image page, content, and registry entry"
```

---

## Task 6: E2E + final verification

**Files:**
- Create: `tests/e2e/resize.spec.ts`

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

test('resizes a HEIC image to 800px wide as JPG', async ({ page }) => {
  await page.goto('/resize-image');
  // default width is 800, lock on → sample.heic (4032x3024) → 800x600
  await page.getByTestId('file-input').setInputFiles(heicFixture);
  const downloadButton = page.getByTestId('download');
  await expect(downloadButton).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-800x600\.jpg$/);
});

test('resizes a square PNG and keeps PNG format', async ({ page }) => {
  await page.goto('/resize-image');
  await page.getByTestId('file-input').setInputFiles({
    name: 'square.png',
    mimeType: 'image/png',
    buffer: makePngBuffer(256, 256),
  });
  const downloadButton = page.getByTestId('download');
  await expect(downloadButton).toBeVisible({ timeout: 30_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);
  // 256x256 → width 800 lock on → 800x800
  expect(download.suggestedFilename()).toMatch(/-800x800\.png$/);
});

test('surfaces links to the other tools', async ({ page }) => {
  await page.goto('/resize-image');
  const related = page.getByTestId('related-tools');
  await expect(related.locator('a[href="/compress-image"]')).toBeVisible();
  await expect(related.locator('a[href="/heic-to-jpg"]')).toBeVisible();
});
```

- [ ] **Step 2: Build then run the resize e2e**

Run:
```bash
npx astro build
npx kill-port 4321
npx playwright test tests/e2e/resize.spec.ts
```
Expected: 3 tests pass. If the download button never appears, run with `--headed` and check the
browser console for worker errors.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/resize.spec.ts
git commit -m "test: add resizer e2e (HEIC, PNG, related-tools)"
```

- [ ] **Step 4: Final full verification**

Run:
```bash
npm test
npx astro build
npx kill-port 4321
npx playwright test
```
Expected: all unit tests pass (including the 8 new `computeTargetDimensions` tests); build emits 9
pages + sitemap; full e2e suite passes — convert (3) + compress (3) + resize (3) = 9.

- [ ] **Step 5: Final commit (only if anything is uncommitted)**

```bash
git add -A
git commit -m "chore: final verification for image resizer"
```

---

## Definition of Done

- `npm test` passes, including the new `computeTargetDimensions` unit tests.
- `npx playwright test` passes all 9 e2e (convert + compress + resize).
- `npx astro build` emits 9 pages + sitemap, 0 errors.
- `/resize-image` resizes JPG/PNG/WebP (same format) and HEIC (→JPG), honoring aspect lock, showing
  old→new dimensions, and offering download + download-all.
- The resizer appears in the header dropdown, bottom related-tools grid, homepage, and sitemap.
- Existing converter and compressor tools are unchanged in behavior (regression-gated by their e2e).

## Deferred (future specs)

Percentage-scale mode, size presets, format-converter hub, background remover, per-image individual
dimension controls.
