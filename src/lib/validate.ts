/** Max in-browser decode size; HEIC over this risks OOM on low-end devices. */
export const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1', 'heif'];

export async function isLikelyHeic(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  // bytes 4..8 must be "ftyp"
  const ftyp = String.fromCharCode(head[4], head[5], head[6], head[7]);
  if (ftyp !== 'ftyp') return false;
  const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
  return HEIC_BRANDS.includes(brand);
}

export function isWithinSizeLimit(file: File): boolean {
  return file.size <= MAX_BYTES;
}
