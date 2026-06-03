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
