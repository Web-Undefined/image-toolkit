# Privacy-First Image Toolkit — Design Spec

**Date:** 2026-06-03
**Status:** Approved for planning
**Working name:** image-toolkit (product/domain name TBD before launch)

## 1. Goal & Strategy

Build a webapp that earns **passive ad income** (Google AdSense) from **organic search traffic**, under these owner constraints:

- **Running cost ceiling:** ~$20–50/mo (we will operate near $0 + a domain).
- **Effort model:** truly set-and-forget after launch — no content treadmill, no data to keep fresh.
- **Niche:** opportunistic (chosen for traffic-to-competition ratio, not personal interest).

**Chosen archetype:** client-side file/media micro-tools. Files are transformed entirely in the
browser (WASM), so server cost stays ~$0 even at high traffic, and the tools are immune to Google
AI Overviews (Google cannot answer "convert *this* file" in a search snippet).

**Differentiator:** because processing is 100% in-browser, **files never leave the user's device**.
"No upload, fully private, works offline" is a true trust hook that upload-based incumbents cannot
match — it doubles as a marketing line and an SEO angle ("private/offline HEIC converter").

**Cluster strategy (not a single tool):** ship a tight cluster of single-purpose tools sharing one
codebase. Each tool gets its own SEO landing page/keyword, the tools internal-link to each other,
and the site reads as a real multi-page site (required for AdSense approval). Marginal cost of each
additional sibling tool is small once the shared framework exists.

**Anchor tool:** HEIC → JPG converter. High, recurring intent (iPhones shoot HEIC; most non-Apple
software can't open it), client-side decodable via the libheif WASM library.

## 2. Stack & Hosting

- **Framework:** Astro. Ships static HTML per route (fully crawlable/rankable — essential for SEO)
  while running the interactive tool as a Preact **island** with near-zero extra JS.
- **HEIC decode:** `libheif` compiled to WASM, run inside a **Web Worker** so the UI never blocks
  on large batches. Safari decodes HEIC natively → fast-path that skips the WASM download.
- **Encode:** browser `canvas` → `toBlob` for JPG/PNG; `pdf-lib` for PDF output.
- **Zip (download-all):** client-side zip library (e.g. `fflate`).
- **Hosting:** Cloudflare Pages (free tier, global CDN, unlimited bandwidth). All file processing is
  client-side → traffic scaling costs $0.
- **Cost:** domain only (~$10/yr). Remaining budget is headroom (e.g. a keyword-research tool
  subscription while selecting/validating keyword targets).

## 3. Site Structure

Each route is its own SEO target with genuine content.

| Route | Purpose |
|-------|---------|
| `/` | Toolkit home: privacy promise + links to every tool |
| `/heic-to-jpg` | **Anchor** tool + ~600 words content (what HEIC is, why it won't open, how-to, FAQ) |
| `/heic-to-png` | Sibling — same decode pipeline, PNG encode |
| `/heic-to-pdf` | Sibling — same decode pipeline, wrapped via `pdf-lib` |
| `/about` | Required for AdSense; explains the project + privacy stance |
| `/privacy` | Required for AdSense; reinforces "files never leave your device" |

Plus auto-generated `sitemap.xml`, clean meta/OpenGraph tags, and FAQ schema on tool pages.

## 4. Components & Data Flow

### Decode pipeline (the heart of the app)
```
User drops file(s)
  → validate (is it really HEIC? size sane?)
  → Web Worker: libheif WASM decodes HEIC → raw ImageData
      (Safari fast-path: native decode, skip WASM)
  → canvas encodes ImageData → target format (JPG / PNG / PDF)
  → result added to batch list (thumbnail + output size + download button)
  → user downloads each, or "Download all" → client-side zip
```
**No byte ever touches a network.**

### Shared components
1. **`ToolShell`** — dropzone + file picker, batch list, overall progress bar, "Download all (zip)".
   Identical on every tool page. Hosts the ad slots (see §6).
2. **`transform(file, opts) → Blob`** — the *only* per-tool difference. JPG vs PNG differ by one
   encode parameter; PDF wraps the decoded image with `pdf-lib`.
3. **`heicWorker`** — wraps libheif WASM; a reused worker processes files sequentially (or a small
   parallel pool) to bound memory use.
4. **Content pages** — Markdown/MDX per tool (SEO copy + FAQ). Adding a tool = new MDX + new
   `transform()`.

### Adding a future tool
New content page (MDX) + new `transform()` function. Nothing else changes. This is the growth path.

## 5. Error Handling

Per-file, and **never fail the whole batch**:

- Not actually HEIC / corrupt file → mark that file failed, continue processing the rest.
- File too large / out-of-memory → friendly "this image is too big to process in-browser" message.
- Worker/WASM load failure → clear retry message.
- Browser lacking required APIs → graceful explanation.
- Each file in the batch shows its own ✓ / ✗ state with a reason on failure.

## 6. Monetization

- **Engine:** Google AdSense. Approval requires a real site: sufficient content, About page, Privacy
  page, custom domain — all built into v1 by design.
- **Placement:** 1 unit above-the-fold beside the tool, 1 in-content within the SEO copy, 1 in
  footer. **Lazy-loaded** so they never slow the tool. Ads live in `ToolShell`/layout, never inside
  the processing flow.
- **Earnings reality (calibration):** image-tool traffic is high-volume but low RPM (~$1–4 per 1,000
  views). This is a **volume game**: income compounds as multiple tool pages rank, over months.
  Meaningful revenue requires real ranking traffic and patience — not a quick win.

## 7. SEO Essentials (primary success driver)

- One page per keyword; each with genuine how-to content + an **FAQ block using FAQ schema**
  (eligible for rich snippets).
- Auto-generated `sitemap.xml`; clean meta/OG tags; fast Core Web Vitals (Astro default).
- Internal links between sibling tools.
- Keyword target validation (volume/competition) happens before/at launch using a keyword tool.

## 8. Testing

- **Unit-test each `transform()`** against fixture HEIC files (real iPhone samples) → assert a valid
  JPG / PNG / PDF is produced.
- **Component test** the batch flow: a mix of good + corrupt files → correct per-file ✓/✗ states.
- **One Playwright e2e:** upload a fixture HEIC → assert a JPG file downloads.
- **Manual cross-browser pass:** Chrome, Firefox, Safari (including the Safari native-decode path).

## 9. v1 Scope (YAGNI)

**In v1:**
- ✅ `/heic-to-jpg` (anchor, batch + download-all zip)
- ✅ `/heic-to-png`, `/heic-to-pdf` (share the one decode pipeline)
- ✅ Home, About, Privacy pages + `sitemap.xml` + AdSense integration + FAQ schema

**Deferred to v1.1+ (growth once the anchor ranks):**
- ⛔ Background remover, format-converter hub, image compressor, image resizer
- ⛔ User accounts, anything server-side

## 10. Open Questions (resolve during planning/launch)

- Final product name + domain.
- Exact libheif WASM library choice (e.g. `libheif-js` vs `heic-to`) — validate decode reliability
  and bundle size against real iPhone HEIC samples.
- Keyword target shortlist + which siblings to prioritize after v1 based on validated volume.
