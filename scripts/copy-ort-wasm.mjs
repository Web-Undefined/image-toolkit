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
