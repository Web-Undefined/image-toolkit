// @ts-check
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  site: 'https://freeheicconverter.com',
  integrations: [preact(), sitemap()],

  vite: {
    plugins: [
      tailwindcss(),
      // onnxruntime-web ships several WASM variants for different backends.
      // Vite copies all of them into dist/client/_astro/ when it processes the
      // dynamic import('onnxruntime-web') in the worker. We override wasmPaths
      // to /ort/ at runtime, so those Vite-emitted files are never fetched —
      // but the jsep variant is 26 MB and exceeds Cloudflare Pages' 25 MiB
      // per-file limit. Delete unused variants from the bundle before writing.
      {
        name: 'exclude-ort-wasm-variants',
        generateBundle(_, bundle) {
          for (const key of Object.keys(bundle)) {
            if (
              key.includes('ort-wasm-simd-threaded.jsep') ||
              key.includes('ort-wasm-simd-threaded.asyncify') ||
              key.includes('ort-wasm-simd-threaded.jspi')
            ) {
              delete bundle[key];
            }
          }
        },
      },
    ],
    worker: {
      format: 'es',
    },
  },

  adapter: cloudflare(),
});