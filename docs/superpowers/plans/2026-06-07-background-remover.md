# Background Remover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-first background remover (`/remove-background`) that erases image backgrounds entirely in the browser and outputs a transparent PNG, reusing the existing tool architecture.

**Architecture:** Two pure, node-tested functions (`preprocess`, `maskToAlpha`) hold the tensor/mask math. A lazily-loaded onnxruntime-web session runs the u2netp model. A `removeBackground()` pipeline wires decode → preprocess → inference → composite → PNG. A new `remove-bg` worker op **dynamically imports** that pipeline so onnxruntime-web only loads on this route. A `RemoveBgShell` island mirrors the other shells, adds a one-time model-load notice, and shows a checkerboard preview per result. A registry entry auto-wires nav, homepage, sitemap, and schema.

**Tech Stack:** Astro, Preact, TypeScript, **onnxruntime-web** (MIT), **u2netp** ONNX model (U²-Net small, Apache-2.0, ~4.7 MB, self-hosted), OffscreenCanvas, Vitest, Playwright.

---

## File Structure

```
scripts/
  copy-ort-wasm.mjs        ← NEW: copies onnxruntime-web wasm/mjs into public/ort/
public/
  models/u2netp.onnx       ← NEW: Apache-2.0 model asset (~4.7 MB)
  models/U2NET-CREDITS.txt ← NEW: Apache-2.0 attribution
  ort/*.wasm, *.mjs        ← NEW: self-hosted onnxruntime-web runtime
src/
  lib/
    segment-constants.ts   ← NEW: input size, mean/std, asset paths
    segment-pre.ts         ← NEW: pure preprocess (resize+normalize+pack)
    segment-post.ts        ← NEW: pure postprocess (mask→alpha composite)
    onnx-session.ts        ← NEW: lazy onnxruntime-web session + runSegmentation()
    remove-background.ts   ← NEW: pipeline (decode→infer→composite→PNG)
    worker.ts              ← MODIFY: add 'remove-bg' op (dynamic import)
    client.ts              ← MODIFY: add removeBackgroundInWorker + RemoveBgOutcome
  components/
    BatchList.tsx          ← MODIFY: add optional previewUrl slot
    RemoveBgShell.tsx      ← NEW: island (Dropzone + model-load notice + previews)
  pages/
    remove-background.astro ← NEW: page
  content/
    tools.ts               ← MODIFY: add REMOVE_BG_CONTENT
    tool-registry.ts       ← MODIFY: add remove-background entry
tests/
  unit/segment-pre.test.ts   ← NEW
  unit/segment-post.test.ts  ← NEW
  e2e/remove-background.spec.ts ← NEW
package.json               ← MODIFY: add onnxruntime-web + sync-ort script
```

**Reused unchanged:** `decodeImage`, `Dropzone`, `download.ts`, `format-bytes.ts`,
`validate.ts` (`sniffImageFormat`, `isWithinSizeLimit`), `RelatedTools.astro`, `Faq.astro`,
`AdSlot.astro`, `ToolSchema.astro`, the worker `call()` helper.

---

## Task 1: Dependency, model, and runtime assets

**Files:**
- Modify: `package.json`
- Create: `scripts/copy-ort-wasm.mjs`
- Create: `public/models/u2netp.onnx`, `public/models/U2NET-CREDITS.txt`
- Create: `public/ort/` (populated by the script)
- Create: `src/lib/segment-constants.ts`

> This task has no unit test — it is setup. The model is exercised end-to-end by the Playwright e2e
> in Task 10, which is the real verification that the runtime + model load and run.

- [ ] **Step 1: Install onnxruntime-web**

Run:
```bash
npm install onnxruntime-web
```
Expected: package added to `dependencies`.

- [ ] **Step 2: Add the ort-wasm copy script**

Create `scripts/copy-ort-wasm.mjs`:
```js
// Copies onnxruntime-web's runtime files into public/ort/ so they are served
// from our own origin (no third-party CDN). Re-run after upgrading onnxruntime-web.
import { mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, '..', 'node_modules', 'onnxruntime-web', 'dist');
const dest = join(root, '..', 'public', 'ort');
mkdirSync(dest, { recursive: true });
let n = 0;
for (const f of readdirSync(src)) {
  if (f.endsWith('.wasm') || f.endsWith('.mjs')) {
    copyFileSync(join(src, f), join(dest, f));
    n++;
  }
}
console.log(`Copied ${n} onnxruntime-web runtime files to public/ort/`);
```

- [ ] **Step 3: Wire the script into package.json and run it**

In `package.json`, add to `"scripts"`:
```json
    "sync-ort": "node scripts/copy-ort-wasm.mjs",
```
Run:
```bash
npm run sync-ort
```
Expected: prints "Copied N onnxruntime-web runtime files to public/ort/" (N ≥ 1) and `public/ort/`
contains at least one `.wasm` file.

- [ ] **Step 4: Add the model and its attribution**

Download the u2netp ONNX model (~4.7 MB) into `public/models/u2netp.onnx`. The model weights originate
from the Apache-2.0 U²-Net project (https://github.com/xuebinqin/U-2-Net); the rembg release assets
distribute a ready ONNX export. Candidate command:
```bash
mkdir -p public/models
curl -L -o public/models/u2netp.onnx \
  "https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx"
```
**Verify before continuing:** the file is roughly 4–5 MB. If the candidate URL is stale, obtain
`u2netp.onnx` from any verifiable Apache-2.0 source (the U²-Net repo or a rembg release) — do not use
a non-commercial model. Then create `public/models/U2NET-CREDITS.txt`:
```text
This product includes the u2netp model from the U^2-Net project
(https://github.com/xuebinqin/U-2-Net), licensed under the Apache License 2.0.
A copy of the Apache 2.0 license is available at https://www.apache.org/licenses/LICENSE-2.0
```

- [ ] **Step 5: Create the constants module**

Create `src/lib/segment-constants.ts`:
```ts
// Shared constants for the background-removal pipeline (u2netp / U^2-Net small).
export const INPUT_SIZE = 320;

// Standard U^2-Net per-channel normalization (RGB).
export const INPUT_MEAN = [0.485, 0.456, 0.406] as const;
export const INPUT_STD = [0.229, 0.224, 0.225] as const;

// Self-hosted asset locations (served from /public).
export const MODEL_URL = '/models/u2netp.onnx';
export const ORT_WASM_PATH = '/ort/';
```

- [ ] **Step 6: Type-check and commit**

Run: `npx astro check`
Expected: 0 errors.
```bash
git add package.json package-lock.json scripts/copy-ort-wasm.mjs public/models public/ort src/lib/segment-constants.ts
git commit -m "chore: add onnxruntime-web, u2netp model, and self-hosted runtime assets"
```

---

## Task 2: Pure preprocess (TDD)

**Files:**
- Create: `src/lib/segment-pre.ts`
- Test: `tests/unit/segment-pre.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/segment-pre.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { preprocess } from '../../src/lib/segment-pre';

// Helper: build an RGBA buffer from [r,g,b] triples (alpha forced to 255).
function rgba(pixels: [number, number, number][]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  });
  return out;
}

describe('preprocess', () => {
  it('normalizes a single pixel into NCHW RGB', () => {
    // 1x1 image, size 1 → identity. value/255 then (v-mean)/std.
    const out = preprocess(rgba([[255, 128, 0]]), 1, 1, 1);
    expect(out.length).toBe(3);
    expect(out[0]).toBeCloseTo((1.0 - 0.485) / 0.229, 4);            // R
    expect(out[1]).toBeCloseTo((128 / 255 - 0.456) / 0.224, 4);     // G
    expect(out[2]).toBeCloseTo((0 - 0.406) / 0.225, 4);             // B
  });

  it('packs channels plane-by-plane (NCHW) with spatial order y*size+x', () => {
    // 2x2 identity. R plane occupies indices 0..3.
    const out = preprocess(
      rgba([[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]]),
      2, 2, 2,
    );
    expect(out.length).toBe(12);
    const rHi = (1.0 - 0.485) / 0.229;
    const rLo = (0 - 0.485) / 0.229;
    expect(out[0]).toBeCloseTo(rHi, 4); // (0,0) R=255
    expect(out[1]).toBeCloseTo(rLo, 4); // (1,0) R=0
    expect(out[2]).toBeCloseTo(rLo, 4); // (0,1) R=0
    expect(out[3]).toBeCloseTo(rHi, 4); // (1,1) R=255
  });

  it('resizes down to the requested size (shape only)', () => {
    const px: [number, number, number][] = Array.from({ length: 16 }, () => [10, 20, 30]);
    const out = preprocess(rgba(px), 4, 4, 2);
    expect(out.length).toBe(2 * 2 * 3);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/segment-pre.test.ts`
Expected: FAIL — cannot find module `segment-pre`.

- [ ] **Step 3: Implement `src/lib/segment-pre.ts`**

```ts
import { INPUT_MEAN, INPUT_STD } from './segment-constants';

/**
 * Bilinear-resize an RGBA image to size×size, normalize per channel,
 * and pack as an NCHW Float32 tensor (RGB only, alpha dropped).
 */
export function preprocess(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  size: number,
): Float32Array {
  const out = new Float32Array(size * size * 3);
  const sx = width / size;
  const sy = height / size;
  for (let ty = 0; ty < size; ty++) {
    const fy = Math.min(height - 1, Math.max(0, (ty + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(height - 1, y0 + 1);
    const wy = fy - y0;
    for (let tx = 0; tx < size; tx++) {
      const fx = Math.min(width - 1, Math.max(0, (tx + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(width - 1, x0 + 1);
      const wx = fx - x0;
      for (let c = 0; c < 3; c++) {
        const p00 = rgba[(y0 * width + x0) * 4 + c];
        const p01 = rgba[(y0 * width + x1) * 4 + c];
        const p10 = rgba[(y1 * width + x0) * 4 + c];
        const p11 = rgba[(y1 * width + x1) * 4 + c];
        const top = p00 + (p01 - p00) * wx;
        const bot = p10 + (p11 - p10) * wx;
        const value = (top + (bot - top) * wy) / 255;
        out[c * size * size + ty * size + tx] = (value - INPUT_MEAN[c]) / INPUT_STD[c];
      }
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/segment-pre.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/segment-pre.ts tests/unit/segment-pre.test.ts
git commit -m "feat: add pure preprocess for background removal"
```

---

## Task 3: Pure postprocess (TDD)

**Files:**
- Create: `src/lib/segment-post.ts`
- Test: `tests/unit/segment-post.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/segment-post.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { maskToAlpha } from '../../src/lib/segment-post';

function solidRgba(n: number, r: number, g: number, b: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = r; out[i * 4 + 1] = g; out[i * 4 + 2] = b; out[i * 4 + 3] = 255;
  }
  return out;
}

describe('maskToAlpha', () => {
  it('min-max normalizes the mask into the alpha channel and preserves RGB', () => {
    const img = solidRgba(4, 10, 20, 30); // 2x2, all (10,20,30)
    const mask = new Float32Array([0, 0.5, 0.5, 1]); // 2x2
    const out = maskToAlpha(img, 2, 2, mask, 2, 2);
    expect(out.length).toBe(16);
    // RGB preserved
    expect([out[0], out[1], out[2]]).toEqual([10, 20, 30]);
    // alpha = round(normalized * 255)
    expect(out[3]).toBe(0);     // mask 0
    expect(out[7]).toBe(128);   // mask 0.5 → round(127.5)
    expect(out[11]).toBe(128);  // mask 0.5
    expect(out[15]).toBe(255);  // mask 1
  });

  it('treats a flat mask (max === min) as fully opaque', () => {
    const img = solidRgba(4, 1, 2, 3);
    const mask = new Float32Array([0.3, 0.3, 0.3, 0.3]);
    const out = maskToAlpha(img, 2, 2, mask, 2, 2);
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(255);
    expect(out[11]).toBe(255);
    expect(out[15]).toBe(255);
  });

  it('upscales a smaller mask to the image size (shape only)', () => {
    const img = solidRgba(16, 5, 5, 5); // 4x4
    const mask = new Float32Array([0, 1, 1, 0]); // 2x2
    const out = maskToAlpha(img, 4, 4, mask, 2, 2);
    expect(out.length).toBe(4 * 4 * 4);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/unit/segment-post.test.ts`
Expected: FAIL — cannot find module `segment-post`.

- [ ] **Step 3: Implement `src/lib/segment-post.ts`**

```ts
/**
 * Build a new RGBA buffer: copy the original RGB and replace alpha with a
 * min-max-normalized, nearest-neighbor-upscaled mask. A flat mask (max === min)
 * is treated as fully opaque.
 */
export function maskToAlpha(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Float32Array,
  maskW: number,
  maskH: number,
): Uint8ClampedArray {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] < min) min = mask[i];
    if (mask[i] > max) max = mask[i];
  }
  const range = max - min;
  const out = new Uint8ClampedArray(width * height * 4);
  const sx = maskW / width;
  const sy = maskH / height;
  for (let y = 0; y < height; y++) {
    const my = Math.min(maskH - 1, Math.floor((y + 0.5) * sy));
    for (let x = 0; x < width; x++) {
      const mx = Math.min(maskW - 1, Math.floor((x + 0.5) * sx));
      const raw = mask[my * maskW + mx];
      const norm = range > 0 ? (raw - min) / range : 1;
      const i = (y * width + x) * 4;
      out[i] = rgba[i];
      out[i + 1] = rgba[i + 1];
      out[i + 2] = rgba[i + 2];
      out[i + 3] = Math.round(norm * 255);
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/unit/segment-post.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/segment-post.ts tests/unit/segment-post.test.ts
git commit -m "feat: add pure mask-to-alpha postprocess"
```

---

## Task 4: ONNX session loader

**Files:**
- Create: `src/lib/onnx-session.ts`

> Browser/worker-only (loads WASM). No node unit test; covered by the Task 10 e2e. Uses
> `session.inputNames[0]` / `session.outputNames[0]` so no model-specific tensor names are hardcoded.

- [ ] **Step 1: Implement `src/lib/onnx-session.ts`**

```ts
// Lazily loads onnxruntime-web and the u2netp session. The import() keeps
// onnxruntime-web out of the shared worker bundle until the first removal runs.
import { MODEL_URL, ORT_WASM_PATH, INPUT_SIZE } from './segment-constants';

// onnxruntime-web is loaded dynamically; its types aren't imported statically.
/* eslint-disable @typescript-eslint/no-explicit-any */
let ortNs: any = null;
let sessionPromise: Promise<any> | null = null;

async function load(): Promise<any> {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.wasmPaths = ORT_WASM_PATH;
  ort.env.wasm.numThreads = 1; // single-threaded → no cross-origin-isolation headers needed
  ortNs = ort;
  return ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}

function getSession(): Promise<any> {
  if (!sessionPromise) sessionPromise = load();
  return sessionPromise;
}

/** Run u2netp on a preprocessed NCHW tensor; returns the raw mask data. */
export async function runSegmentation(input: Float32Array): Promise<Float32Array> {
  const session = await getSession();
  const tensor = new ortNs.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const feeds: Record<string, unknown> = { [session.inputNames[0]]: tensor };
  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];
  return output.data as Float32Array;
}
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/onnx-session.ts
git commit -m "feat: add lazy onnxruntime-web session loader"
```

---

## Task 5: Removal pipeline

**Files:**
- Create: `src/lib/remove-background.ts`

> Browser-only (OffscreenCanvas + onnx-session). No node unit test; the canvas/inference path is
> covered by the Task 10 e2e. Its pure dependencies are already unit-tested (Tasks 2–3).

- [ ] **Step 1: Implement `src/lib/remove-background.ts`**

```ts
import { isWithinSizeLimit, sniffImageFormat } from './validate';
import { decodeImage } from './decode-image';
import { preprocess } from './segment-pre';
import { maskToAlpha } from './segment-post';
import { runSegmentation } from './onnx-session';
import { INPUT_SIZE } from './segment-constants';

export interface RemoveBgResult {
  blob: Blob;
  name: string;
}

function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? name : name.slice(0, dot);
}

export async function removeBackground(file: File): Promise<RemoveBgResult> {
  if (!isWithinSizeLimit(file)) {
    throw new Error('This image is too large to process in your browser.');
  }
  const fmt = await sniffImageFormat(file);
  if (!fmt) throw new Error('Unsupported image format.');

  const img = await decodeImage(file);
  const input = preprocess(img.data, img.width, img.height, INPUT_SIZE);
  const mask = await runSegmentation(input);
  const rgba = maskToAlpha(img.data, img.width, img.height, mask, INPUT_SIZE, INPUT_SIZE);

  const canvas = new OffscreenCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.putImageData(new ImageData(rgba, img.width, img.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });

  return { blob, name: `${baseName(file.name)}-no-bg.png` };
}
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/remove-background.ts
git commit -m "feat: add background-removal pipeline"
```

---

## Task 6: Worker + client remove-bg op

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
  | { id: string; op: 'resize'; file: File; opts: ResizeOpts }
  | { id: string; op: 'remove-bg'; file: File };

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
    } else if (req.op === 'resize') {
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
    } else {
      // Dynamically import so onnxruntime-web is only loaded on the remove-bg route,
      // never bundled into the shared worker that the other tools use.
      const { removeBackground } = await import('./remove-background');
      const r = await removeBackground(req.file);
      (self as unknown as Worker).postMessage({
        id: req.id, ok: true, blob: r.blob, name: r.name,
      } as WorkerResponse);
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Processing failed.';
    (self as unknown as Worker).postMessage({ id: req.id, ok: false, error } as WorkerResponse);
  }
};
```

- [ ] **Step 2: Append to `src/lib/client.ts`**

Add at the end of `src/lib/client.ts` (after the existing `resizeInWorker` export). No import changes
are needed — `client.ts` already imports `WorkerRequest`/`WorkerResponse` as types, and the new
`remove-bg` variant flows in automatically from `worker.ts` (Step 1).
```ts
export interface RemoveBgOutcome {
  blob: Blob;
  name: string;
}

export function removeBackgroundInWorker(id: string, file: File): Promise<RemoveBgOutcome> {
  return call<RemoveBgOutcome>({ id, op: 'remove-bg', file }, (r) => {
    if (!r.blob || !r.name) throw new Error(r.error ?? 'Background removal failed.');
    return { blob: r.blob, name: r.name };
  });
}
```

- [ ] **Step 3: Type-check, build, regression e2e**

Run:
```bash
npx astro check
npx astro build
npx kill-port 4321
npx playwright test tests/e2e/convert.spec.ts tests/e2e/compress.spec.ts tests/e2e/resize.spec.ts
```
Expected: 0 type errors; build passes; existing convert (3) + compress (3) + resize (3) e2e all pass —
confirming the new `remove-bg` op did not break the existing worker arms.

- [ ] **Step 4: Commit**

```bash
git add src/lib/worker.ts src/lib/client.ts
git commit -m "feat: add remove-bg op to worker and client"
```

---

## Task 7: BatchList preview slot

**Files:**
- Modify: `src/components/BatchList.tsx`

> Additive, optional prop. Existing tools pass nothing and are visually unchanged (regression-gated by
> their e2e, already re-run in Task 6 and again in Task 10).

- [ ] **Step 1: Add `previewUrl` to the `BatchRow` interface**

In `src/components/BatchList.tsx`, change the interface:
```ts
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
```

- [ ] **Step 2: Render the preview thumbnail when present**

In `src/components/BatchList.tsx`, replace this line:
```tsx
            <div class="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center text-sm flex-shrink-0">🖼</div>
```
with:
```tsx
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
```

- [ ] **Step 3: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/BatchList.tsx
git commit -m "feat: add optional preview thumbnail to BatchList rows"
```

---

## Task 8: RemoveBgShell island

**Files:**
- Create: `src/components/RemoveBgShell.tsx`

- [ ] **Step 1: Implement `src/components/RemoveBgShell.tsx`**

```tsx
import { useState, useCallback } from 'preact/hooks';
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

  const runRemoval = useCallback(async (id: string, file: File) => {
    update(id, { status: 'processing', result: undefined, error: undefined });
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
```

- [ ] **Step 2: Type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/RemoveBgShell.tsx
git commit -m "feat: add RemoveBgShell island with model-load notice and previews"
```

---

## Task 9: Content, registry entry, and page

**Files:**
- Modify: `src/content/tools.ts`
- Modify: `src/content/tool-registry.ts`
- Create: `src/pages/remove-background.astro`

- [ ] **Step 1: Append `REMOVE_BG_CONTENT` to `src/content/tools.ts`**

Add at the end of the file (after the existing `RESIZE_CONTENT` export):
```ts
export const REMOVE_BG_CONTENT = {
  slug: 'remove-background',
  title: 'Remove Image Background — Free, Private, In Your Browser',
  description: 'Remove the background from any image and download a transparent PNG — free, no upload. Runs entirely in your browser, so your photos never leave your device.',
  intro: 'Erase the background from your JPG, PNG, WebP, and HEIC images right in your browser and get a clean transparent PNG. 100% free, no account, and nothing is ever uploaded to a server.',
  body: [
    'Drag your images into the box above (or tap to choose them). Each image is processed on your own device and shown with a checkerboard preview so you can see the cut-out before downloading. Remove the background from many at once and download them together as a zip.',
    'The first image loads a small one-time AI model (about 5 MB), so it takes a few seconds; after that the rest are quick. Results are saved as transparent PNGs and work well for people, products, and objects.',
    'Because everything runs locally in your browser — even the AI model is served from this site, not a third party — none of your images are ever sent anywhere. That makes it safe for personal and sensitive photos, and it works offline once loaded.',
  ],
  faq: [
    { q: 'Are my images uploaded anywhere?', a: 'No. Background removal runs entirely in your browser, and even the AI model is served from this site rather than a third party. Your files never leave your device.' },
    { q: 'Why is the first image slower?', a: 'The first image downloads a small one-time model (about 5 MB) and starts it up. Your browser caches it, so every image after that is much faster.' },
    { q: 'What formats can I use, and what do I get back?', a: 'You can drop in JPG, PNG, WebP, and HEIC images. The result is always a transparent PNG, since PNG is the universal format that supports transparency.' },
    { q: 'Does it work on people and products?', a: 'Yes. The model is general-purpose and handles people, products, and other objects. Very fine details like loose hair may not be perfect.' },
  ],
};
```

- [ ] **Step 2: Add the registry entry in `src/content/tool-registry.ts`**

Insert this entry at the end of the `TOOL_REGISTRY` array, after the `compress-image` entry:
```ts
  { slug: 'remove-background', href: '/remove-background', name: 'Remove Background', shortName: 'Remove BG', icon: '🪄', blurb: 'Erase image backgrounds — JPG, PNG, WebP & HEIC.' },
```
The full array becomes:
```ts
export const TOOL_REGISTRY: ToolEntry[] = [
  { slug: 'heic-to-jpg', href: '/heic-to-jpg', name: 'HEIC to JPG', shortName: 'HEIC→JPG', icon: '🖼', blurb: 'Convert iPhone HEIC photos to JPG.' },
  { slug: 'heic-to-png', href: '/heic-to-png', name: 'HEIC to PNG', shortName: 'HEIC→PNG', icon: '🎨', blurb: 'Convert HEIC to lossless PNG.' },
  { slug: 'heic-to-pdf', href: '/heic-to-pdf', name: 'HEIC to PDF', shortName: 'HEIC→PDF', icon: '📄', blurb: 'Turn HEIC photos into PDF documents.' },
  { slug: 'resize-image', href: '/resize-image', name: 'Resize Image', shortName: 'Resize', icon: '📐', blurb: 'Change image dimensions — JPG, PNG, WebP & HEIC.' },
  { slug: 'compress-image', href: '/compress-image', name: 'Compress Image', shortName: 'Compress', icon: '🗜', blurb: 'Shrink JPG, PNG, WebP & HEIC file sizes.' },
  { slug: 'remove-background', href: '/remove-background', name: 'Remove Background', shortName: 'Remove BG', icon: '🪄', blurb: 'Erase image backgrounds — JPG, PNG, WebP & HEIC.' },
];
```

- [ ] **Step 3: Create `src/pages/remove-background.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import RemoveBgShell from '../components/RemoveBgShell.tsx';
import Faq from '../components/Faq.astro';
import RelatedTools from '../components/RelatedTools.astro';
import AdSlot from '../components/AdSlot.astro';
import ToolSchema from '../components/ToolSchema.astro';
import { REMOVE_BG_CONTENT as c } from '../content/tools';
---
<BaseLayout title={c.title} description={c.description}>

  <ToolSchema slug="remove-background" description={c.description} />

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
    <RemoveBgShell client:load />
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

  <RelatedTools currentSlug="remove-background" />

</BaseLayout>
```

- [ ] **Step 4: Verify build + sitemap + registry test**

Run:
```bash
npx vitest run tests/unit/tool-registry.test.ts
npx astro build
node -e "const fs=require('fs');const s=fs.readFileSync('dist/sitemap-0.xml','utf8');console.log('remove-background in sitemap:', s.includes('remove-background'));"
```
Expected: registry test passes; build emits **10 pages** (home, 3 converters, resize-image,
compress-image, remove-background, about, privacy, contact); `remove-background in sitemap: true`.

- [ ] **Step 5: Commit**

```bash
git add src/content/tools.ts src/content/tool-registry.ts src/pages/remove-background.astro
git commit -m "feat: add remove-background page, content, and registry entry"
```

---

## Task 10: E2E + final verification

**Files:**
- Create: `tests/e2e/remove-background.spec.ts`

- [ ] **Step 1: Write the e2e test**

Create `tests/e2e/remove-background.spec.ts`:
```ts
import { test, expect } from '@playwright/test';
import UPNG from 'upng-js';

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

test('removes the background and downloads a transparent PNG', async ({ page }) => {
  await page.goto('/remove-background');
  await page.getByTestId('file-input').setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: makePngBuffer(64, 64),
  });
  // The first run downloads + initializes the model, so allow generous time.
  const downloadButton = page.getByTestId('download');
  await expect(downloadButton).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('preview')).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    downloadButton.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-no-bg\.png$/);
});

test('surfaces links to the other tools', async ({ page }) => {
  await page.goto('/remove-background');
  const related = page.getByTestId('related-tools');
  await expect(related.locator('a[href="/compress-image"]')).toBeVisible();
  await expect(related.locator('a[href="/heic-to-jpg"]')).toBeVisible();
});
```

- [ ] **Step 2: Build then run the remove-background e2e**

Run:
```bash
npx astro build
npx kill-port 4321
npx playwright test tests/e2e/remove-background.spec.ts
```
Expected: 2 tests pass. If the download button never appears, run with `--headed` and check the
browser console for worker / wasm-path / model-fetch errors (confirm `/ort/*.wasm` and
`/models/u2netp.onnx` are served).

- [ ] **Step 3: Manual quality check (not automated)**

The e2e proves the pipeline runs and emits a PNG, but not that the cut-out is *correct*. Run
`npx astro preview --port 4321`, open `http://localhost:4321/remove-background`, drop in a real photo
of a person or product, and confirm the background is actually removed in the checkerboard preview. If
the alpha looks inverted or empty, the model's primary output may not be its first output tensor —
inspect `session.outputNames` and adjust `onnx-session.ts` to select the saliency output explicitly.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/remove-background.spec.ts
git commit -m "test: add background-remover e2e (removal + related-tools)"
```

- [ ] **Step 5: Final full verification**

Run:
```bash
npm test
npx astro build
npx kill-port 4321
npx playwright test
```
Expected: all unit tests pass (including the new `preprocess` + `maskToAlpha` tests); build emits 10
pages + sitemap; full e2e suite passes — convert (3) + compress (3) + resize (3) + remove-bg (2) = 11.

- [ ] **Step 6: Final commit (only if anything is uncommitted)**

```bash
git add -A
git commit -m "chore: final verification for background remover"
```

---

## Definition of Done

- `npm test` passes, including the new `preprocess` and `maskToAlpha` unit tests.
- `npx playwright test` passes all 11 e2e (convert + compress + resize + remove-bg).
- `npx astro build` emits 10 pages + sitemap, 0 errors.
- `/remove-background` removes the background from JPG/PNG/WebP/HEIC and downloads a transparent PNG,
  showing a checkerboard preview and a one-time model-load notice on first use.
- onnxruntime-web loads **only** on `/remove-background` (dynamic import in the worker); the other
  tool pages are unaffected (regression-gated by their e2e).
- The model and ort WASM are served from this origin (`/models/`, `/ort/`) — no third-party calls.
- The remover appears in the header dropdown, bottom related-tools grid, homepage, and sitemap.
- Manual quality check confirms a real photo's background is visibly removed.

## Deferred (future specs)

Solid-color/white background fill, edge refinement/feathering, an opt-in "HD" model (full U²-Net or
BiRefNet), WebGPU acceleration, manual mask touch-up.
