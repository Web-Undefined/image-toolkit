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

export type SniffedFormat = 'jpg' | 'png' | 'webp' | 'heic' | null;

export async function sniffImageFormat(file: File): Promise<SniffedFormat> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  // JPEG: FF D8 FF
  if (head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF) return 'jpg';
  // PNG: 89 50 4E 47
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4E && head[3] === 0x47) return 'png';
  // WebP: "RIFF" then "WEBP" at offset 8
  if (head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50) return 'webp';
  // HEIC: ftyp box + known brand
  const ftyp = String.fromCharCode(head[4], head[5], head[6], head[7]);
  if (ftyp === 'ftyp') {
    const brand = String.fromCharCode(head[8], head[9], head[10], head[11]);
    if (HEIC_BRANDS.includes(brand)) return 'heic';
  }
  return null;
}
