# Image Compressor + Cross-Tool Discovery — Design Spec

**Date:** 2026-06-04
**Status:** Approved for planning
**Project:** image-toolkit (`freeheicconverter.com`)

## 1. Goal

Add a second tool — a **privacy-first image compressor** — on the same domain, and build a
**cross-tool discovery system** so a visitor landing on any single tool discovers the others. Both
serve the v2 strategy: more tools = more SEO surface = more traffic, all from one shared codebase.

## 2. Compressor Mechanics

**Control model:** compress-on-drop using a smart default quality (0.8), plus a **quality slider
(0–100)** to re-compress. Each file row shows **before → after size and percent saved**
(e.g. "2.4 MB → 740 KB · 69% smaller").

**Input formats:** JPG, PNG, WebP, HEIC.

**Per-format compression:**

| Input | Method | Output format |
|-------|--------|---------------|
| JPG | Canvas re-encode at quality Q (`image/jpeg`) | JPG |
| WebP | Canvas re-encode at quality Q (`image/webp`) | WebP |
| PNG | **Lossy color quantization** via `upng-js`, palette size mapped to slider | PNG |
| HEIC | Decode via existing libheif worker → encode JPEG at quality Q | **JPG** |

**Rationale for lossy PNG:** a plain canvas re-encode of a PNG frequently produces a *larger* file
(PNG is lossless; browser PNG encoders are weak). Genuine shrinking requires palette/color
reduction (the TinyPNG approach). Quality slider controls aggressiveness. Acceptable for
screenshots/graphics; this is the industry-standard tradeoff.

**Output policy:** same format in, same format out — except HEIC, which outputs JPG (no in-browser
HEIC encoder exists). The compressor UI displays a note: "HEIC images are compressed to JPG."

**Edge cases / error handling (per-file, never fail the batch):**
- Unsupported/corrupt file → that row shows an error, the rest of the batch continues.
- File too large (reuse existing 50 MB guard) → friendly "too large to process in-browser" message.
- Compressed output larger than input (can happen for already-optimized files) → keep the original
  bytes and label the row "Already optimized" rather than handing back a bigger file.

## 3. Architecture

The compressor shares dropzone, batch list, per-file progress, download + zip, and worker
offloading with the existing converters, but adds a quality slider, size display, and multi-format
decode. Approach: extract shared presentational primitives, then build the compressor as its own
focused island.

**Refactor (small, behavior-preserving) — extract from current `ToolShell.tsx`:**
- `src/components/Dropzone.tsx` — drag/drop + hidden file input + "Choose files" button.
- `src/components/BatchList.tsx` — per-file status rows, download buttons, download-all button.
- `src/lib/download.ts` — `downloadBlob(blob, name)` and `downloadAllZip(items, zipName)` helpers
  (centralizes logic currently inline in ToolShell).

`ToolShell.tsx` (converters) is refactored to consume `Dropzone` + `BatchList`. Its existing unit
and e2e tests must continue to pass unchanged — this is the regression guard for the refactor.

**New compressor modules:**
- `src/lib/decode-image.ts` — `decodeImage(file) → RawImage`. Routes JPG/PNG/WebP through
  `createImageBitmap` + OffscreenCanvas (native, fast, no WASM); routes HEIC through the existing
  `decodeHeicBuffer` (libheif). Input type sniffed via existing magic-byte validation, extended to
  recognize JPG/PNG/WebP signatures.
- `src/lib/compress.ts` — `compress(file, opts: { quality: number }) → { blob, name, inputSize,
  outputSize, format }`. Sniffs input, decodes, re-encodes to the correct format (canvas for
  JPG/WebP, `upng-js` for PNG, libheif→JPEG for HEIC), returns sizes. Implements the
  "already optimized" fallback.
- `src/components/CompressShell.tsx` — Preact island composed of `Dropzone` + a **quality slider**
  + `BatchList` extended to show before/after sizes and percent saved. Own island (distinct state:
  quality, size deltas) to stay focused and testable.
- **Worker (`src/lib/worker.ts`)** gains a `compress` message type alongside the existing
  `convert`, so compression runs off the UI thread. `client.ts` gains `compressInWorker(id, file,
  quality)`.

**New dependency:** `upng-js` (pure JS, small) for lossy PNG quantization. All other compression
uses native browser APIs.

**Why a separate island (not a `mode` prop on ToolShell):** the compressor's state and controls
differ enough that a shared component would tangle responsibilities. Separate islands sharing
`Dropzone`/`BatchList` primitives keep each small and establish the reuse pattern for future tools
(resizer, WebP converter).

## 4. Cross-Tool Discovery

**Single source of truth:** `src/content/tool-registry.ts` exports an array of every tool:
```ts
interface ToolEntry {
  slug: string;       // 'compress-image'
  href: string;       // '/compress-image'
  name: string;       // 'Compress Image' (anchor text / card title)
  shortName: string;  // 'Compress' (header menu)
  icon: string;       // emoji or glyph
  blurb: string;      // one-line description for cards
}
```
This array powers four consumers, so adding a future tool means editing one file:
1. **Header "All Tools ▾" dropdown** — in `BaseLayout.astro`, on every page.
2. **Bottom "More free tools" card grid** — new `src/components/RelatedTools.astro`, rendered on
   every tool page; shows all tools *except* the current one.
3. **Homepage grid** — `index.astro` reads the registry instead of its current hardcoded list.
4. **Sitemap** — already auto-generated; registry keeps nav/content in sync.

**Cross-linking rule:** `RelatedTools` excludes the current slug and renders descriptive,
keyword-rich anchor text ("Compress Image", "HEIC to JPG") — optimal internal linking for SEO.

**Header brand rename:** change the header brand label from "HEIC Toolkit" to **"Image Toolkit"**
(the domain `freeheicconverter.com` is unchanged; brand label and domain need not match). Reflects
the multi-tool site.

## 5. SEO

- **One page, one keyword:** `/compress-image` targets "compress image" / "image compressor".
  Unique `<title>`, meta description, single `<h1>`.
- **Genuine content + FAQ** with FAQ JSON-LD schema (reuse existing `Faq.astro` pattern).
- Self-referencing canonical + OG tags (already in `BaseLayout`).
- Registry feeds the auto-sitemap; new page is crawled with no manual step.
- New compressor copy mentions `.jpg`, `.png`, `.webp`, `.heic` to capture format-specific searches.

## 6. Content

`compress-image` entry added to `src/content/tools.ts` (existing `ToolContent` shape: title,
description, intro, body paragraphs, FAQ). Copy emphasizes: 100% in-browser/private, supported
formats, lossy-PNG explanation, HEIC→JPG note.

## 7. Testing

- **Unit:** `compress()` against fixtures (a JPG, a PNG, a WebP, plus the existing HEIC) → assert
  output bytes < input bytes (or "already optimized" path) and correct output format.
- **Unit:** `decodeImage()` sniffs each format correctly.
- **Unit:** `RelatedTools` excludes the current slug; registry has no duplicate slugs.
- **Unit (regression):** existing converter tests still pass after the Dropzone/BatchList extraction.
- **E2E (Playwright):** load `/compress-image`, upload a JPG fixture, assert a smaller file
  downloads; assert the bottom grid contains links to the other tool pages.

## 8. Scope

**In scope (this spec):**
- Image compressor (`/compress-image`) with quality slider, before/after sizes, JPG/PNG/WebP/HEIC.
- Shared primitive extraction (`Dropzone`, `BatchList`, `lib/download.ts`).
- Tools registry + header dropdown + bottom related-tools grid + homepage wired to registry.
- Header brand rename to "Image Toolkit".

**Deferred (future specs):**
- Image resizer, WebP converter, background remover.
- Standalone domains per tool.
- Target-file-size compression mode.

## 9. Files

| File | Change |
|------|--------|
| `src/content/tool-registry.ts` | **New** — all-tools registry (nav source of truth) |
| `src/components/Dropzone.tsx` | **New** — extracted dropzone primitive |
| `src/components/BatchList.tsx` | **New** — extracted batch-list primitive (with size display support) |
| `src/lib/download.ts` | **New** — blob + zip download helpers |
| `src/lib/decode-image.ts` | **New** — multi-format decode (canvas + libheif) |
| `src/lib/compress.ts` | **New** — compression pipeline |
| `src/components/CompressShell.tsx` | **New** — compressor island |
| `src/components/RelatedTools.astro` | **New** — bottom cross-tool grid |
| `src/pages/compress-image.astro` | **New** — compressor page |
| `src/lib/worker.ts` | Modify — add `compress` message handler |
| `src/lib/client.ts` | Modify — add `compressInWorker` |
| `src/lib/validate.ts` | Modify — recognize JPG/PNG/WebP signatures |
| `src/components/ToolShell.tsx` | Modify — consume `Dropzone` + `BatchList` |
| `src/components/ToolPage.astro` | Modify — render `RelatedTools` at the bottom |
| `src/layouts/BaseLayout.astro` | Modify — "All Tools ▾" dropdown, brand rename |
| `src/content/tools.ts` | Modify — add `compress-image` content entry |
| `src/pages/index.astro` | Modify — read homepage grid from registry |
| `package.json` | Modify — add `upng-js` |
| tests | New unit + e2e per §7 |
