# Tailwind CSS Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Tailwind CSS v4 to give HEIC Toolkit a modern, sleek, mobile-first dark purple design matching the approved mockup.

**Architecture:** Install Tailwind v4 via `@tailwindcss/vite` (Astro 6 native), create a global CSS file with design tokens, then restyle each component/page top-down: BaseLayout → ToolShell → ToolPage → Faq → index → about/privacy. No new functionality — pure visual uplift.

**Tech Stack:** Tailwind CSS v4, `@tailwindcss/vite`, Astro 6, Preact.

---

## File Structure

```
src/
  styles/
    global.css          ← NEW: Tailwind import + CSS custom properties + base body styles
  layouts/
    BaseLayout.astro    ← MODIFY: import global.css, style header/footer/body
  components/
    ToolShell.tsx       ← MODIFY: Tailwind classes on dropzone, batch list, buttons
    ToolPage.astro      ← MODIFY: hero, tabs, content section layout
    Faq.astro           ← MODIFY: FAQ heading + item styling
  pages/
    index.astro         ← MODIFY: hero + tool card grid
    about.astro         ← MODIFY: prose layout
    privacy.astro       ← MODIFY: prose layout
astro.config.mjs        ← MODIFY: add tailwindcss vite plugin
```

**Design tokens** (used via CSS custom properties throughout):
- `--bg-base: #0d0b1e` — page background
- `--bg-surface: rgba(255,255,255,0.04)` — card surfaces
- `--border-subtle: rgba(139,92,246,0.2)` — default borders
- `--border-accent: rgba(139,92,246,0.5)` — dropzone dashed border
- `--purple-glow: rgba(109,40,217,0.3)` — hero radial glow
- Tailwind `violet-*` / `purple-*` scale covers accent buttons and text.

---

## Task 1: Install Tailwind CSS v4

**Files:**
- Modify: `astro.config.mjs`
- Create: `src/styles/global.css`

- [ ] **Step 1: Install the package**

Run from `C:\Users\kyleb\Claude Sessions\image-toolkit\`:
```bash
npm install -D tailwindcss @tailwindcss/vite
```
Expected: installs without error.

- [ ] **Step 2: Add the Vite plugin to `astro.config.mjs`**

Replace the entire file with:
```js
// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://REPLACE_WITH_DOMAIN',
  integrations: [preact(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
```

- [ ] **Step 3: Create `src/styles/global.css`**

```css
@import "tailwindcss";

:root {
  --bg-base: #0d0b1e;
  --bg-surface: rgba(255, 255, 255, 0.04);
  --bg-surface-hover: rgba(255, 255, 255, 0.07);
  --border-subtle: rgba(139, 92, 246, 0.2);
  --border-accent: rgba(139, 92, 246, 0.5);
  --purple-glow: rgba(109, 40, 217, 0.3);
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #6b7280;
  --success: #22c55e;
}

*, *::before, *::after {
  box-sizing: border-box;
}

body {
  background-color: var(--bg-base);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

/* Gradient text utility — used on headings and logo */
.gradient-text {
  background: linear-gradient(135deg, #ede9fe, #c4b5fd, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Purple glow button shadow */
.btn-glow {
  box-shadow: 0 4px 15px rgba(124, 58, 237, 0.4);
}

/* Animated progress bar fill */
@keyframes progress-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.progress-pulse {
  animation: progress-pulse 1.2s ease-in-out infinite;
}
```

- [ ] **Step 4: Verify Tailwind loads**

Run: `npx astro build`
Expected: build succeeds — no "Cannot find module tailwindcss" errors.

- [ ] **Step 5: Commit**

```bash
git add astro.config.mjs src/styles/global.css package.json package-lock.json
git commit -m "feat: install Tailwind CSS v4 with design tokens"
```

---

## Task 2: Style BaseLayout — header, footer, body

**Files:**
- Modify: `src/layouts/BaseLayout.astro`

- [ ] **Step 1: Replace `BaseLayout.astro` with the styled version**

```astro
---
interface Props { title: string; description: string; canonical?: string; }
const { title, description, canonical } = Astro.props;
const site = 'https://REPLACE_WITH_DOMAIN';
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
    {import.meta.env.PUBLIC_ADSENSE_CLIENT && (
      <script
        async
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${import.meta.env.PUBLIC_ADSENSE_CLIENT}`}
        crossorigin="anonymous"
      />
    )}
    <link rel="stylesheet" href="/src/styles/global.css" />
    <slot name="head" />
  </head>
  <body>
    <header class="sticky top-0 z-50 flex items-center justify-between px-6 py-4 border-b border-[--border-subtle] bg-[--bg-base]/95 backdrop-blur-sm">
      <a href="/" class="gradient-text font-bold text-base tracking-tight">⬡ HEIC Toolkit</a>
      <nav class="flex gap-5">
        <a href="/about" class="text-sm text-slate-400 hover:text-violet-400 transition-colors">About</a>
        <a href="/privacy" class="text-sm text-slate-400 hover:text-violet-400 transition-colors">Privacy</a>
      </nav>
    </header>
    <main>
      <slot />
    </main>
    <footer class="border-t border-[--border-subtle] px-6 py-5 flex flex-wrap items-center justify-between gap-3">
      <nav class="flex flex-wrap gap-4">
        <a href="/heic-to-jpg" class="text-xs text-slate-500 hover:text-violet-400 transition-colors">HEIC→JPG</a>
        <a href="/heic-to-png" class="text-xs text-slate-500 hover:text-violet-400 transition-colors">HEIC→PNG</a>
        <a href="/heic-to-pdf" class="text-xs text-slate-500 hover:text-violet-400 transition-colors">HEIC→PDF</a>
        <a href="/about" class="text-xs text-slate-500 hover:text-violet-400 transition-colors">About</a>
        <a href="/privacy" class="text-xs text-slate-500 hover:text-violet-400 transition-colors">Privacy</a>
      </nav>
      <p class="text-xs text-slate-600">All conversion happens in your browser. Your files are never uploaded.</p>
    </footer>
  </body>
</html>
```

**Note on CSS import:** Astro 6 + Tailwind v4 requires the CSS to be imported via a `<link>` tag pointing at the source file during dev, OR imported inside the component's `<style>` tag with `@import`. The most reliable approach for Astro is to import in the layout's `<style>` tag. If the `<link href="/src/styles/global.css">` approach causes 404s on the built site, replace it with a `<style>` block at the bottom of BaseLayout:
```astro
<style is:global>
  @import "../styles/global.css";
</style>
```

- [ ] **Step 2: Verify build and dev server**

Run: `npx astro build`
Expected: 0 errors. Check that `dist/index.html` contains `sticky top-0` in the header markup.

Run: `npm run dev`
Open http://localhost:4321 — header should be dark with purple gradient logo and sticky behavior.

- [ ] **Step 3: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat: style BaseLayout header and footer with Tailwind"
```

---

## Task 3: Style ToolShell island — dropzone, batch list, buttons

**Files:**
- Modify: `src/components/ToolShell.tsx`

- [ ] **Step 1: Replace `ToolShell.tsx` with the styled version**

```tsx
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
```

- [ ] **Step 2: Verify type-check**

Run: `npx astro check`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ToolShell.tsx
git commit -m "feat: style ToolShell with Tailwind dropzone and batch list"
```

---

## Task 4: Style ToolPage — hero, tabs, content section

**Files:**
- Modify: `src/components/ToolPage.astro`

The `tool.format` value is used to mark the active tab. The slug map: `jpg` → `/heic-to-jpg`, `png` → `/heic-to-png`, `pdf` → `/heic-to-pdf`.

- [ ] **Step 1: Replace `ToolPage.astro` with the styled version**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import ToolShell from './ToolShell.tsx';
import Faq from './Faq.astro';
import AdSlot from './AdSlot.astro';
import type { ToolContent } from '../content/tools';
interface Props { tool: ToolContent; }
const { tool } = Astro.props;

const tabs = [
  { label: 'HEIC → JPG', href: '/heic-to-jpg', format: 'jpg' },
  { label: 'HEIC → PNG', href: '/heic-to-png', format: 'png' },
  { label: 'HEIC → PDF', href: '/heic-to-pdf', format: 'pdf' },
] as const;
---
<BaseLayout title={tool.title} description={tool.description}>

  {/* Hero */}
  <div class="relative text-center px-6 pt-12 pb-8 overflow-hidden">
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,var(--purple-glow),transparent)] pointer-events-none" />
    <h1 class="relative gradient-text text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight mb-3">
      {tool.title}
    </h1>
    <p class="relative text-slate-400 text-sm max-w-md mx-auto leading-relaxed mb-3">
      {tool.intro}
    </p>
    <span class="inline-flex items-center gap-1.5 bg-violet-500/15 border border-violet-500/30 text-violet-300 text-xs px-3 py-1 rounded-full">
      🔒 Files never leave your device
    </span>
  </div>

  {/* Tool tabs */}
  <div class="flex gap-2 flex-wrap max-w-2xl mx-auto px-6 mb-6">
    {tabs.map((tab) => (
      <a
        href={tab.href}
        class={`text-xs font-semibold px-4 py-1.5 rounded-full border transition-all
          ${tool.format === tab.format
            ? 'bg-gradient-to-br from-violet-600 to-purple-600 border-transparent text-white'
            : 'border-violet-500/30 text-slate-400 hover:text-violet-300 hover:border-violet-500/50'
          }`}
      >
        {tab.label}
      </a>
    ))}
  </div>

  {/* Tool shell */}
  <div class="max-w-2xl mx-auto px-6 mb-8">
    <AdSlot adSlot="0000000001" />
    <ToolShell client:load format={tool.format} />
  </div>

  {/* SEO body copy */}
  <div class="max-w-2xl mx-auto px-6 mb-8 space-y-3">
    {tool.body.map((p) => (
      <p class="text-slate-500 text-sm leading-relaxed">{p}</p>
    ))}
    <AdSlot adSlot="0000000002" />
  </div>

  {/* FAQ */}
  <div class="max-w-2xl mx-auto px-6 pb-16">
    <Faq faq={tool.faq} />
  </div>

</BaseLayout>
```

- [ ] **Step 2: Verify build**

Run: `npx astro build`
Expected: 0 errors. `dist/heic-to-jpg/index.html` should contain `gradient-text` and `radial-gradient`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ToolPage.astro
git commit -m "feat: style ToolPage hero, tabs, and content layout"
```

---

## Task 5: Style Faq component

**Files:**
- Modify: `src/components/Faq.astro`

- [ ] **Step 1: Replace `Faq.astro` with the styled version**

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
  <h2 id="faq-heading" class="text-sm font-bold text-violet-400 uppercase tracking-wider mb-4">
    Frequently asked questions
  </h2>
  <dl>
    {faq.map((f) => (
      <div class="border-t border-[--border-subtle] py-4">
        <dt class="text-sm font-semibold text-slate-200 mb-1">{f.q}</dt>
        <dd class="text-sm text-slate-500 leading-relaxed">{f.a}</dd>
      </div>
    ))}
  </dl>
</section>
<script type="application/ld+json" is:inline set:html={JSON.stringify(jsonLd)} />
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Faq.astro
git commit -m "feat: style FAQ component"
```

---

## Task 6: Style home page — hero + tool card grid

**Files:**
- Modify: `src/pages/index.astro`

- [ ] **Step 1: Replace `index.astro` with the styled version**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';

const tools = [
  {
    href: '/heic-to-jpg',
    icon: '🖼',
    title: 'HEIC to JPG',
    description: 'Best compatibility — opens everywhere. Ideal for sharing and uploading.',
  },
  {
    href: '/heic-to-png',
    icon: '🎨',
    title: 'HEIC to PNG',
    description: 'Lossless quality with transparency support. Great for editing.',
  },
  {
    href: '/heic-to-pdf',
    icon: '📄',
    title: 'HEIC to PDF',
    description: 'Turn photos into documents for printing, emailing, or submitting.',
  },
];
---
<BaseLayout
  title="HEIC Toolkit — Free Private HEIC Converters"
  description="Convert iPhone HEIC photos to JPG, PNG, or PDF for free. 100% in your browser — your files are never uploaded."
>
  {/* Hero */}
  <div class="relative text-center px-6 pt-16 pb-10 overflow-hidden">
    <div class="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,var(--purple-glow),transparent)] pointer-events-none" />
    <h1 class="relative gradient-text text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-4">
      Free, private<br />HEIC converters
    </h1>
    <p class="relative text-slate-400 text-base max-w-md mx-auto leading-relaxed mb-4">
      Convert the HEIC photos your iPhone takes into formats that open everywhere.
      Every tool runs entirely in your browser — your files are never uploaded.
    </p>
    <span class="inline-flex items-center gap-1.5 bg-violet-500/15 border border-violet-500/30 text-violet-300 text-sm px-4 py-1.5 rounded-full">
      🔒 No upload · No account · No cost
    </span>
  </div>

  {/* Tool cards */}
  <div class="max-w-3xl mx-auto px-6 pb-20 grid grid-cols-1 sm:grid-cols-3 gap-4">
    {tools.map((tool) => (
      <a
        href={tool.href}
        class="group block bg-[--bg-surface] border border-[--border-subtle] rounded-2xl p-6
               hover:border-violet-500/40 hover:bg-[--bg-surface-hover] transition-all duration-200
               no-underline"
      >
        <div class="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center text-xl mb-4">
          {tool.icon}
        </div>
        <h2 class="text-base font-bold text-slate-200 mb-2 group-hover:text-violet-300 transition-colors">
          {tool.title}
        </h2>
        <p class="text-sm text-slate-500 leading-relaxed">{tool.description}</p>
        <span class="inline-block mt-4 text-xs font-semibold text-violet-400 group-hover:text-violet-300">
          Convert now →
        </span>
      </a>
    ))}
  </div>
</BaseLayout>
```

- [ ] **Step 2: Verify build**

Run: `npx astro build`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "feat: style home page with hero and tool card grid"
```

---

## Task 7: Style About and Privacy prose pages

**Files:**
- Modify: `src/pages/about.astro`, `src/pages/privacy.astro`

- [ ] **Step 1: Replace `about.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="About — HEIC Toolkit" description="About the HEIC Toolkit: free, private, in-browser image conversion.">
  <div class="max-w-2xl mx-auto px-6 py-12">
    <h1 class="gradient-text text-3xl font-extrabold tracking-tight mb-6">About HEIC Toolkit</h1>
    <div class="space-y-4 text-slate-400 text-sm leading-relaxed">
      <p>
        HEIC Toolkit is a free set of tools for converting Apple's HEIC photo format into JPG, PNG,
        and PDF. It exists because HEIC files often won't open on Windows, older Android devices,
        or many websites.
      </p>
      <p>
        Unlike most online converters, this site never uploads your files. All conversion runs
        locally in your browser using WebAssembly, so your photos stay on your device and the
        tools work offline once loaded.
      </p>
    </div>
  </div>
</BaseLayout>
```

- [ ] **Step 2: Replace `privacy.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="Privacy Policy — HEIC Toolkit" description="Privacy policy for HEIC Toolkit. Files are processed locally and never uploaded.">
  <div class="max-w-2xl mx-auto px-6 py-12">
    <h1 class="gradient-text text-3xl font-extrabold tracking-tight mb-6">Privacy Policy</h1>
    <div class="space-y-6 text-sm leading-relaxed">
      <p class="text-slate-200 font-semibold">
        Your files never leave your device. All image conversion happens locally in your browser.
        We do not upload, store, or transmit the images you convert.
      </p>
      <div>
        <h2 class="text-violet-400 font-bold text-base mb-2">Analytics and advertising</h2>
        <p class="text-slate-400">
          This site may use Google AdSense to display ads. Google and its partners may use cookies
          to serve ads based on your prior visits to this and other websites. You can opt out of
          personalized advertising via Google's Ads Settings.
        </p>
      </div>
      <div>
        <h2 class="text-violet-400 font-bold text-base mb-2">Contact</h2>
        <p class="text-slate-400">For questions about this policy, contact REPLACE_WITH_EMAIL.</p>
      </div>
    </div>
  </div>
</BaseLayout>
```

- [ ] **Step 3: Verify build**

Run: `npx astro build`
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/about.astro src/pages/privacy.astro
git commit -m "feat: style About and Privacy prose pages"
```

---

## Task 8: Final verification

**Files:** none changed

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: 13 tests pass (unit + integration). Styling changes don't touch logic.

- [ ] **Step 2: Build**

Run: `npx astro build`
Expected: 0 errors, 6 pages + sitemap emitted.

- [ ] **Step 3: Dev server smoke-test**

Run: `npm run dev`
Open each of these in a browser and visually confirm the purple gradient styling is applied:
- http://localhost:4321/ — home page, tool cards visible
- http://localhost:4321/heic-to-jpg — hero, tabs, dropzone
- http://localhost:4321/about — prose layout
- http://localhost:4321/privacy — prose layout

Resize to ~375px width (mobile) and confirm layout is readable and not broken.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final build verification for Tailwind styling"
```

Only commit if there are unstaged changes. If everything was committed per-task, skip this step.

---

## Definition of Done

- `npm test` passes (13/13).
- `npx astro build` emits 0 errors.
- All 6 pages visually match the approved purple gradient mockup.
- Mobile-responsive (no horizontal scroll at 375px).
- `data-testid` attributes on ToolShell unchanged (Playwright e2e still passes if run).
