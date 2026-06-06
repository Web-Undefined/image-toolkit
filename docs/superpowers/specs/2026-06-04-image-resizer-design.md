# Image Resizer — Design Spec

**Date:** 2026-06-04
**Status:** Approved for planning
**Project:** image-toolkit (`freeheicconverter.com`)

## 1. Goal

Add a privacy-first **image resizer** (`/resize-image`) as the site's fourth-and-a-half tool. It
changes image dimensions entirely in the browser, reusing the existing multi-format decode pipeline
and tool architecture. Targets the high-volume "resize image" / "image resizer" search keywords and
makes the site more robust as a general image-tool destination.

## 2. Resize Mechanics

**Inputs:** JPG, PNG, WebP, HEIC (reuses `decodeImage()`).

**Controls:** two number inputs — **Width** and **Height** (px) — plus a **🔒 Lock aspect ratio**
toggle (ON by default).

**Behavior (handles mixed-ratio batches correctly):**
- **Lock ON (default):** the user fills *one* dimension; every image scales to that dimension using
  *its own* aspect ratio (e.g. "make everything 800px wide"). If both fields are filled while
  locked, **width wins** and height is computed per-image.
- **Lock OFF:** both fields required; every image is resized to exactly W×H (may distort).

**Output policy:** same format in, same format out — except HEIC, which outputs JPG (browsers can't
write HEIC). JPG/WebP re-encode at a fixed high quality (0.92). **No quality slider** — the resizer
is about dimensions only; file-size control is the compressor's job. This keeps the two tools
distinct.

**Up/down scaling:** both allowed. Enlarging is not blocked; it simply won't add detail.

**Per-file display:** each row shows the result as `4032×3024 → 800×600 · 740 KB`. Download
individually or all together as a zip.

**Errors (per-file, never break the batch):**
- No usable dimension entered (locked with both empty, or unlocked with either empty) → that row
  shows a friendly "enter a width or height" message.
- Target dimension ≤ 0 or absurdly large (> 20000 px on a side) → rejected with a message.
- Unsupported/corrupt file → that row errors; the rest of the batch continues.
- File too large (existing 50 MB guard) → friendly message.

## 3. Architecture

Mirrors the compressor pattern. **Reused unchanged:** `decodeImage()`, `Dropzone`, `BatchList`,
`download.ts`, the worker singleton + `client.ts` pattern, `tool-registry.ts`, `RelatedTools.astro`,
`Faq.astro`, `AdSlot.astro`. **No new dependency** — resizing is pure canvas (no UPNG).

**New modules:**

- `src/lib/resize-dimensions.ts` — `computeTargetDimensions(origW, origH, opts) → { width, height }`.
  Pure function holding all the aspect-lock math. **Node-unit-testable** (primary test target).
  ```ts
  export interface ResizeOpts {
    width: number | null;   // requested width in px, or null/0 if blank
    height: number | null;  // requested height in px, or null/0 if blank
    lockAspect: boolean;
  }
  export function computeTargetDimensions(
    origW: number, origH: number, opts: ResizeOpts,
  ): { width: number; height: number };
  ```
  Logic:
  - **lockAspect true:** if `width` > 0 → `{ width, height: round(origH * width / origW) }`;
    else if `height` > 0 → `{ width: round(origW * height / origH), height }`;
    else throw `Error('Enter a width or height.')`.
  - **lockAspect false:** if `width` > 0 and `height` > 0 → `{ width, height }`;
    else throw `Error('Enter both a width and height.')`.
  - After computing, if either side `< 1` or `> 20000` → throw `Error('Target size is out of range.')`.

- `src/lib/resize.ts` — `resize(file, opts: ResizeOpts) → ResizeResult`. Pipeline: `decodeImage(file)`
  → `computeTargetDimensions(img.width, img.height, opts)` → draw onto a target `OffscreenCanvas`
  with `imageSmoothingQuality = 'high'` → encode (canvas JPEG/PNG/WebP by input format; HEIC→JPEG).
  Browser-only → e2e-tested.
  ```ts
  export interface ResizeResult {
    blob: Blob;
    name: string;       // `${base}-${outputW}x${outputH}.${ext}`
    inputW: number; inputH: number;
    outputW: number; outputH: number;
  }
  ```

- `src/lib/worker.ts` — add a `resize` arm to the discriminated union and `onmessage` switch.
- `src/lib/client.ts` — add `resizeInWorker(id, file, opts): Promise<ResizeOutcome>` reusing the
  shared `call()` helper. `ResizeOutcome` carries `{ blob, name, inputW, inputH, outputW, outputH }`.
- `src/components/ResizeShell.tsx` — Preact island: `Dropzone` + Width/Height number inputs + lock
  toggle + `BatchList`. State: `width`, `height`, `lockAspect`, `items`. Re-resizes all current
  files when any control changes (same pattern as the compressor's quality slider). Maps each item
  to a `BatchRow` with a `meta` string `${inputW}×${inputH} → ${outputW}×${outputH} · ${size}`.
- `src/pages/resize-image.astro` — page composition mirroring `compress-image.astro` (hero, AdSlot,
  `ResizeShell`, body copy, `Faq`, `RelatedTools currentSlug="resize-image"`).
- `src/content/tools.ts` — add `RESIZE_CONTENT` (title, description, intro, body, faq).
- `src/content/tool-registry.ts` — add `{ slug: 'resize-image', href: '/resize-image', name:
  'Resize Image', shortName: 'Resize', icon: '📐', blurb: 'Change image dimensions — JPG, PNG, WebP
  & HEIC.' }`.

## 4. Worker protocol change

`WorkerRequest` gains a third variant `{ id, op: 'resize', file, opts: ResizeOpts }`;
`WorkerResponse` gains optional `inputW/inputH/outputW/outputH`. The existing `convert` and
`compress` arms are unchanged. The converter and compressor e2e suites act as the regression gate
for this change.

## 5. SEO & Discovery

- `/resize-image` targets "resize image" / "image resizer": unique `<title>`, meta description,
  single `<h1>`, genuine body copy, FAQ with FAQ JSON-LD schema (reuse `Faq.astro`).
- Adding the registry entry automatically surfaces the tool in the header "All Tools" dropdown, the
  bottom "More free tools" grid on every page, the homepage grid, and the sitemap — no extra wiring.
- Copy mentions JPG/PNG/WebP/HEIC for format-specific search capture.

## 6. Testing

- **Unit (primary):** `computeTargetDimensions()` — lock-on/width, lock-on/height, lock-on/both
  (width wins), lock-off exact, proportional rounding, and error cases (locked+empty,
  unlocked+missing one, out-of-range).
- **Unit (regression):** existing `tool-registry.test.ts` still passes with the new entry (no
  duplicate slugs).
- **E2E (Playwright):** load `/resize-image`; upload the HEIC fixture, set width 800, lock on →
  assert a `*-800x*.jpg` downloads; upload a generated PNG, resize → assert a `*.png` downloads;
  assert the related-tools grid links to the other tools. (Kill port 4321 before running so the
  preview server is hit, not a stale dev server.)

## 7. Scope

**In scope:** the resizer tool (lib, island, page, content, registry entry) + worker `resize` op.

**Deferred:** percentage-scale mode, size presets, format-converter hub, background remover,
per-image individual dimension controls.

## 8. Files

| File | Change |
|------|--------|
| `src/lib/resize-dimensions.ts` | **New** — pure dimension math |
| `src/lib/resize.ts` | **New** — resize pipeline (decode → canvas → encode) |
| `src/components/ResizeShell.tsx` | **New** — resizer island |
| `src/pages/resize-image.astro` | **New** — resizer page |
| `src/lib/worker.ts` | Modify — add `resize` op |
| `src/lib/client.ts` | Modify — add `resizeInWorker` + `ResizeOutcome` |
| `src/content/tools.ts` | Modify — add `RESIZE_CONTENT` |
| `src/content/tool-registry.ts` | Modify — add `resize-image` entry |
| `tests/unit/resize-dimensions.test.ts` | **New** |
| `tests/e2e/resize.spec.ts` | **New** |
