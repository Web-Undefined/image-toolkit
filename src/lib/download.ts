import { zipBlobs } from './zip';

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadAllZip(
  items: { name: string; blob: Blob }[],
  zipName: string,
): Promise<void> {
  const zip = await zipBlobs(items);
  downloadBlob(zip, zipName);
}
