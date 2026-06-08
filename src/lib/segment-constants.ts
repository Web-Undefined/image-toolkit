// Shared constants for the background-removal pipeline (u2netp / U^2-Net small).
export const INPUT_SIZE = 320;

// Standard U^2-Net per-channel normalization (RGB).
export const INPUT_MEAN = [0.485, 0.456, 0.406] as const;
export const INPUT_STD = [0.229, 0.224, 0.225] as const;

// Self-hosted asset locations (served from /public).
export const MODEL_URL = '/models/u2netp.onnx';
export const ORT_WASM_PATH = '/ort/';
