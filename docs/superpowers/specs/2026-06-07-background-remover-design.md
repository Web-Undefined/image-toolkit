# Background Remover — Design Spec

**Date:** 2026-06-07
**Status:** Approved for planning
**Project:** image-toolkit (`freeheicconverter.com`)

## 1. Goal

Add a privacy-first **background remover** (`/remove-background`) that erases the background from an
image entirely in the browser and outputs a transparent PNG. Targets the very high-volume "remove
background" / "background remover" / "transparent background" keywords and strengthens the site as a
general image-tool destination. Reuses the existing multi-format decode pipeline and tool
architecture; adds the project's first ML model.

This is a deliberate departure from the instant, deterministic tools shipped so far (convert, resize,
compress): it runs an ML segmentation model, which means a **one-time model download** and
**seconds-per-image** processing. The design's job is to absorb that difference without compromising
the site's core promises (nothing uploaded, ~$0 cost, set-and-forget).

## 2. Licensing decision (the gating constraint)

The site is ad-supported and closed-source, so any model/runtime **must permit commercial use**.

- **Rejected — `@imgly/background-removal`:** AGPL-3.0. Its network-copyleft clause would force the
  entire site's source to be licensed under AGPL, and IMG.LY's only commercial alternative is a
  four-figure/yr enterprise license. Disqualified.
- **Chosen runtime — `onnxruntime-web`:** MIT. Runs ONNX models in the browser via WASM (with an
  optional WebGPU backend).
- **Chosen model — u2netp (U²-Net "small"):** Apache-2.0, ~4.7 MB. Commercial use permitted. Small
  enough to **self-host as a static asset** (under Cloudflare Pages' 25 MB per-file limit), so there
  is **no third-party CDN and no R2** — the tool is fully self-contained and even the model is never
  fetched from anyone else's server.

Deferred quality upgrade path (future): full-size U²-Net (Apache-2.0) or BiRefNet (MIT) as an opt-in
"HD" mode.

## 3. Mechanics

**Inputs:** JPG, PNG, WebP, HEIC (reuses `decodeImage()`).

**Processing pipeline (per image):**
1. `decodeImage(file)` → original RGBA pixels at full resolution.
2. **Preprocess** → resize the RGBA image to the model's input size (320×320 RGB), normalize per
   channel (mean `[0.485, 0.456, 0.406]`, std `[0.229, 0.224, 0.225]` after scaling to [0,1]), and
   pack into a Float32 NCHW tensor. *(Exact constants confirmed against the model during TDD.)*
3. **Inference** → run u2netp via onnxruntime-web; take the primary side output (`d0`).
4. **Postprocess** → min-max normalize the output to [0,1] to form a single-channel **mask**,
   upscale the mask to the original image dimensions (bilinear), and **composite**: write the mask
   into the alpha channel of the original RGBA pixels (background → alpha 0).
5. **Encode** → transparent **PNG** (the only universally supported format with alpha).

**Output:** one transparent PNG per input, named `${base}-no-bg.png`.

**Output policy:** transparent PNG only. No solid-color/white-fill option in v1 (deferred). No format
choice — alpha mandates PNG.

**Errors (per-file, never break the batch):**
- Unsupported/corrupt file → that row errors; the rest of the batch continues.
- File too large (existing 50 MB guard) → friendly message.
- Model/inference failure → that row errors with a friendly message; other rows continue.

## 4. UX

Mirrors the existing Dropzone + BatchList island, with three additions driven by the ML nature:

- **One-time model-load state.** On first use (per session), the island shows a "Loading background
  remover…" indicator while onnxruntime-web and the ~4.7 MB model download and the session
  initializes. Subsequent images skip this. The model + ort WASM are browser-cached, so repeat visits
  are fast.
- **Sequential batch processing.** The model is the bottleneck and is memory-heavy, so images are
  processed **one at a time** (not in parallel), each row moving pending → processing → done.
- **Checkerboard result preview.** Each completed row renders a small thumbnail of the cutout on a
  CSS checkerboard so the user can confirm the result before downloading — the "did it work?" moment
  that every competitor provides. Implemented by extending `BatchRow` with an optional
  `previewUrl?: string` (an object URL created from the result blob), rendered as an `<img>` over a
  CSS checkerboard background; the URL is revoked when the item is cleared.

Per-file display: filename, checkerboard preview, output size, and download. Download individually or
all together as a zip (`backgrounds-removed.zip`), reusing `download.ts`.

## 5. Architecture

Mirrors the resize/compress pattern. **Reused unchanged:** `decodeImage()`, `Dropzone`, the worker
singleton + `client.ts` `call()` helper, `tool-registry.ts`, `RelatedTools.astro`, `Faq.astro`,
`AdSlot.astro`, `ToolSchema.astro`, `download.ts`, `validate.ts`.

**New modules:**

- `src/lib/segment-pre.ts` — **pure**, node-unit-testable. `preprocess(rgba, w, h, size) →
  Float32Array` (resize + normalize + NCHW pack). Primary TDD target.
- `src/lib/segment-post.ts` — **pure**, node-unit-testable. `maskToAlpha(originalRGBA, w, h, mask,
  maskW, maskH) → Uint8ClampedArray` (min-max normalize mask, bilinear upscale, write alpha).
  Primary TDD target.
- `src/lib/onnx-session.ts` — lazily `import()`s `onnxruntime-web`, configures
  `ort.env.wasm.wasmPaths` to the self-hosted path, loads the model once, and caches the
  `InferenceSession`. Browser-only.
- `src/lib/remove-background.ts` — orchestration: `decodeImage` → `segment-pre` → session.run →
  `segment-post` → encode PNG → `RemoveBgResult { blob, name }`. Browser-only → e2e-tested.
- `src/components/RemoveBgShell.tsx` — island: `Dropzone` + model-load state + `BatchList` with
  checkerboard previews. State: `items`, `modelStatus`. Sequential processing.
- `src/pages/remove-background.astro` — page composition mirroring `resize-image.astro` (hero,
  `ToolSchema`, AdSlot, `RemoveBgShell`, body copy, `Faq`, `RelatedTools`).
- `src/content/tools.ts` — add `REMOVE_BG_CONTENT` (title, description, intro, body, faq).
- `src/content/tool-registry.ts` — add `{ slug: 'remove-background', href: '/remove-background',
  name: 'Remove Background', shortName: 'Remove BG', icon: '🪄', blurb: 'Erase image backgrounds —
  JPG, PNG, WebP & HEIC.' }`.

**Shared component change:** `BatchList` (`BatchRow`) gains an **optional** `preview` slot (e.g.
`previewUrl?: string` or a render slot) used only by the bg remover; existing tools pass nothing and
are visually unchanged (regression-gated by their e2e).

## 6. Worker protocol change

`WorkerRequest` gains a fourth variant `{ id, op: 'remove-bg', file }`; the result reuses the
existing `WorkerResponse` `blob`/`name` fields (no new response fields required — the island derives
the preview and size from the returned blob). `client.ts` gains
`removeBackgroundInWorker(id, file): Promise<RemoveBgOutcome>` (`{ blob, name }`) using the shared
`call()` helper. The existing `convert`, `compress`, and `resize` arms are unchanged; their e2e
suites act as the regression gate.

onnxruntime-web is `import()`-ed **inside the worker**, so it is code-split and only downloads on the
`/remove-background` route. The other tool pages remain unaffected.

## 7. Dependency & hosting notes

- **New dependency:** `onnxruntime-web` (MIT) — the project's first heavyweight dep. Mitigated by
  dynamic import in the worker (route-level code splitting).
- **Self-hosted assets in `/public`:**
  - `u2netp.onnx` (~4.7 MB) — sourced from a verifiable Apache-2.0 provenance (the U²-Net repo /
    rembg model release); license/provenance confirmed as the first implementation step.
  - onnxruntime-web's `.wasm` binaries — copied to a self-hosted path and referenced via
    `ort.env.wasm.wasmPaths`, keeping the tool free of third-party network calls.
- **Backend:** WASM by default (universal support). WebGPU is an optional acceleration the session
  loader may feature-detect later; not required for v1.
- **Privacy footnote:** because the model and WASM are self-hosted, *no* asset is fetched from a
  third party and the user's image never leaves the device — the strongest possible version of the
  site's privacy claim. (No privacy-page change required, but the copy can lean into it.)

## 8. SEO & discovery

- `/remove-background` targets "remove background" / "background remover" / "transparent background" /
  "remove background from image": unique `<title>`, meta description, single `<h1>`, genuine body
  copy, FAQ with FAQPage JSON-LD (`Faq.astro`), and WebApplication JSON-LD (`ToolSchema.astro`).
- Adding the registry entry automatically surfaces the tool in the header "All Tools" dropdown, the
  bottom "More free tools" grid, the homepage grid, and the sitemap.
- Copy mentions JPG/PNG/WebP/HEIC and the privacy/offline angle (the genuine differentiator vs
  remove.bg / Canva / Photoroom, which upload).

**Draft `REMOVE_BG_CONTENT`:**
- **title:** "Remove Image Background — Free, Private, In Your Browser"
- **description:** "Remove the background from any image and download a transparent PNG — free, no
  upload. Runs entirely in your browser, so your photos never leave your device."
- **intro:** Erase the background from JPG, PNG, WebP, and HEIC images right in your browser and get
  a clean transparent PNG. 100% free, no account, and nothing is ever uploaded to a server.
- **body (3 paras):** how-to (drop images, it runs on-device, preview + download); what to expect
  (transparent PNG, works on people/products/objects, first use loads a small one-time model);
  privacy/offline (everything local, safe for personal and sensitive photos).
- **faq (4):** Are my images uploaded? (No.) / Why is the first image slower? (one-time model load,
  then cached) / What formats can I use and what do I get back? (JPG/PNG/WebP/HEIC in, transparent
  PNG out) / Does it work on people and products? (yes, general-purpose).

## 9. Testing

- **Unit (primary, TDD):** `segment-pre` (resize/normalize/pack — assert tensor shape and sample
  normalized values) and `segment-post` (min-max mask normalization, bilinear upscale, alpha
  compositing — assert known-pixel outcomes on tiny synthetic inputs).
- **Unit (regression):** existing `tool-registry.test.ts` still passes with the new entry (no
  duplicate slugs).
- **E2E (Playwright):** load `/remove-background`; upload a small generated image; wait for the model
  to load and the row to finish (generous timeout, e.g. 60s); assert a `*-no-bg.png` downloads and
  the checkerboard preview is visible; assert the related-tools grid links to the other tools.
  Existing convert/compress/resize e2e remain the regression gate for the worker change.

## 10. Scope

**In scope:** the background remover (pure pre/post helpers, onnx session loader, pipeline, island
with model-load state + checkerboard preview, page, content, registry entry, optional `BatchList`
preview slot) + worker `remove-bg` op + self-hosted model and ort WASM.

**Deferred (future specs):** solid-color/white background fill, edge refinement/feathering, an opt-in
"HD" model (full U²-Net or BiRefNet), WebGPU acceleration, manual mask touch-up.

## 11. Files

| File | Change |
|------|--------|
| `src/lib/segment-pre.ts` | **New** — pure preprocess (resize/normalize/pack) |
| `src/lib/segment-post.ts` | **New** — pure postprocess (mask→alpha composite) |
| `src/lib/onnx-session.ts` | **New** — lazy onnxruntime-web + model session loader |
| `src/lib/remove-background.ts` | **New** — pipeline (decode → infer → composite → PNG) |
| `src/components/RemoveBgShell.tsx` | **New** — island with model-load state + previews |
| `src/pages/remove-background.astro` | **New** — page |
| `src/lib/worker.ts` | Modify — add `remove-bg` op |
| `src/lib/client.ts` | Modify — add `removeBackgroundInWorker` + `RemoveBgOutcome` |
| `src/components/BatchList.tsx` | Modify — add optional `preview` slot to `BatchRow` |
| `src/content/tools.ts` | Modify — add `REMOVE_BG_CONTENT` |
| `src/content/tool-registry.ts` | Modify — add `remove-background` entry |
| `public/u2netp.onnx` | **New** — Apache-2.0 model asset (~4.7 MB) |
| `public/ort/*.wasm` | **New** — self-hosted onnxruntime-web WASM binaries |
| `tests/unit/segment-pre.test.ts` | **New** |
| `tests/unit/segment-post.test.ts` | **New** |
| `tests/e2e/remove-background.spec.ts` | **New** |
| `package.json` | Modify — add `onnxruntime-web` dependency |
