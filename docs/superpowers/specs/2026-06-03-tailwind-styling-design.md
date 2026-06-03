# Tailwind CSS Styling — Design Spec

**Date:** 2026-06-03
**Status:** Approved for planning

## 1. Goal

Apply Tailwind CSS to make the HEIC Toolkit look modern, sleek, and mobile-friendly. The approved visual direction is **Bold & Distinctive**: deep navy/purple dark background (`#0d0b1e`), purple gradient accents (`#7c3aed` → `#9333ea`), violet text gradients, and subtle glassmorphism-style surfaces. No new functionality — styling only.

## 2. Tailwind Setup

- **Version:** Tailwind CSS v4 via `@tailwindcss/vite` (compatible with Astro 6).
- **Install:** `npm install -D tailwindcss @tailwindcss/vite`
- **Config:** Add the Vite plugin to `astro.config.mjs` (no `tailwind.config.js` needed for v4 — config lives in a CSS file).
- **Global CSS:** `src/styles/global.css` — imports Tailwind, defines CSS custom properties for the design tokens (background, accent colors, gradients) that aren't in Tailwind's default palette, and sets base `body` styles.
- **Import:** `global.css` imported once in `BaseLayout.astro`.

## 3. Design Tokens (CSS custom properties)

```css
--bg-base: #0d0b1e;
--bg-surface: rgba(255,255,255,0.04);
--bg-surface-hover: rgba(255,255,255,0.07);
--border-subtle: rgba(139,92,246,0.2);
--border-accent: rgba(139,92,246,0.5);
--purple-glow: rgba(109,40,217,0.3);
--text-primary: #e2e8f0;
--text-secondary: #94a3b8;
--text-muted: #6b7280;
--success: #22c55e;
```

Tailwind's built-in `violet-*` and `purple-*` scale handles most accent colors. Custom properties fill the gaps (background, surfaces, borders with alpha).

## 4. Component Designs

### `BaseLayout.astro`
- `<body>`: dark bg (`#0d0b1e`), `text-slate-200`, `min-h-screen`.
- `<header>`: sticky top, `border-b border-[--border-subtle]`, logo as violet gradient text, nav links in `text-slate-400` with active `text-violet-400`.
- `<footer>`: `border-t border-[--border-subtle]`, small muted text, inline nav links.

### `ToolPage.astro`
- Hero section: radial purple glow behind the H1, gradient text heading, subtitle, privacy badge pill.
- Tool-switcher tabs: pill-shaped links for sibling tools (HEIC→JPG / PNG / PDF), active tab gets the purple gradient fill.
- Content section (SEO copy): `text-gray-500`, comfortable line-height.

### `ToolShell.tsx` (Preact island)
- **Dropzone:** dashed `border-[--border-accent]`, subtle purple gradient background, centered icon + CTA button. On drag-over: border brightens.
- **Batch list:** each item is a rounded card (`bg-[--bg-surface] border-[--border-subtle]`). Shows file name, size, status.
  - Processing: animated progress bar (`bg-gradient-to-r from-violet-600 to-purple-500`).
  - Done: green checkmark, download button.
  - Error: red error text.
- **Download-all button:** full-width, outlined violet, shown when 2+ done.
- **Primary button:** `bg-gradient-to-br from-violet-600 to-purple-600`, white text, violet glow shadow.

### `Faq.astro`
- Section heading in violet.
- Each Q/A separated by subtle `border-t border-[--border-subtle]`, question bold white, answer muted gray.

### `src/pages/index.astro` (home)
- Hero with gradient headline + privacy badge.
- Tool cards in a responsive grid (1 col mobile, 3 col desktop): each card has the glassmorphism surface, an icon, title, description, and a CTA link.

### `src/pages/about.astro` and `src/pages/privacy.astro`
- Simple centered prose layout, `max-w-2xl mx-auto`, consistent heading/body styles.

## 5. Mobile-first approach

All layouts use Tailwind's mobile-first breakpoints. Key breakpoints:
- Tool switcher tabs: wraps on mobile, inline on `sm:`.
- Batch list items: stack gracefully on narrow screens.
- Home page tool grid: `grid-cols-1 sm:grid-cols-3`.
- Nav: logo + hamburger on mobile (or just stacked links — no JS menu needed given only 2–3 links).

## 6. Scope

**In scope:** All visual styling across all pages and shared components. Tailwind setup.

**Out of scope:** New pages, new functionality, animation libraries, dark/light mode toggle (dark only), fonts beyond system sans-serif stack (no Google Fonts to keep the privacy story clean).

## 7. Files Changed

| File | Change |
|------|--------|
| `astro.config.mjs` | Add `@tailwindcss/vite` plugin |
| `package.json` | Add `tailwindcss` dev dep |
| `src/styles/global.css` | New — Tailwind import + CSS custom properties + base styles |
| `src/layouts/BaseLayout.astro` | Import global.css, Tailwind classes on header/footer/body |
| `src/components/ToolPage.astro` | Hero, tabs, content section layout |
| `src/components/ToolShell.tsx` | Dropzone, batch list, buttons |
| `src/components/Faq.astro` | FAQ styling |
| `src/pages/index.astro` | Hero + tool card grid |
| `src/pages/about.astro` | Prose layout |
| `src/pages/privacy.astro` | Prose layout |

`AdSlot.astro` needs no styling changes (renders nothing until AdSense is enabled).
