// Lazily loads onnxruntime-web and the u2netp session. The import() keeps
// onnxruntime-web out of the shared worker bundle until the first removal runs.
import { MODEL_URL, ORT_WASM_PATH, INPUT_SIZE } from './segment-constants';

// onnxruntime-web is loaded dynamically; its types aren't imported statically.
/* eslint-disable @typescript-eslint/no-explicit-any */
let ortNs: any = null;
let sessionPromise: Promise<any> | null = null;

async function load(): Promise<any> {
  const ort = await import('onnxruntime-web');
  ort.env.wasm.wasmPaths = ORT_WASM_PATH;
  ort.env.wasm.numThreads = 1; // single-threaded → no cross-origin-isolation headers needed
  ortNs = ort;
  return ort.InferenceSession.create(MODEL_URL, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}

function getSession(): Promise<any> {
  if (!sessionPromise) sessionPromise = load();
  return sessionPromise;
}

/** Run u2netp on a preprocessed NCHW tensor; returns the raw mask data. */
export async function runSegmentation(input: Float32Array): Promise<Float32Array> {
  const session = await getSession();
  const tensor = new ortNs.Tensor('float32', input, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const feeds: Record<string, unknown> = { [session.inputNames[0]]: tensor };
  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];
  return output.data as Float32Array;
}
