import { zipSync } from 'fflate';

export async function zipBlobs(items: { name: string; blob: Blob }[]): Promise<Blob> {
  const entries: Record<string, Uint8Array> = {};
  for (const { name, blob } of items) {
    entries[name] = new Uint8Array(await blob.arrayBuffer());
  }
  const zipped = zipSync(entries);
  return new Blob([zipped], { type: 'application/zip' });
}
