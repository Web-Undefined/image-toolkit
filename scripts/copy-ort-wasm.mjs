// Copies the onnxruntime-web WASM runtime files needed for the plain 'wasm'
// execution provider into public/ort/ so they are served from our own origin
// (no third-party CDN). Re-run after upgrading onnxruntime-web.
//
// We only copy the SIMD-threaded variant; the jsep/asyncify/jspi variants are
// for WebGPU/WebNN and alternative async mechanisms which we do not use.
// The ort.*.mjs CDN bundles are also excluded — Vite handles that JS.
import { mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, '..', 'node_modules', 'onnxruntime-web', 'dist');
const dest = join(root, '..', 'public', 'ort');

if (!existsSync(src)) {
  console.error(`onnxruntime-web not found at ${src}. Run "npm install" first.`);
  process.exit(1);
}

mkdirSync(dest, { recursive: true });

// Only the two files needed by the WASM execution provider at runtime.
const FILES = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.mjs',
];

for (const f of FILES) {
  copyFileSync(join(src, f), join(dest, f));
}
console.log(`Copied ${FILES.length} onnxruntime-web runtime files to public/ort/`);
