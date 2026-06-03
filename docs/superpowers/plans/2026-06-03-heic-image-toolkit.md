# Privacy-First Image Toolkit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully client-side, privacy-first HEIC image converter (anchor: HEIC→JPG, siblings: HEIC→PNG, HEIC→PDF) as an Astro static site, ready for AdSense and SEO.

**Architecture:** Astro ships static HTML per route for SEO; the converter runs as a Preact island. HEIC is decoded with the `libheif-js` WASM library inside a Web Worker, encoded to JPG/PNG via OffscreenCanvas and to PDF via `pdf-lib`. No file ever leaves the browser. The core library is split into pure, node-testable units (validate, filename, decode, transforms, zip, batch) with browser-only concerns (worker, UI, canvas encode) covered by Playwright.

**Tech Stack:** Astro, Preact, TypeScript, `libheif-js`, `pdf-lib`, `fflate`, Vitest (unit/integration), Playwright (e2e), Cloudflare Pages (hosting).

---

## File Structure

```
image-toolkit/
  package.json
  astro.config.mjs
  tsconfig.json
  vitest.config.ts
  playwright.config.ts
  src/
    types.ts                     # RawImage + BatchItem shared types
    layouts/BaseLayout.astro     # <html> shell, meta/OG, AdSense script slot
    components/
      ToolShell.tsx              # Preact island: dropzone, batch list, download-all
      ToolPage.astro             # wraps BaseLayout + content + <ToolShell> + FAQ schema
      AdSlot.astro               # one lazy AdSense unit
      Faq.astro                  # renders FAQ list + JSON-LD FAQPage schema
    lib/
      validate.ts                # isLikelyHeic, isWithinSizeLimit, MAX_BYTES
      filename.ts                # outputName(input, ext)
      decode.ts                  # decodeHeicBuffer(bytes) -> RawImage
      transforms.ts              # toJpeg/toPng/toPdf(RawImage) -> Blob (browser)
      zip.ts                     # zipBlobs(items) -> Blob
      batch.ts                   # processFile(file, format, deps) orchestration
      worker.ts                  # Web Worker entry: decode+encode off the UI thread
      client.ts                  # processInWorker(file, format) main-thread wrapper
    pages/
      index.astro
      heic-to-jpg.astro
      heic-to-png.astro
      heic-to-pdf.astro
      about.astro
      privacy.astro
    content/
      tools.ts                   # per-tool SEO copy + FAQ data (one object per tool)
  public/
    ads.txt                      # AdSense ads.txt (added at approval)
  tests/
    fixtures/sample.heic         # real iPhone HEIC sample (engineer supplies)
    unit/validate.test.ts
    unit/filename.test.ts
    unit/batch.test.ts
    unit/zip.test.ts
    integration/decode.test.ts   # real libheif decode of the fixture (node)
    e2e/convert.spec.ts          # Playwright: upload fixture -> download per format
```

**Responsibilities:** each `lib/*` file has one job and a serializable interface. `ToolShell` receives a `format: 'jpg'|'png'|'pdf'` string prop (islands only take serializable props) and looks up the transform internally. Tool pages are thin: layout + copy + the island.

---

## Phase 0 — Scaffold

### Task 0.1: Initialize Astro + Preact project

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`

- [ ] **Step 1: Scaffold Astro with the Preact integration**

Run (from `image-toolkit/`):
```bash
npm create astro@latest . -- --template minimal --no-install --no-git --typescript strict --yes
npx astro add preact --yes
npm install
```
Expected: `astro.config.mjs` now lists the Preact integration; `npm install` completes.

- [ ] **Step 2: Install runtime + dev dependencies**

Run:
```bash
npm install libheif-js pdf-lib fflate
npm install -D vitest @playwright/test
npx playwright install chromium
```
Expected: all install without error.

- [ ] **Step 3: Verify the dev server boots**

Run:
```bash
npx astro build
```
Expected: build succeeds with one default page.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Astro + Preact project with deps"
```

### Task 0.2: Configure Vitest and Playwright

**Files:**
- Create: `vitest.config.ts`, `playwright.config.ts`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
  },
});
```

- [ ] **Step 2: Write `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4321',
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: { baseURL: 'http://localhost:4321' },
});
```

- [ ] **Step 3: Add test scripts to `package.json`**

Add to the `"scripts"` block:
```json
"test": "vitest run",
"test:watch": "vitest",
"e2e": "playwright test",
"preview": "astro preview --port 4321"
```

- [ ] **Step 4: Verify the empty test runner works**

Run: `npm test`
Expected: vitest runs and reports "No test files found" (exit 0) — confirms config loads.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: configure vitest and playwright"
```

### Task 0.3: Add the HEIC test fixture

**Files:**
- Create: `tests/fixtures/sample.heic`

- [ ] **Step 1: Place a real HEIC sample**

Obtain a genuine iPhone HEIC photo (an actual `.HEIC` from an iPhone, or a known-good public sample such as those from the Nokia `heif` sample set) and save it as `tests/fixtures/sample.heic`. It MUST be a real HEIC — a renamed JPG will make decode tests pass falsely.

- [ ] **Step 2: Verify the file is real HEIC (magic bytes)**

Run:
```bash
node -e "const b=require('fs').readFileSync('tests/fixtures/sample.heic');console.log(b.slice(4,12).toString('latin1'))"
```
Expected: output contains `ftyp` followed by a brand like `heic`/`heix`/`mif1`/`heif`.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "test: add real HEIC fixture"
```

---

## Phase 1 — Core library (pure, TDD)

### Task 1.1: Shared types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write the types**

```ts
/** Decoded raw image: RGBA pixels, row-major. */
export interface RawImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // length === width * height * 4
}

export type OutputFormat = 'jpg' | 'png' | 'pdf';

export type BatchStatus = 'pending' | 'processing' | 'done' | 'error';

export interface BatchItem {
  id: string;
  file: File;
  status: BatchStatus;
  resultBlob?: Blob;
  resultName?: string;
  error?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared RawImage and BatchItem types"
```

### Task 1.2: Filename mapping

**Files:**
- Create: `src/lib/filename.ts`
- Test: `tests/unit/filename.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { outputName } from '../../src/lib/filename';

describe('outputName', () => {
  it('replaces a HEIC extension with the target extension', () => {
    expect(outputName('IMG_1234.HEIC', 'jpg')).toBe('IMG_1234.jpg');
  });
  it('handles lowercase .heic', () => {
    expect(outputName('photo.heic', 'png')).toBe('photo.png');
  });
  it('appends when there is no extension', () => {
    expect(outputName('photo', 'pdf')).toBe('photo.pdf');
  });
  it('only replaces the final extension', () => {
    expect(outputName('my.photo.heic', 'jpg')).toBe('my.photo.jpg');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/filename.test.ts`
Expected: FAIL — cannot find module `filename`.

- [ ] **Step 3: Implement**

```ts
import type { OutputFormat } from '../types';

export function outputName(input: string, ext: OutputFormat): string {
  const dot = input.lastIndexOf('.');
  const base = dot === -1 ? input : input.slice(0, dot);
  return `${base}.${ext}`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/filename.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/filename.ts tests/unit/filename.test.ts
git commit -m "feat: add output filename mapping"
```

### Task 1.3: File validation

**Files:**
- Create: `src/lib/validate.ts`
- Test: `tests/unit/validate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { isLikelyHeic, isWithinSizeLimit, MAX_BYTES } from '../../src/lib/validate';

function fileFromBytes(bytes: number[], name = 'x.heic', size?: number): File {
  const u8 = new Uint8Array(bytes);
  const f = new File([u8], name);
  if (size !== undefined) Object.defineProperty(f, 'size', { value: size });
  return f;
}

// ftyp box: 4 bytes size, "ftyp", then brand "heic"
const heicHeader = [0,0,0,0x18, 0x66,0x74,0x79,0x70, 0x68,0x65,0x69,0x63];

describe('isLikelyHeic', () => {
  it('accepts a buffer with an ftyp heic brand', async () => {
    expect(await isLikelyHeic(fileFromBytes(heicHeader))).toBe(true);
  });
  it('rejects a JPEG header', async () => {
    expect(await isLikelyHeic(fileFromBytes([0xFF,0xD8,0xFF,0xE0,0,0,0,0,0,0,0,0]))).toBe(false);
  });
});

describe('isWithinSizeLimit', () => {
  it('accepts files at or under the limit', () => {
    expect(isWithinSizeLimit(fileFromBytes(heicHeader, 'x.heic', MAX_BYTES))).toBe(true);
  });
  it('rejects files over the limit', () => {
    expect(isWithinSizeLimit(fileFromBytes(heicHeader, 'x.heic', MAX_BYTES + 1))).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: FAIL — cannot find module `validate`.

- [ ] **Step 3: Implement**

```ts
/** Max in-browser decode size; HEIC over this risks OOM on low-end devices. */
export const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1', 'heif'];

export async function isLikelyHeic(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  // bytes 4..8 must be "ftyp"
  const ftyp = String.fromCharCode(head[4], head[5], head[6], head[7]);
  if (ftyp !== 'ftyp') return false;
  const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
  return HEIC_BRANDS.includes(brand);
}

export function isWithinSizeLimit(file: File): boolean {
  return file.size <= MAX_BYTES;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/validate.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validate.ts tests/unit/validate.test.ts
git commit -m "feat: add HEIC magic-byte and size validation"
```

### Task 1.4: HEIC decode (real libheif, integration test)

**Files:**
- Create: `src/lib/decode.ts`
- Test: `tests/integration/decode.test.ts`

- [ ] **Step 1: Write the failing test (uses the real fixture)**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { decodeHeicBuffer } from '../../src/lib/decode';

describe('decodeHeicBuffer', () => {
  it('decodes the fixture into RGBA pixels', async () => {
    const bytes = new Uint8Array(readFileSync('tests/fixtures/sample.heic'));
    const img = await decodeHeicBuffer(bytes);
    expect(img.width).toBeGreaterThan(0);
    expect(img.height).toBeGreaterThan(0);
    expect(img.data.length).toBe(img.width * img.height * 4);
  }, 30_000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/integration/decode.test.ts`
Expected: FAIL — cannot find module `decode`.

- [ ] **Step 3: Implement using `libheif-js`**

```ts
import type { RawImage } from '../types';
// The wasm-bundle entry inlines the WASM and runs in both node and the browser.
import libheif from 'libheif-js/wasm-bundle';

export async function decodeHeicBuffer(bytes: Uint8Array): Promise<RawImage> {
  const decoder = new libheif.HeifDecoder();
  const images = decoder.decode(bytes);
  if (!images || images.length === 0) {
    throw new Error('No image found in HEIC data');
  }
  const image = images[0];
  const width = image.get_width();
  const height = image.get_height();
  const data = new Uint8ClampedArray(width * height * 4);
  await new Promise<void>((resolve, reject) => {
    image.display({ data, width, height }, (out: unknown) => {
      if (out) resolve();
      else reject(new Error('HEIC decode failed'));
    });
  });
  return { width, height, data };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/integration/decode.test.ts`
Expected: PASS. If it fails on the `wasm-bundle` import path, check the actual export with `node -e "console.log(Object.keys(require('libheif-js')))"` and adjust the import to the working entry; keep the function signature identical.

- [ ] **Step 5: Commit**

```bash
git add src/lib/decode.ts tests/integration/decode.test.ts
git commit -m "feat: decode HEIC buffers to RawImage via libheif"
```

### Task 1.5: Encoders (browser-only, covered by e2e later)

**Files:**
- Create: `src/lib/transforms.ts`

> Canvas/OffscreenCanvas is unavailable in node, so these are verified by the Playwright e2e in Task 4.x, not vitest. Implement them now so the worker can use them.

- [ ] **Step 1: Implement the three encoders**

```ts
import type { RawImage } from '../types';
import { PDFDocument } from 'pdf-lib';

function toCanvas(img: RawImage): OffscreenCanvas {
  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
  return canvas;
}

export async function toJpeg(img: RawImage, quality = 0.92): Promise<Blob> {
  return toCanvas(img).convertToBlob({ type: 'image/jpeg', quality });
}

export async function toPng(img: RawImage): Promise<Blob> {
  return toCanvas(img).convertToBlob({ type: 'image/png' });
}

export async function toPdf(img: RawImage): Promise<Blob> {
  // Embed a JPEG (smaller than PNG) of the image into a single-page PDF.
  const jpeg = await toJpeg(img);
  const jpegBytes = new Uint8Array(await jpeg.arrayBuffer());
  const pdf = await PDFDocument.create();
  const embedded = await pdf.embedJpg(jpegBytes);
  const page = pdf.addPage([img.width, img.height]);
  page.drawImage(embedded, { x: 0, y: 0, width: img.width, height: img.height });
  const out = await pdf.save();
  return new Blob([out], { type: 'application/pdf' });
}

export const ENCODERS: Record<'jpg' | 'png' | 'pdf', (img: RawImage) => Promise<Blob>> = {
  jpg: toJpeg,
  png: toPng,
  pdf: toPdf,
};
```

- [ ] **Step 2: Type-check**

Run: `npx astro check` (or `npx tsc --noEmit`)
Expected: no type errors in `transforms.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/transforms.ts
git commit -m "feat: add JPG/PNG/PDF encoders"
```

### Task 1.6: Zip bundling

**Files:**
- Create: `src/lib/zip.ts`
- Test: `tests/unit/zip.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { unzipSync, strToU8 } from 'fflate';
import { zipBlobs } from '../../src/lib/zip';

describe('zipBlobs', () => {
  it('produces a zip containing each named entry', async () => {
    const a = new Blob([strToU8('hello')], { type: 'text/plain' });
    const b = new Blob([strToU8('world')], { type: 'text/plain' });
    const zip = await zipBlobs([{ name: 'a.txt', blob: a }, { name: 'b.txt', blob: b }]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const entries = unzipSync(bytes);
    expect(Object.keys(entries).sort()).toEqual(['a.txt', 'b.txt']);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/zip.test.ts`
Expected: FAIL — cannot find module `zip`.

- [ ] **Step 3: Implement**

```ts
import { zipSync } from 'fflate';

export async function zipBlobs(items: { name: string; blob: Blob }[]): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  for (const { name, blob } of items) {
    entries[name] = new Uint8Array(await blob.arrayBuffer());
  }
  const zipped = zipSync(entries);
  return new Blob([zipped], { type: 'application/zip' });
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/zip.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/zip.ts tests/unit/zip.test.ts
git commit -m "feat: add client-side zip bundling"
```

### Task 1.7: Batch orchestration (dependency-injected, TDD)

**Files:**
- Create: `src/lib/batch.ts`
- Test: `tests/unit/batch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi } from 'vitest';
import { processFile } from '../../src/lib/batch';
import type { RawImage } from '../../src/types';

const fakeImg: RawImage = { width: 2, height: 2, data: new Uint8ClampedArray(16) };

function deps(over: Partial<Parameters<typeof processFile>[2]> = {}) {
  return {
    validateHeic: vi.fn().mockResolvedValue(true),
    validateSize: vi.fn().mockReturnValue(true),
    decode: vi.fn().mockResolvedValue(fakeImg),
    encoders: { jpg: vi.fn().mockResolvedValue(new Blob(['j'])) , png: vi.fn(), pdf: vi.fn() },
    ...over,
  } as Parameters<typeof processFile>[2];
}

const file = new File([new Uint8Array([1])], 'IMG_1.HEIC');

describe('processFile', () => {
  it('returns a blob and mapped name on success', async () => {
    const res = await processFile(file, 'jpg', deps());
    expect(res.name).toBe('IMG_1.jpg');
    expect(res.blob).toBeInstanceOf(Blob);
  });
  it('throws a friendly error when the file is not HEIC', async () => {
    const d = deps({ validateHeic: vi.fn().mockResolvedValue(false) });
    await expect(processFile(file, 'jpg', d)).rejects.toThrow(/not a valid HEIC/i);
  });
  it('throws a friendly error when the file is too large', async () => {
    const d = deps({ validateSize: vi.fn().mockReturnValue(false) });
    await expect(processFile(file, 'jpg', d)).rejects.toThrow(/too (big|large)/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/batch.test.ts`
Expected: FAIL — cannot find module `batch`.

- [ ] **Step 3: Implement**

```ts
import type { OutputFormat, RawImage } from '../types';
import { outputName } from './filename';

export interface ProcessDeps {
  validateHeic: (file: File) => Promise<boolean>;
  validateSize: (file: File) => boolean;
  decode: (bytes: Uint8Array) => Promise<RawImage>;
  encoders: Record<OutputFormat, (img: RawImage) => Promise<Blob>>;
}

export async function processFile(
  file: File,
  format: OutputFormat,
  deps: ProcessDeps,
): Promise<{ blob: Blob; name: string }> {
  if (!deps.validateSize(file)) {
    throw new Error('This image is too large to process in your browser.');
  }
  if (!(await deps.validateHeic(file))) {
    throw new Error('This file is not a valid HEIC image.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const img = await deps.decode(bytes);
  const blob = await deps.encoders[format](img);
  return { blob, name: outputName(file.name, format) };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/batch.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full unit + integration suite**

Run: `npm test`
Expected: all tests pass (filename, validate, zip, batch, decode).

- [ ] **Step 6: Commit**

```bash
git add src/lib/batch.ts tests/unit/batch.test.ts
git commit -m "feat: add batch processFile orchestration"
```

---

## Phase 2 — Worker + UI island

### Task 2.1: Web Worker + main-thread wrapper

**Files:**
- Create: `src/lib/worker.ts`, `src/lib/client.ts`

- [ ] **Step 1: Write the worker entry**

```ts
// src/lib/worker.ts — runs off the UI thread.
import type { OutputFormat } from '../types';
import { isLikelyHeic, isWithinSizeLimit } from './validate';
import { decodeHeicBuffer } from './decode';
import { ENCODERS } from './transforms';
import { processFile } from './batch';

export interface WorkerRequest { id: string; file: File; format: OutputFormat; }
export interface WorkerResponse {
  id: string;
  ok: boolean;
  blob?: Blob;
  name?: string;
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, file, format } = e.data;
  try {
    const { blob, name } = await processFile(file, format, {
      validateHeic: isLikelyHeic,
      validateSize: isWithinSizeLimit,
      decode: decodeHeicBuffer,
      encoders: ENCODERS,
    });
    (self as unknown as Worker).postMessage({ id, ok: true, blob, name } as WorkerResponse);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Conversion failed.';
    (self as unknown as Worker).postMessage({ id, ok: false, error } as WorkerResponse);
  }
};
```

- [ ] **Step 2: Write the main-thread wrapper**

```ts
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
```

- [ ] **Step 3: Type-check**

Run: `npx astro check`
Expected: no type errors in `worker.ts` / `client.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/worker.ts src/lib/client.ts
git commit -m "feat: add HEIC worker and main-thread wrapper"
```

### Task 2.2: ToolShell island

**Files:**
- Create: `src/components/ToolShell.tsx`

- [ ] **Step 1: Implement the island**

```tsx
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
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ToolShell.tsx
git commit -m "feat: add ToolShell converter island"
```

---

## Phase 3 — Pages, content & SEO

### Task 3.1: Base layout with SEO meta

**Files:**
- Create: `src/layouts/BaseLayout.astro`

- [ ] **Step 1: Implement the layout**

```astro
---
interface Props { title: string; description: string; canonical?: string; }
const { title, description, canonical } = Astro.props;
const site = 'https://REPLACE_WITH_DOMAIN'; // set at launch
const url = canonical ?? new URL(Astro.url.pathname, site).href;
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={url} />
    <meta property="og:title" content={title} />
    <meta property="og:description" content={description} />
    <meta property="og:type" content="website" />
    <meta property="og:url" content={url} />
    <!-- AdSense loader is injected in Task 4.1 -->
    <slot name="head" />
  </head>
  <body>
    <header><a href="/">HEIC Toolkit</a></header>
    <main><slot /></main>
    <footer>
      <nav>
        <a href="/heic-to-jpg">HEIC→JPG</a> ·
        <a href="/heic-to-png">HEIC→PNG</a> ·
        <a href="/heic-to-pdf">HEIC→PDF</a> ·
        <a href="/about">About</a> ·
        <a href="/privacy">Privacy</a>
      </nav>
      <p>All conversion happens in your browser. Your files are never uploaded.</p>
    </footer>
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat: add base layout with SEO meta"
```

### Task 3.2: Per-tool content data + FAQ component

**Files:**
- Create: `src/content/tools.ts`, `src/components/Faq.astro`

- [ ] **Step 1: Write the content data**

```ts
import type { OutputFormat } from '../types';

export interface ToolContent {
  slug: string;
  format: OutputFormat;
  title: string;        // <title> / H1
  description: string;  // meta description
  intro: string;        // ~120 words above the tool
  body: string[];       // paragraphs of how-to / why (renders below the tool)
  faq: { q: string; a: string }[];
}

export const TOOLS: Record<string, ToolContent> = {
  'heic-to-jpg': {
    slug: 'heic-to-jpg',
    format: 'jpg',
    title: 'HEIC to JPG Converter — Free, Private, In Your Browser',
    description: 'Convert HEIC photos from your iPhone to JPG instantly. 100% free, no upload — your images never leave your device.',
    intro: 'HEIC is the photo format iPhones use by default, but Windows, older Android phones, and many websites cannot open it. This free converter turns HEIC into universally supported JPG right inside your browser — your photos are never uploaded to a server.',
    body: [
      'To convert, drag your .HEIC files into the box above (or tap to choose them). Each file is decoded and re-saved as a JPG on your own device, then offered for download. You can convert many photos at once and download them together as a zip.',
      'Because everything runs locally using WebAssembly, the tool works even offline once loaded, and none of your photos are ever sent anywhere. That makes it safe for personal and sensitive images.',
      'JPG is the best choice when you want maximum compatibility and small file sizes for sharing or uploading. If you need lossless quality or transparency, use the HEIC to PNG converter instead; for documents, use HEIC to PDF.',
    ],
    faq: [
      { q: 'Are my photos uploaded anywhere?', a: 'No. Conversion happens entirely in your browser using WebAssembly. Your files never leave your device.' },
      { q: 'Why won’t my HEIC files open on Windows?', a: 'HEIC is an Apple-preferred format. Many Windows and Android apps lack a HEIC decoder, so converting to JPG makes the photos open everywhere.' },
      { q: 'Is there a limit on how many files I can convert?', a: 'You can convert many at once. Very large images (over 50 MB each) may be skipped to avoid running out of memory in the browser.' },
    ],
  },
  'heic-to-png': {
    slug: 'heic-to-png',
    format: 'png',
    title: 'HEIC to PNG Converter — Free, Private, In Your Browser',
    description: 'Convert iPhone HEIC photos to lossless PNG instantly. Free, no upload — files stay on your device.',
    intro: 'Convert HEIC images to PNG, a lossless format with wide support and transparency. Everything runs in your browser, so your photos are never uploaded.',
    body: [
      'Drag your .HEIC files into the box above to convert them to PNG on your own device, then download them individually or together as a zip.',
      'PNG preserves full image quality without compression artifacts, which is useful for editing or graphics. For smaller files better suited to sharing, convert to JPG instead.',
      'All processing happens locally with WebAssembly — no server, no upload, works offline once loaded.',
    ],
    faq: [
      { q: 'Does PNG keep full quality?', a: 'Yes. PNG is lossless, so the converted image keeps the full quality decoded from the HEIC.' },
      { q: 'Are my files uploaded?', a: 'No. Conversion runs entirely in your browser; your files never leave your device.' },
      { q: 'PNG or JPG — which should I pick?', a: 'Choose PNG for lossless quality or transparency; choose JPG for smaller files and easier sharing.' },
    ],
  },
  'heic-to-pdf': {
    slug: 'heic-to-pdf',
    format: 'pdf',
    title: 'HEIC to PDF Converter — Free, Private, In Your Browser',
    description: 'Turn iPhone HEIC photos into PDF documents instantly. Free, no upload — your images stay on your device.',
    intro: 'Convert HEIC photos into PDF documents, one page per image, entirely in your browser. Nothing is uploaded.',
    body: [
      'Drag your .HEIC files into the box above. Each photo becomes a single-page PDF on your device, ready to download or bundle together as a zip.',
      'PDF is ideal when you need to print, email, or submit a photo as a document. The image is embedded at full resolution.',
      'Processing is fully local using WebAssembly, so your images are never sent to a server and the tool works offline once loaded.',
    ],
    faq: [
      { q: 'Does each photo become its own PDF?', a: 'Yes. Each HEIC image is converted into its own single-page PDF; convert several and download them together as a zip.' },
      { q: 'Are my files uploaded?', a: 'No. Everything runs in your browser; your files never leave your device.' },
      { q: 'Will the PDF keep full image quality?', a: 'Yes. The photo is embedded into the PDF at its decoded resolution.' },
    ],
  },
};
```

- [ ] **Step 2: Write the FAQ component (with JSON-LD schema)**

```astro
---
interface Props { faq: { q: string; a: string }[]; }
const { faq } = Astro.props;
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map((f) => ({
    '@type': 'Question',
    name: f.q,
    acceptedAnswer: { '@type': 'Answer', text: f.a },
  })),
};
---
<section aria-labelledby="faq-heading">
  <h2 id="faq-heading">Frequently asked questions</h2>
  <dl>
    {faq.map((f) => (<><dt>{f.q}</dt><dd>{f.a}</dd></>))}
  </dl>
</section>
<script type="application/ld+json" set:html={JSON.stringify(jsonLd)} />
```

- [ ] **Step 3: Commit**

```bash
git add src/content/tools.ts src/components/Faq.astro
git commit -m "feat: add per-tool SEO content and FAQ schema component"
```

### Task 3.3: Reusable ToolPage + the three tool pages

**Files:**
- Create: `src/components/ToolPage.astro`, `src/pages/heic-to-jpg.astro`, `src/pages/heic-to-png.astro`, `src/pages/heic-to-pdf.astro`

- [ ] **Step 1: Write the shared ToolPage**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ToolShell from './ToolShell.tsx';
import Faq from './Faq.astro';
import type { ToolContent } from '../content/tools';
interface Props { tool: ToolContent; }
const { tool } = Astro.props;
---
<BaseLayout title={tool.title} description={tool.description}>
  <h1>{tool.title}</h1>
  <p>{tool.intro}</p>
  <ToolShell client:load format={tool.format} />
  {tool.body.map((p) => (<p>{p}</p>))}
  <Faq faq={tool.faq} />
</BaseLayout>
```

- [ ] **Step 2: Write the three page files**

`src/pages/heic-to-jpg.astro`:
```astro
---
import ToolPage from '../components/ToolPage.astro';
import { TOOLS } from '../content/tools';
---
<ToolPage tool={TOOLS['heic-to-jpg']} />
```

`src/pages/heic-to-png.astro`:
```astro
---
import ToolPage from '../components/ToolPage.astro';
import { TOOLS } from '../content/tools';
---
<ToolPage tool={TOOLS['heic-to-png']} />
```

`src/pages/heic-to-pdf.astro`:
```astro
---
import ToolPage from '../components/ToolPage.astro';
import { TOOLS } from '../content/tools';
---
<ToolPage tool={TOOLS['heic-to-pdf']} />
```

- [ ] **Step 3: Verify build**

Run: `npx astro build`
Expected: build emits `heic-to-jpg/index.html`, `heic-to-png/index.html`, `heic-to-pdf/index.html`.

- [ ] **Step 4: Commit**

```bash
git add src/components/ToolPage.astro src/pages/heic-to-jpg.astro src/pages/heic-to-png.astro src/pages/heic-to-pdf.astro
git commit -m "feat: add tool pages for jpg/png/pdf"
```

### Task 3.4: Home, About, Privacy pages

**Files:**
- Create: `src/pages/index.astro`, `src/pages/about.astro`, `src/pages/privacy.astro`

- [ ] **Step 1: Write `index.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout
  title="HEIC Toolkit — Free Private HEIC Converters"
  description="Convert iPhone HEIC photos to JPG, PNG, or PDF for free. 100% in your browser — your files are never uploaded."
>
  <h1>Free, private HEIC converters</h1>
  <p>Convert the HEIC photos your iPhone takes into formats that open everywhere. Every tool runs entirely in your browser — your images are never uploaded to a server.</p>
  <ul>
    <li><a href="/heic-to-jpg">HEIC to JPG</a> — best for sharing and compatibility</li>
    <li><a href="/heic-to-png">HEIC to PNG</a> — lossless quality</li>
    <li><a href="/heic-to-pdf">HEIC to PDF</a> — turn photos into documents</li>
  </ul>
</BaseLayout>
```

- [ ] **Step 2: Write `about.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="About — HEIC Toolkit" description="About the HEIC Toolkit: free, private, in-browser image conversion.">
  <h1>About HEIC Toolkit</h1>
  <p>HEIC Toolkit is a free set of tools for converting Apple’s HEIC photo format into JPG, PNG, and PDF. It exists because HEIC files often won’t open on Windows, older Android devices, or many websites.</p>
  <p>Unlike most online converters, this site never uploads your files. All conversion runs locally in your browser using WebAssembly, so your photos stay on your device and the tools work offline once loaded.</p>
</BaseLayout>
```

- [ ] **Step 3: Write `privacy.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="Privacy Policy — HEIC Toolkit" description="Privacy policy for HEIC Toolkit. Files are processed locally and never uploaded.">
  <h1>Privacy Policy</h1>
  <p><strong>Your files never leave your device.</strong> All image conversion happens locally in your browser. We do not upload, store, or transmit the images you convert.</p>
  <h2>Analytics and advertising</h2>
  <p>This site may use Google AdSense to display ads. Google and its partners may use cookies to serve ads based on your prior visits to this and other websites. You can opt out of personalized advertising via Google’s Ads Settings.</p>
  <h2>Contact</h2>
  <p>For questions about this policy, contact REPLACE_WITH_EMAIL.</p>
</BaseLayout>
```

- [ ] **Step 4: Verify build & commit**

Run: `npx astro build`
Expected: home, about, privacy emit HTML.
```bash
git add src/pages/index.astro src/pages/about.astro src/pages/privacy.astro
git commit -m "feat: add home, about, and privacy pages"
```

### Task 3.5: Sitemap

**Files:**
- Modify: `astro.config.mjs`

- [ ] **Step 1: Add the sitemap integration**

Run: `npx astro add sitemap --yes`

- [ ] **Step 2: Set the `site` URL in `astro.config.mjs`**

Edit `astro.config.mjs` so the config object includes:
```js
site: 'https://REPLACE_WITH_DOMAIN',
```
(The sitemap integration requires `site` to emit URLs. Replace at launch.)

- [ ] **Step 3: Verify build emits a sitemap**

Run: `npx astro build`
Expected: `dist/sitemap-index.xml` exists.

- [ ] **Step 4: Commit**

```bash
git add astro.config.mjs package.json
git commit -m "feat: add sitemap generation"
```

---

## Phase 4 — Ads, e2e, deploy

### Task 4.1: AdSlot component + loader (gated, off until approval)

**Files:**
- Create: `src/components/AdSlot.astro`
- Modify: `src/layouts/BaseLayout.astro`

- [ ] **Step 1: Write `AdSlot.astro`**

```astro
---
interface Props { slot: string; }
const { slot } = Astro.props;
const client = import.meta.env.PUBLIC_ADSENSE_CLIENT; // e.g. "ca-pub-XXXX"; unset until approved
---
{client && (
  <ins
    class="adsbygoogle"
    style="display:block"
    data-ad-client={client}
    data-ad-slot={slot}
    data-ad-format="auto"
    data-full-width-responsive="true"
  />
  <script is:inline>(adsbygoogle = window.adsbygoogle || []).push({});</script>
)}
```

- [ ] **Step 2: Inject the AdSense loader in `BaseLayout.astro` head**

Add inside `<head>` (after the canonical link):
```astro
{import.meta.env.PUBLIC_ADSENSE_CLIENT && (
  <script
    async
    src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${import.meta.env.PUBLIC_ADSENSE_CLIENT}`}
    crossorigin="anonymous"
  />
)}
```

- [ ] **Step 3: Place ad slots in `ToolPage.astro`**

In `src/components/ToolPage.astro`, import and render `AdSlot` once after `{tool.intro}` and once after the `body` paragraphs:
```astro
import AdSlot from './AdSlot.astro';
...
<AdSlot slot="0000000001" />   <!-- above-the-fold, after intro -->
...
<AdSlot slot="0000000002" />   <!-- in-content, after body -->
```
(Real slot IDs are filled in from the AdSense dashboard at approval. With `PUBLIC_ADSENSE_CLIENT` unset, AdSlot renders nothing, so the site stays clean pre-approval.)

- [ ] **Step 4: Verify build still succeeds with ads disabled**

Run: `npx astro build`
Expected: build succeeds; output HTML contains no `adsbygoogle` markup (client unset).

- [ ] **Step 5: Commit**

```bash
git add src/components/AdSlot.astro src/layouts/BaseLayout.astro src/components/ToolPage.astro
git commit -m "feat: add gated AdSense slots (disabled until approval)"
```

### Task 4.2: End-to-end conversion test

**Files:**
- Create: `tests/e2e/convert.spec.ts`

- [ ] **Step 1: Write the e2e test**

```ts
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../fixtures/sample.heic', import.meta.url));

for (const { path, ext } of [
  { path: '/heic-to-jpg', ext: 'jpg' },
  { path: '/heic-to-png', ext: 'png' },
  { path: '/heic-to-pdf', ext: 'pdf' },
]) {
  test(`converts HEIC on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.getByTestId('file-input').setInputFiles(fixture);
    const downloadButton = page.getByTestId('download');
    await expect(downloadButton).toBeVisible({ timeout: 30_000 });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadButton.click(),
    ]);
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${ext}$`));
  });
}
```

- [ ] **Step 2: Build, then run e2e**

Run:
```bash
npx astro build
npx playwright test
```
Expected: 3 tests pass (jpg, png, pdf) — the fixture is decoded and a correctly-named file downloads. If the worker fails to load WASM under the static preview, confirm `astro build` inlined the worker; the `wasm-bundle` import keeps WASM inline so no extra asset config is needed.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/convert.spec.ts
git commit -m "test: add end-to-end conversion e2e for all three formats"
```

### Task 4.3: Cloudflare Pages deploy config + manual cross-browser checklist

**Files:**
- Create: `public/_headers`, `README.md`

- [ ] **Step 1: Add cross-origin isolation headers (`public/_headers`)**

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```
(These enable best WASM performance and are harmless for a client-side app. If AdSense scripts are later blocked by COEP, relax `Cross-Origin-Embedder-Policy` to `credentialless` or remove it.)

- [ ] **Step 2: Document deploy + manual test matrix in `README.md`**

```markdown
# HEIC Toolkit

Fully client-side HEIC → JPG/PNG/PDF converter. No uploads.

## Develop
- `npm run dev` — dev server
- `npm test` — unit + integration (Vitest)
- `npm run e2e` — Playwright end-to-end

## Deploy (Cloudflare Pages)
1. Push this repo to GitHub.
2. In Cloudflare Pages: create project from the repo.
3. Build command: `npm run build`; output dir: `dist`.
4. Set `site` in `astro.config.mjs` and the domain to your real domain.
5. (At AdSense approval) set the `PUBLIC_ADSENSE_CLIENT` env var and real slot IDs; add `public/ads.txt`.

## Manual cross-browser checklist (run before launch)
- [ ] Chrome (Windows): convert single + batch, download zip
- [ ] Firefox: same
- [ ] Safari (macOS/iOS): same — confirm conversion works
- [ ] A corrupt/renamed file shows a per-file error without breaking the batch
- [ ] A >50 MB file shows the size error
```

- [ ] **Step 3: Final full verification**

Run:
```bash
npm test
npx astro build
npx playwright test
```
Expected: all unit/integration pass; build succeeds; all e2e pass.

- [ ] **Step 4: Commit**

```bash
git add public/_headers README.md
git commit -m "chore: add deploy headers and README with test matrix"
```

---

## Definition of Done

- All Vitest unit + integration tests pass (`npm test`).
- All Playwright e2e pass for jpg/png/pdf (`npm run e2e`).
- `npx astro build` emits static HTML for all 6 pages + sitemap.
- Site has home, about, privacy + three tool pages with FAQ schema (AdSense-approvable).
- Ads are gated behind `PUBLIC_ADSENSE_CLIENT` and off until approval.
- Manual cross-browser checklist completed before launch.

## Deferred (post-v1, not in this plan)

Background remover, format-converter hub, image compressor/resizer, Safari native-decode fast-path optimization, user accounts, anything server-side.
