/** Decoded raw image: RGBA pixels, row-major. */
export interface RawImage {
  width: number;
  height: number;
  data: Uint8ClampedArray; // length === width * height * 4
}

export type OutputFormat = 'jpg' | 'png' | 'pdf';

export type BatchStatus = 'pending' | 'processing' | 'done' | 'error';

export interface BatchItem {
  id: string;
  file: File;
  status: BatchStatus;
  resultBlob?: Blob;
  resultName?: string;
  error?: string;
}

export interface CompressResult {
  blob: Blob;
  name: string;
  inputSize: number;   // bytes
  outputSize: number;  // bytes — never greater than inputSize
  alreadyOptimized: boolean;
}
